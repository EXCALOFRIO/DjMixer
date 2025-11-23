/**
 * Algoritmo A* para secuenciar canciones en una sesión DJ óptima
 */

import type { CancionAnalizada } from './db';
import type { MixPlanEntry } from './mix-planner';
import { findBestTransition, type TransitionResult } from './mix-transitions';

// Pesos para la puntuación de transiciones (deben sumar 1.0)
const W_TONALIDAD = 0.35;
const W_BPM = 0.25;
const W_ENERGIA = 0.15;
const W_MEZCLA = 0.25;

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
  const camelotA = trackA.tonalidad_camelot;
  const compatibleKeys = trackA.tonalidad_compatible || [];

  if (!camelotA || compatibleKeys.length === 0) {
    return 50; // Puntuación neutral si no hay datos
  }

  const camelotB = trackB.tonalidad_camelot;
  if (!camelotB) {
    return 50;
  }

  // Transición perfecta: la tonalidad de B está en las compatibles de A
  if (compatibleKeys.includes(camelotB)) {
    return 100;
  }

  // Transición aceptable: misma letra (energía similar) pero diferente número
  if (camelotA.endsWith('A') && camelotB.endsWith('A') || 
      camelotA.endsWith('B') && camelotB.endsWith('B')) {
    return 70;
  }

  // Transición pobre
  return 10;
}

/**
 * Calcula la puntuación de compatibilidad de BPM
 * Retorna -1 si la transición es imposible (>10% diferencia)
 */
function calculateBPMScore(trackA: CancionAnalizada, trackB: CancionAnalizada): number {
  const bpmA = trackA.bpm;
  const bpmB = trackB.bpm;

  if (!bpmA || !bpmB) {
    return 50; // Neutral si faltan datos
  }

  const diffPercent = Math.abs(bpmA - bpmB) / bpmA;

  // Imposible si la diferencia supera el 10%
  if (diffPercent > 0.10) {
    return -1;
  }

  // Escala inversa: 0% diferencia = 100 puntos, 10% diferencia = 0 puntos
  return 100 * (1 - diffPercent / 0.10);
}

/**
 * Calcula la puntuación de flujo de energía
 */
function calculateEnergyScore(trackA: CancionAnalizada, trackB: CancionAnalizada): number {
  const energyA = trackA.energia;
  const energyB = trackB.energia;

  if (energyA == null || energyB == null) {
    return 50;
  }

  const diffEnergy = energyB - energyA;

  // Transición muy suave (diferencia < 10%)
  if (Math.abs(diffEnergy) < 0.1) {
    return 100;
  }

  // Transición suave (diferencia < 25%)
  if (Math.abs(diffEnergy) < 0.25) {
    return 80;
  }

  // Subidón de energía (bueno pero no siempre deseable)
  if (diffEnergy > 0.25) {
    return 65;
  }

  // Bajón brusco (puede matar la pista de baile)
  return 40;
}

/**
 * Calcula la puntuación total de una transición entre dos tracks
 */
export function calculateTransitionScore(
  trackA: CancionAnalizada,
  trackB: CancionAnalizada,
  mixPlanA: MixPlanEntry,
  mixPlanB: MixPlanEntry
): { score: number; transition: TransitionResult | null } {
  // 1. Calcular puntuaciones individuales
  const harmonicScore = calculateHarmonicScore(trackA, trackB);
  const bpmScore = calculateBPMScore(trackA, trackB);

  // Si el BPM es incompatible, transición imposible
  if (bpmScore < 0) {
    return { score: -1, transition: null };
  }

  const energyScore = calculateEnergyScore(trackA, trackB);

  // 2. Encontrar la mejor transición posible usando el sistema de transiciones
  const bestTransition = findBestTransition(
    trackA,
    mixPlanA.bestExitPoints,
    trackB,
    mixPlanB.bestEntryPoints
  );

  if (!bestTransition) {
    // No hay transición viable
    return { score: -1, transition: null };
  }

  const mixScore = bestTransition.score;

  // 3. Calcular puntuación final ponderada
  const finalScore =
    harmonicScore * W_TONALIDAD +
    bpmScore * W_BPM +
    energyScore * W_ENERGIA +
    mixScore * W_MEZCLA;

  return { score: finalScore, transition: bestTransition };
}

/**
 * Heurística para A*: estimación optimista del coste restante
 */
function calculateHeuristic(state: AStarState, totalTracks: number): number {
  const remainingTracks = totalTracks - state.usedTrackIds.size;
  
  // Estimación optimista: asumimos que todas las transiciones restantes serán casi perfectas
  const OPTIMISTIC_TRANSITION_SCORE = 95;
  const OPTIMISTIC_COST_PER_TRACK = 100 - OPTIMISTIC_TRANSITION_SCORE;
  
  return remainingTracks * OPTIMISTIC_COST_PER_TRACK;
}

/**
 * Algoritmo A* para encontrar la mejor secuencia de canciones
 */
export function findOptimalSequence(
  tracks: CancionAnalizada[],
  mixPlans: Map<string, MixPlanEntry>,
  sessionLength: number,
  startTrackId?: string
): MixSession | null {
  console.log(`🎯 Iniciando A* con ${tracks.length} canciones, longitud objetivo: ${sessionLength}`);
  
  if (tracks.length === 0 || sessionLength < 2) {
    console.error('❌ Parámetros inválidos:', { tracksLength: tracks.length, sessionLength });
    return null;
  }

  // Priority queue ordenada por f_score (g + h)
  const openSet: Array<{ state: AStarState; fScore: number }> = [];
  
  // Seleccionar track inicial
  const startTrack = startTrackId 
    ? tracks.find(t => t.id === startTrackId) 
    : tracks[0];

  if (!startTrack) {
    console.error('❌ No se encontró canción inicial');
    return null;
  }

  console.log(`🎵 Canción inicial: ${startTrack.titulo} - ${startTrack.artista}`);

  // Estado inicial
  const initialState: AStarState = {
    currentTrackId: startTrack.id,
    usedTrackIds: new Set([startTrack.id]),
    path: [{
      track: startTrack,
      position: 0,
    }],
    gScore: 0,
  };

  const initialHeuristic = calculateHeuristic(initialState, sessionLength);
  openSet.push({ state: initialState, fScore: initialHeuristic });

  let bestCompleteSession: MixSession | null = null;
  let iterations = 0;
  const MAX_ITERATIONS = 10000; // Evitar bucles infinitos

  while (openSet.length > 0 && iterations < MAX_ITERATIONS) {
    iterations++;

    // Ordenar por f_score y sacar el mejor
    openSet.sort((a, b) => a.fScore - b.fScore);
    const { state: currentState } = openSet.shift()!;

    // ¿Hemos alcanzado la longitud deseada?
    if (currentState.usedTrackIds.size === sessionLength) {
      // Sesión completa encontrada
      const avgScore = currentState.gScore / (sessionLength - 1); // Score promedio por transición
      const totalScore = 100 - avgScore; // Convertir coste a puntuación

      const session: MixSession = {
        tracks: currentState.path,
        totalScore,
        avgTransitionScore: totalScore,
      };

      // Actualizar mejor sesión si es mejor que la actual
      if (!bestCompleteSession || totalScore > bestCompleteSession.totalScore) {
        bestCompleteSession = session;
      }

      continue; // Seguir buscando por si hay mejores caminos
    }

    // Explorar vecinos: todas las canciones no usadas
    const currentTrack = tracks.find(t => t.id === currentState.currentTrackId)!;
    const currentMixPlan = mixPlans.get(currentState.currentTrackId);

    if (!currentMixPlan) continue;

    for (const nextTrack of tracks) {
      if (currentState.usedTrackIds.has(nextTrack.id)) {
        continue; // Ya usada
      }

      const nextMixPlan = mixPlans.get(nextTrack.id);
      if (!nextMixPlan) continue;

      // Calcular puntuación de esta transición
      const { score: transitionScore, transition } = calculateTransitionScore(
        currentTrack,
        nextTrack,
        currentMixPlan,
        nextMixPlan
      );

      // Si la transición es imposible, saltarla
      if (transitionScore < 0 || !transition) {
        continue;
      }

      // Convertir puntuación (0-100) a coste (menor es mejor)
      const transitionCost = 100 - transitionScore;

      // Calcular nuevo g_score
      const newGScore = currentState.gScore + transitionCost;

      // Crear nuevo estado
      const newUsedIds = new Set(currentState.usedTrackIds);
      newUsedIds.add(nextTrack.id);

      const newState: AStarState = {
        currentTrackId: nextTrack.id,
        usedTrackIds: newUsedIds,
        path: [
          ...currentState.path,
          {
            track: nextTrack,
            position: currentState.path.length,
            transition,
            transitionScore,
          },
        ],
        gScore: newGScore,
      };

      // Calcular f_score
      const heuristic = calculateHeuristic(newState, sessionLength);
      const fScore = newGScore + heuristic;

      // Añadir a la cola
      openSet.push({ state: newState, fScore });
    }
  }

  if (iterations >= MAX_ITERATIONS) {
    console.warn('⚠️ A* alcanzó el límite de iteraciones');
  }

  console.log(`✅ A* completado en ${iterations} iteraciones`);
  
  return bestCompleteSession;
}
