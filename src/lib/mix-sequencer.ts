/**
 * Algoritmo A* para secuenciar canciones en una sesión DJ óptima
 */

import type { CancionAnalizada } from './db';
import type { MixPlanEntry } from './mix-planner';
import { findBestTransition, type TransitionResult } from './mix-transitions';

// Pesos ajustados para dar flexibilidad
const W_TONALIDAD = 0.30;
const W_BPM = 0.30;
const W_ENERGIA = 0.10;
const W_MEZCLA = 0.30;
// Valores configurables
const VARIETY_PENALTY_TYPE = 25; // Penalización por repetir el mismo tipo de transición
const VARIETY_PENALTY_STRATEGY = 15; // Penalización por repetir misma estrategia de salida
const DROP_SWAP_HARMONIC_THRESHOLD = 80; // Umbral armónico para considerar un DROP_SWAP seguro
const DROP_SWAP_HARMONIC_PENALIZED_SCORE = 10; // Score penalizado para DROP_SWAP disonante

export interface SequencedTrack {
  track: CancionAnalizada;
  position: number;
  transition?: TransitionResult; // Transición DESDE el track anterior
  transitionScore?: number;
}

export interface MixSession {
  tracks: SequencedTrack[];
  totalScore: number;
  avgTransitionScore: number;
  warnings?: string[];
}

interface AStarState {
  currentTrackId: string;
  usedTrackIds: Set<string>;
  path: SequencedTrack[];
  gScore: number; // Coste acumulado (menor es mejor)
}

/**
 * Calcula la puntuación de compatibilidad armónica usando Camelot Wheel
 */
function calculateHarmonicScore(trackA: CancionAnalizada, trackB: CancionAnalizada): number {
  const kA = trackA.tonalidad_camelot;
  const kB = trackB.tonalidad_camelot;
  
  if (!kA || !kB) return 50;
  if (kA === kB) return 100;
  
  // Lógica simplificada de Camelot
  const numA = parseInt(kA);
  const numB = parseInt(kB);
  const letterA = kA.slice(-1);
  const letterB = kB.slice(-1);

  if (isNaN(numA) || isNaN(numB)) return 40;

  // Adyacentes (+/- 1) o cambio de modo (misma letra o mismo numero diff letra)
  const diffNum = Math.abs(numA - numB);
  const isAdjacent = diffNum === 1 || diffNum === 11; // 12 vs 1
  
  if (isAdjacent && letterA === letterB) return 90;
  if (numA === numB && letterA !== letterB) return 80;
  
  // Energy boost (+2 semitonos, ej 1A -> 3A)
  if ((numB - numA === 2 || numB - numA === -10) && letterA === letterB) return 70;

  return 10; // Choque armónico
}

/**
 * Calcula la puntuación de compatibilidad de BPM (Tolerante)
 */
function calculateBPMScore(bpmA: number | null, bpmB: number | null): number {
  if (!bpmA || !bpmB) return 50;
  const diffPercent = (bpmB - bpmA) / bpmA; // % de cambio (positivo si sube)
  
  // Rango perfecto: +0% a +4% (Subir energía ligeramente es mejor)
  if (diffPercent >= 0 && diffPercent <= 0.04) return 100;
  // Rango bueno: -2% a 0% (Mantener o bajar muy poco)
  if (diffPercent >= -0.02 && diffPercent < 0) return 90;
  
  // Rango aceptable (valor absoluto)
  const absDiff = Math.abs(diffPercent);
  if (absDiff <= 0.08) return 60; 
  
  // Cambio drástico (>8%)
  return 20; 
}

/**
 * Calcula la puntuación de flujo de energía
 */
function calculateEnergyScore(eA?: number | null, eB?: number | null): number {
  if (eA === undefined || eA === null || eB === undefined || eB === null) return 50;
  const diff = eB - eA; // Si sube es positivo
  
  if (Math.abs(diff) < 0.1) return 100; // Maintain
  if (diff > 0 && diff < 0.3) return 90; // Build up suave
  if (diff < 0 && diff > -0.2) return 80; // Cool down suave
  if (diff > 0.4) return 40; // Subidón muy brusco
  if (diff < -0.4) return 30; // Bajón de energía (mata pista)
  
  return 60;
}

/**
 * Calcula la puntuación total de una transición entre dos tracks (Tolerante a fallos)
 */
export function calculateTransitionScore(
  trackA: CancionAnalizada,
  trackB: CancionAnalizada,
  mixPlanA: MixPlanEntry,
  mixPlanB: MixPlanEntry
): { score: number; transition: TransitionResult | null } {
  
  // 1. BPM Score (Con tolerancia)
  const bpmScore = calculateBPMScore(trackA.bpm, trackB.bpm);
  
  // 2. Harmonic Score
  const harmonicScore = calculateHarmonicScore(trackA, trackB);
  
  // 3. Energy Score
  const energyScore = calculateEnergyScore(trackA.energia, trackB.energia);

  // 4. Mix Transition Score (Usando la nueva lógica de estrategias)
  const mixResult = findBestTransition(trackA, mixPlanA.bestExitPoints, trackB, mixPlanB.bestEntryPoints);
  
  // Si findBestTransition devuelve null (raro con el fallback), penalizar pero no morir
  const mixScore = mixResult ? mixResult.score : 0;

  // God-mode guard: si vamos a hacer DROP_SWAP doble y la armonía es mala, penalizamos duro
  if (
    mixResult && 
    mixResult.exitPoint.strategy === 'DROP_SWAP' && 
    mixResult.entryPoint.strategy === 'DROP_SWAP' && 
    harmonicScore < DROP_SWAP_HARMONIC_THRESHOLD
  ) {
    return { score: DROP_SWAP_HARMONIC_PENALIZED_SCORE, transition: mixResult };
  }

  // Ponderación
  // Ponderación
  const total = 
    (bpmScore * W_BPM) +
    (harmonicScore * W_TONALIDAD) +
    (energyScore * W_ENERGIA) +
    (mixScore * W_MEZCLA);

  return { score: Math.round(total), transition: mixResult };
}

/**
 * Algoritmo A* para encontrar la mejor secuencia de canciones (Con fallback tolerante)
 */
export function findOptimalSequence(
  tracks: CancionAnalizada[],
  mixPlans: Map<string, MixPlanEntry>,
  sessionLength: number,
  startTrackId?: string
): MixSession {
  console.log(`🎯 Iniciando A* con ${tracks.length} canciones, longitud objetivo: ${sessionLength}`);
  
  // Validación básica
  if (tracks.length === 0) {
    return { tracks: [], totalScore: 0, avgTransitionScore: 0, warnings: ['No hay tracks'] };
  }
  
  // Asegurar que sessionLength no sea mayor que los tracks disponibles
  const targetLength = Math.min(sessionLength, tracks.length);

  // Seleccionar track inicial
  const startTrack = startTrackId 
    ? tracks.find(t => t.id === startTrackId) 
    : tracks[0];

  if (!startTrack) {
    return { tracks: [], totalScore: 0, avgTransitionScore: 0, warnings: ['Track inicial no encontrado'] };
  }

  console.log(`🎵 Canción inicial: ${startTrack.titulo}`);

  // Cola de prioridad (Open Set)
  const openSet: Array<{ state: AStarState; fScore: number }> = [];

  // Estado inicial
  const initialState: AStarState = {
    currentTrackId: startTrack.id,
    usedTrackIds: new Set([startTrack.id]),
    path: [{ track: startTrack, position: 0 }],
    gScore: 0,
  };

  openSet.push({ state: initialState, fScore: 0 });

  let bestPartialSession: MixSession | null = null;
  let iterations = 0;
  const MAX_ITERATIONS = 5000;

  while (openSet.length > 0 && iterations < MAX_ITERATIONS) {
    iterations++;
    
    // Ordenar para sacar el mejor candidato (menor costo fScore)
    openSet.sort((a, b) => a.fScore - b.fScore);
    const { state: currentState } = openSet.shift()!;

    // Guardar la mejor sesión parcial encontrada hasta ahora (Fallback)
    const currentSessionScore = 100 - (currentState.gScore / Math.max(1, currentState.path.length - 1));
    if (!bestPartialSession || currentState.path.length > bestPartialSession.tracks.length) {
      bestPartialSession = {
        tracks: currentState.path,
        totalScore: currentSessionScore,
        avgTransitionScore: currentSessionScore
      };
    }

    // CONDICIÓN DE ÉXITO: Longitud alcanzada
    if (currentState.path.length === targetLength) {
      console.log(`✅ Secuencia encontrada en ${iterations} iteraciones`);
      return bestPartialSession!;
    }

    const currentTrack = tracks.find(t => t.id === currentState.currentTrackId)!;
    const currentPlan = mixPlans.get(currentState.currentTrackId);

    // Expandir vecinos
    for (const nextTrack of tracks) {
      if (currentState.usedTrackIds.has(nextTrack.id)) continue;

      const nextPlan = mixPlans.get(nextTrack.id);
      if (!currentPlan || !nextPlan) continue;

      // Calcular Score
      const transitionData = calculateTransitionScore(currentTrack, nextTrack, currentPlan, nextPlan);
      // --- VARIETY PENALTY: penalizar repeticiones de tipo de transición/estrategia ---
      const lastStep = currentState.path[currentState.path.length - 1];
      if (lastStep && lastStep.transition && transitionData.transition) {
        // Penalty: mismo tipo de transición (ej QUICK_MIX → QUICK_MIX)
        if (lastStep.transition.type === transitionData.transition.type) {
          transitionData.score -= VARIETY_PENALTY_TYPE;
        }
        // Penalty: misma estrategia de salida repetida (ej DROP_SWAP repetido)
        if (lastStep.transition.exitPoint.strategy === transitionData.transition.exitPoint.strategy) {
          transitionData.score -= VARIETY_PENALTY_STRATEGY;
        }
      }
      
      // FILTRO RELAJADO: Solo descartar si el score es extremadamente bajo (< 5)
      // Antes devolvía -1 y mataba la rama. Ahora permitimos transiciones "malas" pero costosas.
      if (transitionData.score < 5) continue; 

      const cost = 100 - transitionData.score;
      const newGScore = currentState.gScore + cost;

      // Heurística simple: Cuantos más tracks falten, más "costo base" estimamos
      const remaining = targetLength - (currentState.path.length + 1);
      const heuristic = remaining * 10; // Asumimos un costo mínimo de 10 por transición futura
      
      const newState: AStarState = {
        currentTrackId: nextTrack.id,
        usedTrackIds: new Set(currentState.usedTrackIds).add(nextTrack.id),
        path: [...currentState.path, {
          track: nextTrack,
          position: currentState.path.length,
          transition: transitionData.transition || undefined,
          transitionScore: transitionData.score
        }],
        gScore: newGScore
      };

      openSet.push({ state: newState, fScore: newGScore + heuristic });
    }
  }

  console.warn('⚠️ No se encontró solución óptima completa. Devolviendo mejor parcial.');
  return bestPartialSession || { tracks: [], totalScore: 0, avgTransitionScore: 0, warnings: ['Fallo crítico en A*'] };
}
