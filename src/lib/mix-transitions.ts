/**
 * Sistema de transiciones DJ
 * Cada tipo de transición define cómo mezclar dos canciones
 */

import type { CancionAnalizada } from './db';
import type { CuePoint } from './mix-planner';

export interface TransitionResult {
  type: string;
  exitPoint: CuePoint;
  entryPoint: CuePoint;
  crossfadeDurationMs: number;
  score: number;
  details: {
    vocalOverlap: boolean;
    alignedToPhrase: boolean;
    description: string;
  };
}

export abstract class MixTransition {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly description: string;

  /**
   * Evalúa si esta transición es aplicable entre dos canciones
   * y devuelve la mejor configuración posible con su puntuación
   */
  abstract evaluate(
    trackA: CancionAnalizada,
    exitPoints: CuePoint[],
    trackB: CancionAnalizada,
    entryPoints: CuePoint[]
  ): TransitionResult | null;

  /**
   * Calcula la calidad de un crossfade basado en su duración
   */
  protected calculateCrossfadeScore(crossfadeMs: number, idealMs: number = 8000): number {
    const MIN_CROSSFADE = 3000;
    const MAX_CROSSFADE = 12000;

    if (crossfadeMs < MIN_CROSSFADE || crossfadeMs > MAX_CROSSFADE) {
      return 0;
    }

    // Puntuación máxima en el ideal, decae hacia los extremos
    const deviation = Math.abs(crossfadeMs - idealMs);
    const maxDeviation = Math.max(idealMs - MIN_CROSSFADE, MAX_CROSSFADE - idealMs);
    return 100 * (1 - deviation / maxDeviation);
  }
}

/**
 * TRANSICIÓN 1: Fade Out / Fade In Clásico
 * - No permite solapamiento de voces
 * - Alineado a frases musicales
 * - Duración del crossfade basada en márgenes vocales
 */
export class ClassicFadeTransition extends MixTransition {
  readonly id = 'classic-fade';
  readonly name = 'Fade Out/In Clásico';
  readonly description = 'Transición suave sin solapamiento de voces, alineada a frases';

  evaluate(
    trackA: CancionAnalizada,
    exitPoints: CuePoint[],
    trackB: CancionAnalizada,
    entryPoints: CuePoint[]
  ): TransitionResult | null {
    let bestTransition: TransitionResult | null = null;
    let bestScore = -1;

    // Probar todas las combinaciones de puntos de salida/entrada
    for (const exitPoint of exitPoints) {
      for (const entryPoint of entryPoints) {
        // Calcular duración del crossfade basada en márgenes vocales
        // Usamos el mínimo para evitar cortar voces en cualquiera de los dos tracks
        const crossfadeDurationMs = Math.min(
          exitPoint.vocalMarginMs,
          entryPoint.vocalMarginMs
        );

        // Validar que el crossfade sea viable
        if (crossfadeDurationMs < 3000) {
          continue; // Demasiado corto para un fade suave
        }

        if (crossfadeDurationMs > 12000) {
          // Limitar a 12 segundos máximo
          // crossfadeDurationMs = 12000; // Podríamos limitar o simplemente dar menos puntos
        }

        // Calcular puntuación del crossfade
        const crossfadeScore = this.calculateCrossfadeScore(crossfadeDurationMs);

        // Calcular puntuación combinada de los puntos
        // Los puntos ya tienen scores de 0-100 basados en calidad vocal + tipo de sección
        const pointsQualityScore = (exitPoint.score + entryPoint.score) / 2;

        // Puntuación final: calidad de puntos * calidad del crossfade
        const finalScore = pointsQualityScore * (crossfadeScore / 100);

        if (finalScore > bestScore) {
          bestScore = finalScore;
          bestTransition = {
            type: this.id,
            exitPoint,
            entryPoint,
            crossfadeDurationMs: Math.min(crossfadeDurationMs, 12000),
            score: finalScore,
            details: {
              vocalOverlap: false, // Esta transición NUNCA solapa voces
              alignedToPhrase: true, // Los puntos ya están alineados por alignToPhrase()
              description: `Fade de ${(Math.min(crossfadeDurationMs, 12000) / 1000).toFixed(1)}s sin solapamiento vocal`,
            },
          };
        }
      }
    }

    return bestTransition;
  }
}

/**
 * PLACEHOLDER PARA FUTURAS TRANSICIONES
 * Descomentar y implementar cuando estén listas
 */

/*
export class BeatMatchedTransition extends MixTransition {
  readonly id = 'beatmatch';
  readonly name = 'Beat Matching';
  readonly description = 'Sincronización de ritmos con posible solapamiento vocal';

  evaluate(
    trackA: CancionAnalizada,
    exitPoints: CuePoint[],
    trackB: CancionAnalizada,
    entryPoints: CuePoint[]
  ): TransitionResult | null {
    // TODO: Implementar beat matching
    // - Permite solapamiento vocal si los BPMs están sincronizados
    // - Mayor peso a downbeats_ts_ms para alineación perfecta
    return null;
  }
}

export class LoopTransition extends MixTransition {
  readonly id = 'loop';
  readonly name = 'Loop Transition';
  readonly description = 'Crea un loop en el track saliente para extender la mezcla';

  evaluate(
    trackA: CancionAnalizada,
    exitPoints: CuePoint[],
    trackB: CancionAnalizada,
    entryPoints: CuePoint[]
  ): TransitionResult | null {
    // TODO: Implementar loop transition
    // - Identifica secciones repetibles en trackA (frases_ts_ms)
    // - Extiende artificialmente la mezcla
    return null;
  }
}

export class QuickCutTransition extends MixTransition {
  readonly id = 'quick-cut';
  readonly name = 'Corte Rápido';
  readonly description = 'Transición instantánea en momento de impacto (drop/break)';

  evaluate(
    trackA: CancionAnalizada,
    exitPoints: CuePoint[],
    trackB: CancionAnalizada,
    entryPoints: CuePoint[]
  ): TransitionResult | null {
    // TODO: Implementar quick cut
    // - Busca eventos DJ (drops, breaks) en ambos tracks
    // - Corte instantáneo (crossfade < 100ms)
    return null;
  }
}
*/

/**
 * Registro de todas las transiciones disponibles
 * Añadir nuevas transiciones aquí cuando se implementen
 */
export const AVAILABLE_TRANSITIONS: MixTransition[] = [
  new ClassicFadeTransition(),
  // new BeatMatchedTransition(),
  // new LoopTransition(),
  // new QuickCutTransition(),
];

/**
 * Encuentra la mejor transición posible entre dos tracks
 * probando todos los tipos de transición disponibles
 */
export function findBestTransition(
  trackA: CancionAnalizada,
  exitPoints: CuePoint[],
  trackB: CancionAnalizada,
  entryPoints: CuePoint[]
): TransitionResult | null {
  let bestTransition: TransitionResult | null = null;
  let bestScore = -1;

  for (const transitionType of AVAILABLE_TRANSITIONS) {
    const result = transitionType.evaluate(trackA, exitPoints, trackB, entryPoints);

    if (result && result.score > bestScore) {
      bestScore = result.score;
      bestTransition = result;
    }
  }

  return bestTransition;
}
