import type { CancionAnalizada } from './db';
import type { CuePoint, CueStrategy, CrossfadeCurve, VocalType } from './mix-types';
import { clasificarTipoVocal } from './gemini-optimizer';

export interface TransitionResult {
  exitPoint: CuePoint;
  entryPoint: CuePoint;
  score: number;
  type: string;
  description: string;
  suggestedCurve?: CrossfadeCurve;
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

  let bestResult: TransitionResult | null = null;
  let bestScore = -1;

  // OPTIMIZACIÓN: Pre-filtrado inteligente
  // Si Track A sale con voz, solo buscamos entradas instrumentales en Track B
  // const exitHasVocal = exitPoints.filter(e => e.vocalType === 'MELODIC_VOCAL');

  for (const exit of exitPoints) {
    for (const entry of entryPoints) {

      // 1. VETO RÁPIDO: Choque Vocal Melódico Inmediato
      if (exit.vocalType === 'MELODIC_VOCAL' && entry.vocalType === 'MELODIC_VOCAL') {
        continue; // Imposible mezclar dos personas cantando a la vez
      }

      // 2. SIMULACIÓN TEMPORAL (La magia)
      // Simulamos 32 beats (aprox 60s) de mezcla
      const simulationScore = simulateMixTimeline(trackA, exit, trackB, entry);

      if (simulationScore <= 0) continue; // La mezcla falla a mitad de camino

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

  // Fallback: Si no hay ninguna combinación decente, permitir una de "emergencia" con score bajo
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
 * SIMULADOR DE MEZCLA (Adaptado para Reggaeton & Loops)
 * Comprueba compás a compás si ocurre un desastre
 */
function simulateMixTimeline(
  trackA: CancionAnalizada,
  exit: CuePoint,
  trackB: CancionAnalizada,
  entry: CuePoint
): number {
  const BPM = trackA.bpm || 120;
  const beatMs = 60000 / BPM;
  const barMs = beatMs * 4;

  // En Reggaeton las mezclas son más cortas (4 bloques de 4 compases = ~30s max)
  const simulationSteps = 4;
  let score = 100;
  let clashPenalty = 0;
  let flowBonus = 0;

  for (let i = 0; i < simulationSteps; i++) {
    const timeOffset = i * barMs * 4;

    // --- LÓGICA DE LOOP ---
    // Si estamos loopeando A, el tiempo de A NO AVANZA linealmente hacia el peligro.
    // Se mantiene dentro de su ventana segura (loopLengthMs).
    // Por tanto, su vocalType siempre será el del punto de loop (NONE).
    const isLoopingA = exit.strategy === 'LOOP_ANCHOR';

    // Posición en A: Si es loop, siempre es el punto de inicio (virtualmente).
    // Si no es loop, avanza y corre riesgo de chocar con voces futuras.
    const pointA = isLoopingA ? exit.pointMs : (exit.pointMs + timeOffset);

    // Posición en B: Siempre avanza (la canción entrante corre)
    const pointB = entry.pointMs + timeOffset;

    if (!isLoopingA && pointA > trackA.duracion_ms) break;
    if (pointB > trackB.duracion_ms) break;

    // Obtener estado vocal
    // Si está en loop, forzamos el estado del punto de loop (seguro)
    const vocalA = isLoopingA ? exit.vocalType : getVocalStateAt(pointA, trackA.segmentos_voz || []);
    const vocalB = getVocalStateAt(pointB, trackB.segmentos_voz || []);

    // 1. CHOQUE DE VOCES (Regla de Oro)
    if (vocalA === 'MELODIC_VOCAL' && vocalB === 'MELODIC_VOCAL') {
      return 0; // Fail absoluto
    }

    // 2. CHOQUE SUCIO (Verso sobre Chanteo)
    if (vocalA === 'MELODIC_VOCAL' && vocalB === 'RHYTHMIC_CHANT') {
      score -= 25;
    }

    // 3. BONUS: Bass Swap limpio
    // Si A está en loop (instrumental) y B trae el bajo fuerte (Drop)
    if (isLoopingA && i >= 1 && vocalB === 'RHYTHMIC_CHANT') {
      // Estamos dejando la base A y B entra con fuerza
      score += 5;
    }

    // REGLA DE ORO: CALL AND RESPONSE (La perfección)
    // Si A deja de cantar y B empieza a cantar en el siguiente bloque
    if (!isLoopingA) {
      const nextPointA = pointA + (barMs * 4);
      const nextPointB = pointB + (barMs * 4);
      const nextVocalA = getVocalStateAt(nextPointA, trackA.segmentos_voz || []);
      const nextVocalB = getVocalStateAt(nextPointB, trackB.segmentos_voz || []);

      if (vocalA === 'MELODIC_VOCAL' && nextVocalA === 'NONE' && nextVocalB === 'MELODIC_VOCAL') {
        flowBonus += 25; // ¡MAGIA! Relevo perfecto de voces
      }
    }
  }

  return Math.max(0, score - clashPenalty + flowBonus);
}

/**
 * Wrapper rápido para obtener estado vocal en un punto exacto
 */
function getVocalStateAt(ms: number, voces: any[]): VocalType {
  // Miramos una ventana de 2 segundos alrededor del punto
  const clasificacion = clasificarTipoVocal(ms, ms + 2000, voces);
  if (clasificacion === 'verso_denso') return 'MELODIC_VOCAL';
  if (clasificacion === 'chanteo_esporadico') return 'RHYTHMIC_CHANT';
  return 'NONE';
}

function calculateDeepScore(exit: CuePoint, entry: CuePoint, simScore: number): number {
  let score = simScore;

  // Preferencia: Instrumental sobre Vocal
  if (exit.vocalType === 'NONE' && entry.vocalType === 'MELODIC_VOCAL') score += 10;

  // Estrategia
  const strategyScore = getStrategyCompatibility(exit.strategy, entry.strategy);
  score = (score + strategyScore) / 2; // Promedio entre simulación y estrategia

  // Penalizar loops cortos repetitivos si la entrada es aburrida
  if (exit.strategy === 'LOOP_ANCHOR' && entry.strategy === 'INTRO_SIMPLE') score -= 5;

  return Math.min(100, Math.round(score));
}

function getStrategyCompatibility(exit: CueStrategy, entry: CueStrategy): number {
  // Matriz de Reggaeton

  // MEZCLA REINA: Loop en salida + Drop Swap en entrada
  // "Dejo la base de A en bucle, y te suelto el bajo de B de golpe"
  if (exit === 'LOOP_ANCHOR' && entry === 'DROP_SWAP') return 100;

  // MEZCLA CLÁSICA: Loop en salida + Intro simple
  if (exit === 'LOOP_ANCHOR' && entry === 'INTRO_SIMPLE') return 95;

  // QUICK MIX: Loop corto + Impacto
  if (exit === 'LOOP_ANCHOR' && entry === 'IMPACT_ENTRY') return 90;

  // Matriz de decisiones DJ (Original)
  if (exit === 'DROP_SWAP' && entry === 'DROP_SWAP') return 100; // Energía máxima
  if (exit === 'OUTRO_FADE' && entry === 'INTRO_SIMPLE') return 90; // Clásico y seguro
  if (exit === 'DROP_SWAP' && entry === 'BREAKDOWN_ENTRY') return 80; // Mantener flow
  if (exit === 'OUTRO_FADE' && entry === 'BREAKDOWN_ENTRY') return 70; // Aceptable
  if (exit === 'BREAKDOWN_ENTRY' && entry === 'INTRO_SIMPLE') return 75; // Natural
  if (exit === 'EVENT_SYNC' && entry === 'EVENT_SYNC') return 85; // Eventos alineados

  // Combinaciones raras
  if (exit === 'OUTRO_FADE' && entry === 'DROP_SWAP') return 30; // Demasiado salto de energía
  if (exit === 'DROP_SWAP' && entry === 'INTRO_SIMPLE') return 40; // Matar la energía

  return 50; // Neutro
}

function determineMixType(exit: CueStrategy, entry: CueStrategy): string {
  if (exit === 'DROP_SWAP' && entry === 'DROP_SWAP') return 'DOUBLE_DROP';
  if (exit === 'LOOP_ANCHOR') return 'LOOP_MIX';
  if (exit.includes('FADE') || entry.includes('INTRO')) return 'LONG_MIX';
  return 'QUICK_MIX';
}
