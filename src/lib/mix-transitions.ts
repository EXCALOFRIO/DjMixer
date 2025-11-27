/**
 * MIX TRANSITIONS - Simulador de Transiciones DJ
 * Adaptado para Timeline Unificado de Gemini
 * 
 * Usa has_vocals del timeline para detectar colisiones vocales
 * en lugar de arrays separados de voces
 */

import type { CancionAnalizada, TimelineSegment } from './db';
import type { CuePoint, CueStrategy, CrossfadeCurve, VocalType } from './mix-types';
import { parseTimeStringToMs } from './gemini-optimizer';

export interface TransitionResult {
  exitPoint: CuePoint;
  entryPoint: CuePoint;
  score: number;
  type: string;
  description: string;
  suggestedCurve?: CrossfadeCurve;
}

// Timeline normalizado con tiempos en MS
interface TimelineSegmentMs {
  tipo_seccion: TimelineSegment['tipo_seccion'];
  inicio_ms: number;
  fin_ms: number;
  has_vocals: boolean;
}

/**
 * Encuentra la mejor combinación posible entre los puntos de salida de A y entrada de B
 */
export function findBestTransition(
  trackA: CancionAnalizada,
  exitPoints: CuePoint[],
  trackB: CancionAnalizada,
  entryPoints: CuePoint[]
): TransitionResult | null {

  // Pre-procesar timelines para búsqueda rápida
  const timelineA = normalizeTimeline(trackA.timeline);
  const timelineB = normalizeTimeline(trackB.timeline);

  let bestResult: TransitionResult | null = null;
  let bestScore = -1;

  for (const exit of exitPoints) {
    for (const entry of entryPoints) {

      // 1. VETO RÁPIDO: Ambos tienen voz melódica en su punto de cue
      if (exit.vocalType === 'MELODIC_VOCAL' && entry.vocalType === 'MELODIC_VOCAL') {
        continue;
      }

      // 2. SIMULACIÓN TEMPORAL usando timeline unificado
      const simulationScore = simulateMixTimeline(
        trackA, exit, timelineA,
        trackB, entry, timelineB
      );

      if (simulationScore <= 0) continue;

      // 3. Puntuación Final
      const totalScore = calculateDeepScore(exit, entry, simulationScore);

      if (totalScore > bestScore) {
        bestScore = totalScore;
        bestResult = {
          exitPoint: exit,
          entryPoint: entry,
          score: totalScore,
          type: determineMixType(exit.strategy, entry.strategy),
          description: `${exit.strategy} ➔ ${entry.strategy}`,
          suggestedCurve: entry.suggestedCurve || exit.suggestedCurve || 'LINEAR'
        };
      }
    }
  }

  // Fallback: Corte de emergencia
  if (!bestResult && exitPoints.length > 0 && entryPoints.length > 0) {
    return {
      exitPoint: exitPoints[0],
      entryPoint: entryPoints[0],
      score: 10,
      type: 'CUT',
      description: 'Corte de emergencia (sin compatibilidad clara)',
      suggestedCurve: 'CUT'
    };
  }

  return bestResult;
}

/**
 * SIMULADOR DE MEZCLA usando Timeline Unificado
 * Comprueba compás a compás si ocurre colisión vocal
 */
function simulateMixTimeline(
  trackA: CancionAnalizada,
  exit: CuePoint,
  timelineA: TimelineSegmentMs[],
  trackB: CancionAnalizada,
  entry: CuePoint,
  timelineB: TimelineSegmentMs[]
): number {
  const BPM = trackA.bpm || 120;
  const beatMs = 60000 / BPM;
  const barMs = beatMs * 4;

  // Simulamos 4 bloques de 4 compases (~30s max)
  const simulationSteps = 4;
  let score = 100;
  let flowBonus = 0;

  for (let i = 0; i < simulationSteps; i++) {
    const timeOffset = i * barMs * 4;

    // Lógica de Loop: si estamos en loop, el tiempo de A no avanza
    const isLoopingA = exit.strategy === 'LOOP_ANCHOR';

    const pointA = isLoopingA ? exit.pointMs : (exit.pointMs + timeOffset);
    const pointB = entry.pointMs + timeOffset;

    if (!isLoopingA && pointA > trackA.duracion_ms) break;
    if (pointB > trackB.duracion_ms) break;

    // Obtener estado vocal desde el timeline
    const vocalA = isLoopingA 
      ? exit.vocalType 
      : getVocalStateFromTimeline(pointA, timelineA);
    const vocalB = getVocalStateFromTimeline(pointB, timelineB);

    // 1. CHOQUE DE VOCES MELÓDICAS = FAIL
    if (vocalA === 'MELODIC_VOCAL' && vocalB === 'MELODIC_VOCAL') {
      return 0;
    }

    // 2. CHOQUE SUCIO (Verso sobre Chanteo)
    if (vocalA === 'MELODIC_VOCAL' && vocalB === 'RHYTHMIC_CHANT') {
      score -= 25;
    }
    if (vocalA === 'RHYTHMIC_CHANT' && vocalB === 'MELODIC_VOCAL') {
      score -= 25;
    }

    // 3. BONUS: Loop instrumental + Drop entrada
    if (isLoopingA && i >= 1 && vocalB !== 'MELODIC_VOCAL') {
      score += 5;
    }

    // 4. CALL AND RESPONSE (Relevo de voces)
    if (!isLoopingA) {
      const nextPointA = pointA + (barMs * 4);
      const nextPointB = pointB + (barMs * 4);
      const nextVocalA = getVocalStateFromTimeline(nextPointA, timelineA);
      const nextVocalB = getVocalStateFromTimeline(nextPointB, timelineB);

      if (vocalA === 'MELODIC_VOCAL' && nextVocalA === 'NONE' && nextVocalB === 'MELODIC_VOCAL') {
        flowBonus += 25; // Relevo perfecto
      }
    }
  }

  return Math.max(0, score + flowBonus);
}

/**
 * Obtiene el estado vocal en un punto temporal desde el timeline
 */
function getVocalStateFromTimeline(ms: number, timeline: TimelineSegmentMs[]): VocalType {
  // Encontrar el segmento que contiene este punto
  const segment = timeline.find(seg => 
    ms >= seg.inicio_ms && ms < seg.fin_ms
  );

  if (!segment) {
    // Fuera de rango, asumir no hay voz
    return 'NONE';
  }

  if (!segment.has_vocals) {
    return 'NONE';
  }

  // Clasificar tipo de vocal según la sección
  // Versos tienden a ser melódicos, estribillos pueden tener chanteo
  switch (segment.tipo_seccion) {
    case 'verso':
    case 'puente':
      return 'MELODIC_VOCAL';
    case 'estribillo':
    case 'outro':
      return 'RHYTHMIC_CHANT'; // Más tolerante en estribillos
    default:
      return 'MELODIC_VOCAL'; // Default conservador
  }
}

function calculateDeepScore(exit: CuePoint, entry: CuePoint, simScore: number): number {
  let score = simScore;

  // Preferencia: Instrumental sobre Vocal
  if (exit.vocalType === 'NONE' && entry.vocalType === 'MELODIC_VOCAL') score += 10;
  if (exit.vocalType === 'NONE' && entry.vocalType === 'NONE') score += 5;

  // Estrategia
  const strategyScore = getStrategyCompatibility(exit.strategy, entry.strategy);
  score = (score + strategyScore) / 2;

  // Penalizar loops cortos + entrada aburrida
  if (exit.strategy === 'LOOP_ANCHOR' && entry.strategy === 'INTRO_SIMPLE') score -= 5;

  return Math.min(100, Math.round(score));
}

function getStrategyCompatibility(exit: CueStrategy, entry: CueStrategy): number {
  // Matriz de Reggaeton/Latin

  // MEZCLA REINA: Loop + Drop Swap
  if (exit === 'LOOP_ANCHOR' && entry === 'DROP_SWAP') return 100;

  // MEZCLA CLÁSICA: Loop + Intro
  if (exit === 'LOOP_ANCHOR' && entry === 'INTRO_SIMPLE') return 95;

  // QUICK MIX: Loop + Impacto
  if (exit === 'LOOP_ANCHOR' && entry === 'IMPACT_ENTRY') return 90;

  // Loop + Breakdown
  if (exit === 'LOOP_ANCHOR' && entry === 'BREAKDOWN_ENTRY') return 88;

  // Matriz DJ clásica
  if (exit === 'DROP_SWAP' && entry === 'DROP_SWAP') return 100;
  if (exit === 'OUTRO_FADE' && entry === 'INTRO_SIMPLE') return 90;
  if (exit === 'DROP_SWAP' && entry === 'BREAKDOWN_ENTRY') return 80;
  if (exit === 'OUTRO_FADE' && entry === 'BREAKDOWN_ENTRY') return 70;
  if (exit === 'BREAKDOWN_ENTRY' && entry === 'INTRO_SIMPLE') return 75;
  if (exit === 'BREAKDOWN_ENTRY' && entry === 'BREAKDOWN_ENTRY') return 70;

  // Combinaciones sub-óptimas
  if (exit === 'OUTRO_FADE' && entry === 'DROP_SWAP') return 30;
  if (exit === 'DROP_SWAP' && entry === 'INTRO_SIMPLE') return 40;

  return 50; // Neutro
}

function determineMixType(exit: CueStrategy, entry: CueStrategy): string {
  if (exit === 'DROP_SWAP' && entry === 'DROP_SWAP') return 'DOUBLE_DROP';
  if (exit === 'LOOP_ANCHOR') return 'LOOP_MIX';
  if (exit === 'OUTRO_FADE' || entry === 'INTRO_SIMPLE') return 'LONG_MIX';
  return 'QUICK_MIX';
}

// --- UTILIDADES ---

function normalizeTimeline(data: TimelineSegment[] | string | null | undefined): TimelineSegmentMs[] {
  const arr = normalizeArray<TimelineSegment>(data);
  return arr
    .filter(s => s && typeof s.inicio === 'string' && typeof s.fin === 'string')
    .map(s => ({
      tipo_seccion: s.tipo_seccion,
      inicio_ms: parseTimeStringToMs(s.inicio),
      fin_ms: parseTimeStringToMs(s.fin),
      has_vocals: s.has_vocals ?? false,
    }));
}

function normalizeArray<T>(data: T[] | string | null | undefined): T[] {
  if (!data) return [];
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return Array.isArray(data) ? data : [];
}
