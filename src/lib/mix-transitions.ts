import type { CancionAnalizada } from './db';
import type { CuePoint, CueStrategy, CrossfadeCurve } from './mix-planner';

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

  for (const exit of exitPoints) {
    for (const entry of entryPoints) {
      const evaluation = evaluateTransitionPoints(exit, entry);
      
      if (evaluation.score > bestScore) {
        bestScore = evaluation.score;
        bestResult = {
          exitPoint: exit,
          entryPoint: entry,
          score: evaluation.score,
          type: evaluation.type,
          description: evaluation.description
          , suggestedCurve: evaluation.suggestedCurve
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
      description: 'Corte de emergencia (sin compatibilidad clara)'
      , suggestedCurve: 'CUT'
    };
  }

  return bestResult;
}

function evaluateTransitionPoints(exit: CuePoint, entry: CuePoint): { score: number; type: string; description: string; suggestedCurve?: CrossfadeCurve } {
  // 1. VETO: Choque de voces (regla de oro)
  if (exit.hasVocalOverlap && entry.hasVocalOverlap) {
    return { score: 0, type: 'CLASH', description: 'Choque vocal' };
  }

  let score = 0;
  let type = 'MIX';
  let suggestedCurve: CrossfadeCurve | undefined = undefined;
  
  // 2. Matriz de Compatibilidad de Estrategias
  const strategyScore = getStrategyCompatibility(exit.strategy, entry.strategy);
  score += strategyScore;

  // 3. Duración segura (cuánto tiempo tenemos para mezclar)
  const overlapTime = Math.min(exit.safeDurationMs, entry.safeDurationMs);
  
  if (overlapTime > 16000) score += 10; // Muy cómodo
  else if (overlapTime < 4000) score -= 20; // Muy apretado (rush mixing)

  // 4. Bonificación por Alineación de Frases
  if (exit.alignedToPhrase && entry.alignedToPhrase) {
    score += 15;
  }

  // 5. Penalización por Drop Swap al inicio (Observación del usuario)
  // Si la entrada es DROP_SWAP pero el punto es < 5 segundos, es raro
  if (entry.strategy === 'DROP_SWAP' && entry.pointMs < 5000) {
    score -= 30; // Penalizar fuertemente, probablemente sea un falso positivo
  }

  // Normalizar score entre 0 y 100
  // Proponer curva sugerida: preferir la indicada en entry/exit si existe
  if (!suggestedCurve) {
    if (entry.suggestedCurve) suggestedCurve = entry.suggestedCurve;
    else if (exit.suggestedCurve) suggestedCurve = exit.suggestedCurve;
    else if (exit.strategy === 'DROP_SWAP' && entry.strategy === 'DROP_SWAP') suggestedCurve = 'BASS_SWAP';
    else if (entry.strategy === 'IMPACT_ENTRY' || exit.strategy === 'IMPACT_ENTRY') suggestedCurve = 'CUT';
    else if (exit.strategy === 'OUTRO_FADE' && entry.strategy === 'INTRO_SIMPLE') suggestedCurve = 'LINEAR';
    else suggestedCurve = 'LINEAR';
  }

  return { 
    score: Math.min(Math.max(score, 0), 100),
    type: determineMixType(exit.strategy, entry.strategy),
    description: `${exit.strategy} ➔ ${entry.strategy}`
    , suggestedCurve
  };
}

function getStrategyCompatibility(exit: CueStrategy, entry: CueStrategy): number {
  // Matriz de decisiones DJ
  if (exit === 'DROP_SWAP' && entry === 'DROP_SWAP') return 100; // Energía máxima
  if (exit === 'OUTRO_FADE' && entry === 'INTRO_SIMPLE') return 90; // Clásico y seguro
  if (exit === 'DROP_SWAP' && entry === 'BREAKDOWN_ENTRY') return 80; // Mantener flow
  if (exit === 'OUTRO_FADE' && entry === 'BREAKDOWN_ENTRY') return 70; // Aceptable
  if (exit === 'BREAKDOWN_ENTRY' && entry === 'INTRO_SIMPLE') return 75; // Natural
  if (exit === 'EVENT_SYNC' && entry === 'EVENT_SYNC') return 85; // Eventos alineados
  if (exit === 'LOOP_ANCHOR' && entry === 'INTRO_SIMPLE') return 65; // Loop extendido
  
  // Combinaciones raras
  if (exit === 'OUTRO_FADE' && entry === 'DROP_SWAP') return 30; // Demasiado salto de energía
  if (exit === 'DROP_SWAP' && entry === 'INTRO_SIMPLE') return 40; // Matar la energía
  
  return 50; // Neutro
}

function determineMixType(exit: CueStrategy, entry: CueStrategy): string {
  if (exit === 'DROP_SWAP' && entry === 'DROP_SWAP') return 'DOUBLE_DROP';
  if (exit.includes('FADE') || entry.includes('INTRO')) return 'LONG_MIX';
  return 'QUICK_MIX';
}
