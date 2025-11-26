import type {
  CancionAnalizada,
  HuecoInstrumental,
  EstructuraMusical,
  LoopTransicion
} from './db';
import { clasificarTipoVocal, parseTimeStringToMs } from './gemini-optimizer';
import type {
  CuePoint,
  CueStrategy,
  CrossfadeCurve,
  VocalType,
  FrequencyFocus
} from './mix-types';

// Tipos importados de mix-types.ts

export interface MixPlanEntry {
  trackId: string;
  hash: string;
  title: string;
  durationMs: number;
  bestEntryPoints: CuePoint[];
  bestExitPoints: CuePoint[];
}

// Local types with MS for calculations
interface HuecoWithMs {
  inicio_ms: number;
  fin_ms: number;
  tipo: 'instrumental_puro' | 'voz_principal_residuo';
}

interface EstructuraWithMs {
  tipo_seccion: EstructuraMusical['tipo_seccion'];
  inicio_ms: number;
  fin_ms: number;
}

// Configuración de pesos
const WEIGHTS = {
  INSTRUMENTAL_PURE: 1.5,     // Multiplicador para huecos puros
  EVENT_ALIGNMENT: 2.0,       // Multiplicador si se alinea a un evento DJ
  PHRASE_ALIGNMENT: 1.2,      // Multiplicador si cae en frase exacta
  VOCAL_CLASH_PENALTY: 0.1,   // Penalización brutal si choca voz
  INTRO_BONUS: 1.3,           // Bonus para intros reales
  OUTRO_BONUS: 1.3,           // Bonus para outros reales
};

const MIN_MIX_WINDOW_MS = 4000; // Mínimo 4 segundos para mezclar
const PRE_EVENT_ROLLBACK_MS = 16000; // ~16s antes del evento para build-up (2 bloques de 8 compases)
const IMPACT_ENTRY_THRESHOLD_MS = 5000; // Si el drop está antes de esto, es IMPACT en vez de SWAP
const MAX_ENTRY_POSITION = 0.4; // 40% de la canción
const MIN_EXIT_POSITION = 0.6; // 60% de la canción

export function buildMixPlan(tracks: CancionAnalizada[]): MixPlanEntry[] {
  return tracks.map(track => {
    // Normalizar datos si vienen como strings JSON del CSV
    // Normalizar datos si vienen como strings JSON del CSV
    const huecosRaw = normalizeArray<HuecoInstrumental>(track.huecos_analizados);
    const huecos: HuecoWithMs[] = huecosRaw.map(h => ({
      ...h,
      inicio_ms: parseTimeStringToMs(h.inicio),
      fin_ms: parseTimeStringToMs(h.fin)
    }));

    const voces: Array<{ start_ms: number; end_ms: number }> = [];

    const estructuraRaw = normalizeEstructura(track.estructura_ts);
    const estructura: EstructuraWithMs[] = estructuraRaw.map(s => ({
      tipo_seccion: s.tipo_seccion,
      inicio_ms: parseTimeStringToMs(s.inicio),
      fin_ms: parseTimeStringToMs(s.fin)
    }));
    const frases = normalizeNumericArray(track.frases_ts_ms);

    // Calcular puntos
    const entryPoints = findSophisticatedEntryPoints(
      track,
      huecos,
      voces,
      estructura,
      frases
    );

    const exitPoints = findSophisticatedExitPoints(
      track,
      huecos,
      voces,
      estructura,
      frases
    );

    console.log(`📊 MixPlan para "${track.titulo}":`);
    console.log(`  🎯 ${entryPoints.length} puntos de entrada (top score: ${entryPoints[0]?.score ?? 0})`);
    console.log(`  🚪 ${exitPoints.length} puntos de salida (top score: ${exitPoints[0]?.score ?? 0})`);

    return {
      trackId: track.id,
      hash: track.hash_archivo,
      title: track.titulo,
      durationMs: track.duracion_ms,
      bestEntryPoints: entryPoints.sort((a, b) => b.score - a.score).slice(0, 5),
      bestExitPoints: exitPoints.sort((a, b) => b.score - a.score).slice(0, 5),
    };
  });
}

/**
 * LÓGICA DE ENTRADA MEJORADA
 * Busca: Intros limpias, Breaks instrumentales y Alineación con Drops
 */
function findSophisticatedEntryPoints(
  track: CancionAnalizada,
  huecos: HuecoWithMs[],
  voces: Array<{ start_ms: number; end_ms: number }>,
  estructura: EstructuraWithMs[],
  frases: number[]
): CuePoint[] {
  const candidates: CuePoint[] = [];
  const maxEntryMs = track.duracion_ms * MAX_ENTRY_POSITION;

  // 1. ANÁLISIS DE HUECOS (La base segura)
  huecos.forEach(hueco => {
    if (hueco.inicio_ms > maxEntryMs) return;

    // Alinear al inicio de frase más cercano DENTRO del hueco
    const alignedStart = findNearestPhraseStart(hueco.inicio_ms, frases, 2000);
    const effectiveStart = alignedStart ?? hueco.inicio_ms;
    const safeDuration = hueco.fin_ms - effectiveStart;

    if (safeDuration >= MIN_MIX_WINDOW_MS) {
      // NOVEDAD: Determinar qué pasa INMEDIATAMENTE después de entrar
      // Miramos 16 compases adelante (aprox 30s)
      const lookAheadEnd = effectiveStart + 30000;

      // Analizar si entra voz pronto
      const vocalTypeInRange = analyzeVocalTexture(effectiveStart, lookAheadEnd, voces);

      let score = 70; // Base score decente

      // Bonificaciones
      if (hueco.tipo === 'instrumental_puro') score *= WEIGHTS.INSTRUMENTAL_PURE;
      if (alignedStart) score *= WEIGHTS.PHRASE_ALIGNMENT;
      if (effectiveStart < 30000) score *= WEIGHTS.INTRO_BONUS;

      // Detectar si está en una intro estructural
      const isInIntro = estructura.some(s =>
        s.tipo_seccion === 'intro' &&
        effectiveStart >= s.inicio_ms &&
        effectiveStart <= s.fin_ms
      );

      // Calcular alineación a grid de 8 compases
      const gridAlignment = snapTo8BarGrid(effectiveStart, track.bpm, track.downbeats_ts_ms || []);

      candidates.push({
        trackId: track.id,
        hash: track.hash_archivo,
        title: track.titulo,
        pointMs: effectiveStart,
        type: 'IN',
        strategy: isInIntro ? 'INTRO_SIMPLE' : 'BREAKDOWN_ENTRY',
        score: Math.min(Math.round(score), 100),
        safeDurationMs: safeDuration,
        hasVocalOverlap: false,
        alignedToPhrase: !!alignedStart,
        alignedToBar: gridAlignment.alignedToBar,
        alignedTo8BarGrid: gridAlignment.alignedTo8Bar,
        sectionType: hueco.tipo,
        suggestedCurve: 'LINEAR',
        // Nuevos campos
        vocalType: vocalTypeInRange,
        freqFocus: hueco.tipo === 'instrumental_puro' ? 'HIGH' : 'MID',
      });
    }
  });

  // 2. ANÁLISIS DE EVENTOS eliminado (eventos_clave_dj ya no se usa)

  // 3. FALLBACK: Si no hay huecos ni eventos, usar estructura
  if (candidates.length === 0) {
    estructura.forEach(section => {
      if (section.inicio_ms > maxEntryMs) return;

      const isGoodEntry = ['intro', 'solo_instrumental'].includes(section.tipo_seccion);
      if (!isGoodEntry) return;

      const alignedPoint = findNearestPhraseStart(section.inicio_ms, frases, 2000);
      const finalPoint = alignedPoint ?? section.inicio_ms;
      const vocalClash = checkVocalOverlap(finalPoint, section.fin_ms, voces);

      let score = 50;
      if (section.tipo_seccion === 'intro') score = 60;
      if (!vocalClash) score += 20;
      if (alignedPoint) score *= WEIGHTS.PHRASE_ALIGNMENT;

      const gridAlignment = snapTo8BarGrid(finalPoint, track.bpm, track.downbeats_ts_ms || []);

      candidates.push({
        trackId: track.id,
        hash: track.hash_archivo,
        title: track.titulo,
        pointMs: finalPoint,
        type: 'IN',
        strategy: 'INTRO_SIMPLE',
        score: Math.min(Math.round(score), 100),
        safeDurationMs: section.fin_ms - finalPoint,
        hasVocalOverlap: vocalClash,
        alignedToPhrase: !!alignedPoint,
        alignedToBar: gridAlignment.alignedToBar,
        alignedTo8BarGrid: gridAlignment.alignedTo8Bar,
        sectionType: section.tipo_seccion,
        suggestedCurve: 'LINEAR',
        vocalType: vocalClash ? 'MELODIC_VOCAL' : 'NONE',
        freqFocus: 'HIGH',
      });
    });
  }

  return candidates;
}

/**
 * LÓGICA DE SALIDA MEJORADA
 * Busca: Outros, Final de Coros, Antes de Drops (para hacer switch) y LOOPS
 */
function findSophisticatedExitPoints(
  track: CancionAnalizada,
  huecos: HuecoWithMs[],
  voces: Array<{ start_ms: number; end_ms: number }>,
  estructura: EstructuraWithMs[],
  frases: number[]
): CuePoint[] {
  const candidates: CuePoint[] = [];
  const minExitMs = track.duracion_ms * MIN_EXIT_POSITION;

  // 1. BUSCADOR DE LOOPS (Micro-huecos instrumentales)
  // Estrategia "Safety Loop" para Reggaeton/Quick Mix
  huecos.forEach(hueco => {
    if (hueco.inicio_ms < minExitMs) return;

    const duration = hueco.fin_ms - hueco.inicio_ms;
    const beatMs = track.bpm ? 60000 / track.bpm : 500; // Default 120bpm
    const barMs = beatMs * 4;

    // ¿Cabe un loop de 4 compases? (Ideal)
    if (duration >= barMs * 4) {
      addLoopCandidate(candidates, track, hueco, barMs * 4, '4_BAR');
    }
    // ¿Cabe un loop de 1 compás? (Rescate)
    else if (duration >= barMs) {
      addLoopCandidate(candidates, track, hueco, barMs, '1_BAR');
    }
  });

  // 2. ESTRATEGIA: OUTROS LIMPIOS (Huecos al final)
  huecos.forEach(hueco => {
    if (hueco.inicio_ms < minExitMs) return;

    const alignedStart = findNearestPhraseStart(hueco.inicio_ms, frases, 2000);
    const effectiveStart = alignedStart ?? hueco.inicio_ms;
    const safeDuration = hueco.fin_ms - effectiveStart;

    if (safeDuration >= MIN_MIX_WINDOW_MS) {
      let score = 80;
      if (hueco.tipo === 'instrumental_puro') score *= WEIGHTS.INSTRUMENTAL_PURE;
      if (alignedStart) score *= WEIGHTS.PHRASE_ALIGNMENT;

      const proximityToEnd = (effectiveStart - minExitMs) / (track.duracion_ms - minExitMs);
      if (proximityToEnd > 0.7) score *= WEIGHTS.OUTRO_BONUS;

      const isInOutro = estructura.some(s =>
        s.tipo_seccion === 'outro' &&
        effectiveStart >= s.inicio_ms &&
        effectiveStart <= s.fin_ms
      );

      const gridAlignment = snapTo8BarGrid(effectiveStart, track.bpm, track.downbeats_ts_ms || []);

      candidates.push({
        trackId: track.id,
        hash: track.hash_archivo,
        title: track.titulo,
        pointMs: effectiveStart,
        type: 'OUT',
        strategy: isInOutro ? 'OUTRO_FADE' : 'BREAKDOWN_ENTRY',
        score: Math.min(Math.round(score), 100),
        safeDurationMs: safeDuration,
        hasVocalOverlap: false,
        alignedToPhrase: !!alignedStart,
        alignedToBar: gridAlignment.alignedToBar,
        alignedTo8BarGrid: gridAlignment.alignedTo8Bar,
        sectionType: hueco.tipo,
        suggestedCurve: 'LINEAR',
        vocalType: 'NONE',
        freqFocus: 'HIGH',
      });
    }
  });

  // 3. ESTRATEGIA: POST-CHORUS / PRE-DROP eliminado (eventos_clave_dj ya no se usa)

  return candidates;
}

/**
 * Helper para analizar qué tipo de amenaza vocal existe en un rango
 */
function analyzeVocalTexture(start: number, end: number, voces: Array<{ start_ms: number; end_ms: number }>): VocalType {
  const clasificacion = clasificarTipoVocal(start, end, voces);
  if (clasificacion === 'verso_denso') return 'MELODIC_VOCAL';
  if (clasificacion === 'chanteo_esporadico') return 'RHYTHMIC_CHANT';
  return 'NONE';
}

function addLoopCandidate(
  candidates: CuePoint[],
  track: CancionAnalizada,
  hueco: HuecoWithMs,
  loopSizeMs: number,
  type: '1_BAR' | '4_BAR'
) {
  // Alinear el inicio del loop al grid
  const grid = snapToBarGrid(hueco.inicio_ms, track.bpm, track.downbeats_ts_ms || []);

  // Verificar que el loop cabe dentro del hueco tras alinear
  if (grid.alignedMs + loopSizeMs <= hueco.fin_ms) {
    candidates.push({
      trackId: track.id,
      hash: track.hash_archivo,
      title: track.titulo,
      pointMs: grid.alignedMs,
      type: 'OUT',
      strategy: 'LOOP_ANCHOR', // ¡Estrategia Clave!
      score: type === '4_BAR' ? 95 : 85, // 4 barras mejor que 1, pero ambas sirven
      safeDurationMs: 999999, // INFINITO (porque está en loop)
      isLoopable: true,
      loopLengthMs: loopSizeMs,
      loopType: type,
      vocalType: 'NONE', // En el loop no hay voz
      freqFocus: 'HIGH', // Suele ser hi-hats/snare
      hasVocalOverlap: false,
      alignedToPhrase: true,
      alignedToBar: true,
      alignedTo8BarGrid: false,
      suggestedCurve: 'LINEAR'
    });
  }
}

/**
 * Calcula la alineación a grid de 1 compás (4 beats)
 */
function snapToBarGrid(
  pointMs: number,
  bpm: number | null,
  downbeats: number[]
): { alignedMs: number; alignedToBar: boolean } {
  if (!bpm || !downbeats || downbeats.length === 0) {
    return { alignedMs: pointMs, alignedToBar: false };
  }

  const msPerBeat = 60000 / bpm;
  const msPerBar = msPerBeat * 4;
  const firstDownbeat = downbeats[0] || 0;
  const relativeTime = pointMs - firstDownbeat;
  const barsPassed = Math.round(relativeTime / msPerBar);
  const alignedBarMs = firstDownbeat + (barsPassed * msPerBar);

  const tolerance = msPerBeat * 1.5;
  const distToBar = Math.abs(pointMs - alignedBarMs);

  if (distToBar < tolerance) {
    return { alignedMs: Math.max(0, alignedBarMs), alignedToBar: true };
  }

  return { alignedMs: pointMs, alignedToBar: false };
}

// --- UTILIDADES ---

/**
 * Calcula la alineación a grid de 8 compases (32 beats)
 * Esta es la unidad fundamental de fraseo en música de baile electrónica
 */
function snapTo8BarGrid(
  pointMs: number,
  bpm: number | null,
  downbeats: number[]
): { alignedMs: number; alignedToBar: boolean; alignedTo8Bar: boolean } {
  // Valores por defecto si no hay datos
  if (!bpm || !downbeats || downbeats.length === 0) {
    return { alignedMs: pointMs, alignedToBar: false, alignedTo8Bar: false };
  }

  const msPerBeat = 60000 / bpm;
  const msPerBar = msPerBeat * 4; // 4 beats = 1 compás
  const msPer8Bars = msPerBar * 8; // 32 beats = bloque de 8 compases

  // Encontrar el primer downbeat
  const firstDownbeat = downbeats[0] || 0;

  // Calcular cuántos bloques de 8 compases han pasado
  const relativeTime = pointMs - firstDownbeat;

  const phrasesPassed = Math.round(relativeTime / msPer8Bars);
  const aligned8BarMs = firstDownbeat + (phrasesPassed * msPer8Bars);

  const barsPassed = Math.round(relativeTime / msPerBar);
  const alignedBarMs = firstDownbeat + (barsPassed * msPerBar);

  // Tolerancia: 2 beats por defecto (mejor perceptual)
  const tolerance = msPerBeat * 2;
  const distTo8Bar = Math.abs(pointMs - aligned8BarMs);
  const distToBar = Math.abs(pointMs - alignedBarMs);

  // Priorizar 8-bar si está cerca
  if (distTo8Bar < tolerance) {
    return { alignedMs: Math.max(0, aligned8BarMs), alignedToBar: true, alignedTo8Bar: true };
  }

  // Alinear al compás si está cerca
  if (distToBar < tolerance) {
    return { alignedMs: Math.max(0, alignedBarMs), alignedToBar: true, alignedTo8Bar: false };
  }

  return { alignedMs: Math.max(0, pointMs), alignedToBar: false, alignedTo8Bar: false };
}

/**
 * Busca la frase más cercana al punto objetivo (snap to grid musical)
 */
function findNearestPhraseStart(
  targetMs: number,
  phrases: number[],
  toleranceMs: number
): number | null {
  if (!phrases.length) return null;

  const closest = phrases.reduce((prev, curr) => {
    return Math.abs(curr - targetMs) < Math.abs(prev - targetMs) ? curr : prev;
  });

  return Math.abs(closest - targetMs) <= toleranceMs ? closest : null;
}

/**
 * Verifica si hay solapamiento vocal en un rango de tiempo
 */
function checkVocalOverlap(
  startMs: number,
  endMs: number,
  vocalSegments: Array<{ start_ms: number; end_ms: number }>
): boolean {
  return vocalSegments.some(seg => {
    const overlaps =
      (seg.start_ms >= startMs && seg.start_ms < endMs) ||
      (seg.end_ms > startMs && seg.end_ms <= endMs) ||
      (seg.start_ms <= startMs && seg.end_ms >= endMs);

    return overlaps;
  });
}

/**
 * Normaliza arrays que pueden venir como JSON string o ya parseados
 */
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

function normalizeNumericArray(data: number[] | string | null | undefined): number[] {
  const arr = normalizeArray<number>(data);
  return arr.filter(v => typeof v === 'number' && Number.isFinite(v));
}



function normalizeEstructura(data: EstructuraMusical[] | string | null | undefined): EstructuraMusical[] {
  return normalizeArray<EstructuraMusical>(data)
    .filter(s =>
      s &&
      typeof s.inicio === 'string' &&
      typeof s.fin === 'string' &&
      typeof s.tipo_seccion === 'string'
    );
}
