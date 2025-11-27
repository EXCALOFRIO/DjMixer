/**
 * MIX PLANNER - Planificador de Mezclas DJ
 * Adaptado para Timeline Unificado de Gemini
 * 
 * El timeline ahora es la FUENTE ÚNICA DE VERDAD:
 * - Cada segmento tiene: tipo_seccion, has_vocals, inicio, fin, descripcion
 * - Los huecos instrumentales se derivan de has_vocals === false
 * - La estructura se deriva directamente del timeline
 */

import type {
  CancionAnalizada,
  TimelineSegment,
  LoopTransicion
} from './db';
import { parseTimeStringToMs } from './gemini-optimizer';
import type {
  CuePoint,
  CueStrategy,
  FrequencyFocus
} from './mix-types';

export interface MixPlanEntry {
  trackId: string;
  hash: string;
  title: string;
  durationMs: number;
  bestEntryPoints: CuePoint[];
  bestExitPoints: CuePoint[];
}

// Segmento con tiempos en MS para cálculos internos
interface TimelineSegmentMs {
  tipo_seccion: TimelineSegment['tipo_seccion'];
  inicio_ms: number;
  fin_ms: number;
  has_vocals: boolean;
  descripcion?: string;
}

// Configuración de pesos para scoring
const WEIGHTS = {
  INSTRUMENTAL_PURE: 1.5,     // Bonus para segmentos sin voz
  PHRASE_ALIGNMENT: 1.2,      // Bonus si cae en frase exacta
  INTRO_BONUS: 1.4,           // Bonus para intros
  OUTRO_BONUS: 1.4,           // Bonus para outros
  BREAKDOWN_BONUS: 1.3,       // Bonus para breakdowns
};

const MIN_MIX_WINDOW_MS = 4000;   // Mínimo 4 segundos para mezclar
const MAX_ENTRY_POSITION = 0.40;  // Entradas en el primer 40%
const MIN_EXIT_POSITION = 0.55;   // Salidas después del 55%

/**
 * Construye el plan de mezcla para un conjunto de canciones
 */
export function buildMixPlan(tracks: CancionAnalizada[]): MixPlanEntry[] {
  return tracks.map(track => {
    // Normalizar datos a formato interno
    // Timeline: viene como "mm:ss.d" -> convertir a ms
    // frases_ts_ms, downbeats_ts_ms: ya están en ms pero pueden ser string JSON
    const timeline = normalizeTimeline(track.timeline);
    const frases = normalizeNumericArray(track.frases_ts_ms);
    const downbeats = normalizeNumericArray(track.downbeats_ts_ms);
    const loops = normalizeLoops(track.loops_transicion);

    // Calcular puntos de entrada y salida
    const entryPoints = findEntryPoints(track, timeline, frases, downbeats, loops);
    const exitPoints = findExitPoints(track, timeline, frases, downbeats, loops);

    console.log(`📊 MixPlan para "${track.titulo}":`);
    console.log(`  📍 Timeline: ${timeline.length} segmentos`);
    console.log(`  🎯 ${entryPoints.length} puntos de entrada (top: ${entryPoints[0]?.score ?? 0})`);
    console.log(`  🚪 ${exitPoints.length} puntos de salida (top: ${exitPoints[0]?.score ?? 0})`);

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
 * PUNTOS DE ENTRADA - Dónde podemos empezar a meter la canción B
 */
function findEntryPoints(
  track: CancionAnalizada,
  timeline: TimelineSegmentMs[],
  frases: number[],
  downbeats: number[],
  _loops: Array<{ inicio_ms: number; fin_ms: number; texto: string }>
): CuePoint[] {
  const candidates: CuePoint[] = [];
  const maxEntryMs = track.duracion_ms * MAX_ENTRY_POSITION;

  // 1. BUSCAR SEGMENTOS INSTRUMENTALES (has_vocals === false)
  timeline
    .filter(seg => !seg.has_vocals && seg.inicio_ms < maxEntryMs)
    .forEach(seg => {
      const duration = seg.fin_ms - seg.inicio_ms;
      if (duration < MIN_MIX_WINDOW_MS) return;

      // Alinear al inicio de frase más cercano
      const alignedStart = findNearestPhraseStart(seg.inicio_ms, frases, 2000);
      const effectiveStart = alignedStart ?? seg.inicio_ms;
      const safeDuration = seg.fin_ms - effectiveStart;

      if (safeDuration < MIN_MIX_WINDOW_MS) return;

      let score = 75;
      score *= WEIGHTS.INSTRUMENTAL_PURE;
      if (alignedStart) score *= WEIGHTS.PHRASE_ALIGNMENT;

      // Bonus por tipo de sección
      if (seg.tipo_seccion === 'intro') score *= WEIGHTS.INTRO_BONUS;
      if (seg.tipo_seccion === 'solo_instrumental') score *= WEIGHTS.BREAKDOWN_BONUS;

      const gridAlignment = snapTo8BarGrid(effectiveStart, track.bpm, downbeats);
      const strategy = determineEntryStrategy(seg, effectiveStart);

      candidates.push(createCuePoint(track, {
        pointMs: effectiveStart,
        type: 'IN',
        strategy,
        score: Math.min(Math.round(score), 100),
        safeDurationMs: safeDuration,
        hasVocalOverlap: false,
        alignedToPhrase: !!alignedStart,
        alignedToBar: gridAlignment.alignedToBar,
        alignedTo8BarGrid: gridAlignment.alignedTo8Bar,
        sectionType: seg.tipo_seccion,
        vocalType: 'NONE',
        freqFocus: getFreqFocus(seg.tipo_seccion),
        suggestedCurve: 'LINEAR',
      }));
    });

  // 2. BUSCAR INICIO DE SECCIONES CON VOZ SUAVE (verso después de intro)
  timeline
    .filter((seg, idx) => {
      if (!seg.has_vocals || seg.inicio_ms >= maxEntryMs || seg.tipo_seccion !== 'verso') return false;
      const previousSeg = timeline[idx - 1];
      return previousSeg && !previousSeg.has_vocals; // Debe venir de instrumental
    })
    .forEach(seg => {
      const alignedStart = findNearestPhraseStart(seg.inicio_ms, frases, 2000);
      const effectiveStart = alignedStart ?? seg.inicio_ms;

      // Ventana segura más corta
      const nextChorus = timeline.find(s => 
        s.inicio_ms > seg.inicio_ms && s.tipo_seccion === 'estribillo'
      );
      const safeDuration = nextChorus 
        ? nextChorus.inicio_ms - effectiveStart 
        : seg.fin_ms - effectiveStart;

      let score = 55;
      if (alignedStart) score *= WEIGHTS.PHRASE_ALIGNMENT;

      const gridAlignment = snapTo8BarGrid(effectiveStart, track.bpm, downbeats);

      candidates.push(createCuePoint(track, {
        pointMs: effectiveStart,
        type: 'IN',
        strategy: 'BREAKDOWN_ENTRY',
        score: Math.min(Math.round(score), 100),
        safeDurationMs: Math.min(safeDuration, 30000),
        hasVocalOverlap: true,
        alignedToPhrase: !!alignedStart,
        alignedToBar: gridAlignment.alignedToBar,
        alignedTo8BarGrid: gridAlignment.alignedTo8Bar,
        sectionType: seg.tipo_seccion,
        vocalType: 'MELODIC_VOCAL',
        freqFocus: 'MID',
        suggestedCurve: 'LINEAR',
      }));
    });

  // 3. FALLBACK: Si no hay buenos puntos, usar el inicio
  if (candidates.length === 0) {
    candidates.push(createCuePoint(track, {
      pointMs: 0,
      type: 'IN',
      strategy: 'INTRO_SIMPLE',
      score: 30,
      safeDurationMs: Math.min(track.duracion_ms * 0.2, 20000),
      hasVocalOverlap: timeline[0]?.has_vocals ?? false,
      alignedToPhrase: true,
      alignedToBar: true,
      alignedTo8BarGrid: true,
      sectionType: 'intro',
      vocalType: timeline[0]?.has_vocals ? 'MELODIC_VOCAL' : 'NONE',
      freqFocus: 'HIGH',
      suggestedCurve: 'LINEAR',
    }));
  }

  return candidates;
}

/**
 * PUNTOS DE SALIDA - Dónde podemos empezar a sacar la canción A
 */
function findExitPoints(
  track: CancionAnalizada,
  timeline: TimelineSegmentMs[],
  frases: number[],
  downbeats: number[],
  _loops: Array<{ inicio_ms: number; fin_ms: number; texto: string }>
): CuePoint[] {
  const candidates: CuePoint[] = [];
  const minExitMs = track.duracion_ms * MIN_EXIT_POSITION;

  // 1. BUSCAR SEGMENTOS INSTRUMENTALES PARA SALIDA Y LOOPS
  timeline
    .filter(seg => !seg.has_vocals && seg.inicio_ms >= minExitMs)
    .forEach(seg => {
      const duration = seg.fin_ms - seg.inicio_ms;
      const beatMs = track.bpm ? 60000 / track.bpm : 500;
      const barMs = beatMs * 4;

      // Loop de 4 compases
      if (duration >= barMs * 4) {
        const loopCandidate = createLoopCandidate(track, seg, barMs * 4, '4_BAR', frases, downbeats);
        if (loopCandidate) candidates.push(loopCandidate);
      }
      // Loop de 1 compás
      else if (duration >= barMs) {
        const loopCandidate = createLoopCandidate(track, seg, barMs, '1_BAR', frases, downbeats);
        if (loopCandidate) candidates.push(loopCandidate);
      }

      // Punto de salida normal (fade)
      if (duration >= MIN_MIX_WINDOW_MS) {
        const alignedStart = findNearestPhraseStart(seg.inicio_ms, frases, 2000);
        const effectiveStart = alignedStart ?? seg.inicio_ms;

        let score = 75;
        score *= WEIGHTS.INSTRUMENTAL_PURE;
        if (alignedStart) score *= WEIGHTS.PHRASE_ALIGNMENT;
        if (seg.tipo_seccion === 'outro') score *= WEIGHTS.OUTRO_BONUS;

        const gridAlignment = snapTo8BarGrid(effectiveStart, track.bpm, downbeats);

        candidates.push(createCuePoint(track, {
          pointMs: effectiveStart,
          type: 'OUT',
          strategy: seg.tipo_seccion === 'outro' ? 'OUTRO_FADE' : 'BREAKDOWN_ENTRY',
          score: Math.min(Math.round(score), 100),
          safeDurationMs: seg.fin_ms - effectiveStart,
          hasVocalOverlap: false,
          alignedToPhrase: !!alignedStart,
          alignedToBar: gridAlignment.alignedToBar,
          alignedTo8BarGrid: gridAlignment.alignedTo8Bar,
          sectionType: seg.tipo_seccion,
          vocalType: 'NONE',
          freqFocus: getFreqFocus(seg.tipo_seccion),
          suggestedCurve: 'LINEAR',
        }));
      }
    });

  // 2. BUSCAR FINAL DE ESTRIBILLOS (Para DROP_SWAP)
  timeline
    .filter(seg => seg.tipo_seccion === 'estribillo' && seg.fin_ms >= minExitMs)
    .forEach(seg => {
      const exitPoint = seg.fin_ms;
      const nextSeg = timeline.find(s => s.inicio_ms >= exitPoint);

      if (nextSeg && !nextSeg.has_vocals) {
        const alignedStart = findNearestPhraseStart(exitPoint, frases, 2000);
        const effectiveStart = alignedStart ?? exitPoint;

        let score = 80;
        if (alignedStart) score *= WEIGHTS.PHRASE_ALIGNMENT;

        const gridAlignment = snapTo8BarGrid(effectiveStart, track.bpm, downbeats);

        candidates.push(createCuePoint(track, {
          pointMs: effectiveStart,
          type: 'OUT',
          strategy: 'DROP_SWAP',
          score: Math.min(Math.round(score), 100),
          safeDurationMs: nextSeg.fin_ms - effectiveStart,
          hasVocalOverlap: false,
          alignedToPhrase: !!alignedStart,
          alignedToBar: gridAlignment.alignedToBar,
          alignedTo8BarGrid: gridAlignment.alignedTo8Bar,
          sectionType: 'post_chorus',
          vocalType: 'NONE',
          freqFocus: 'LOW',
          suggestedCurve: 'BASS_SWAP',
        }));
      }
    });

  // 3. OUTRO (con o sin voces)
  const outroSeg = timeline.find(seg => seg.tipo_seccion === 'outro');
  if (outroSeg && outroSeg.inicio_ms >= minExitMs) {
    const alignedStart = findNearestPhraseStart(outroSeg.inicio_ms, frases, 2000);
    const effectiveStart = alignedStart ?? outroSeg.inicio_ms;

    let score = 65;
    if (!outroSeg.has_vocals) score += 15;
    if (alignedStart) score *= WEIGHTS.PHRASE_ALIGNMENT;

    const gridAlignment = snapTo8BarGrid(effectiveStart, track.bpm, downbeats);

    candidates.push(createCuePoint(track, {
      pointMs: effectiveStart,
      type: 'OUT',
      strategy: 'OUTRO_FADE',
      score: Math.min(Math.round(score), 100),
      safeDurationMs: outroSeg.fin_ms - effectiveStart,
      hasVocalOverlap: outroSeg.has_vocals,
      alignedToPhrase: !!alignedStart,
      alignedToBar: gridAlignment.alignedToBar,
      alignedTo8BarGrid: gridAlignment.alignedTo8Bar,
      sectionType: 'outro',
      vocalType: outroSeg.has_vocals ? 'RHYTHMIC_CHANT' : 'NONE',
      freqFocus: 'HIGH',
      suggestedCurve: 'LINEAR',
    }));
  }

  // 4. FALLBACK
  if (candidates.length === 0) {
    const lastMs = track.duracion_ms - 15000;
    candidates.push(createCuePoint(track, {
      pointMs: Math.max(minExitMs, lastMs),
      type: 'OUT',
      strategy: 'OUTRO_FADE',
      score: 25,
      safeDurationMs: 15000,
      hasVocalOverlap: true,
      alignedToPhrase: false,
      alignedToBar: false,
      alignedTo8BarGrid: false,
      sectionType: 'outro',
      vocalType: 'MELODIC_VOCAL',
      freqFocus: 'MID',
      suggestedCurve: 'LINEAR',
    }));
  }

  return candidates;
}

/**
 * Crea un candidato de LOOP para salida
 */
function createLoopCandidate(
  track: CancionAnalizada,
  seg: TimelineSegmentMs,
  loopSizeMs: number,
  loopType: '1_BAR' | '4_BAR',
  frases: number[],
  downbeats: number[]
): CuePoint | null {
  const alignedStart = findNearestPhraseStart(seg.inicio_ms, frases, 2000);
  const effectiveStart = alignedStart ?? seg.inicio_ms;

  if (effectiveStart + loopSizeMs > seg.fin_ms) return null;

  const gridAlignment = snapTo8BarGrid(effectiveStart, track.bpm, downbeats);

  return createCuePoint(track, {
    pointMs: effectiveStart,
    type: 'OUT',
    strategy: 'LOOP_ANCHOR',
    score: loopType === '4_BAR' ? 95 : 85,
    safeDurationMs: 999999,
    hasVocalOverlap: false,
    alignedToPhrase: !!alignedStart,
    alignedToBar: gridAlignment.alignedToBar,
    alignedTo8BarGrid: gridAlignment.alignedTo8Bar,
    sectionType: seg.tipo_seccion,
    vocalType: 'NONE',
    freqFocus: 'HIGH',
    suggestedCurve: 'LINEAR',
    isLoopable: true,
    loopLengthMs: loopSizeMs,
    loopType,
  });
}

/**
 * Helper para crear CuePoint
 */
function createCuePoint(
  track: CancionAnalizada,
  params: Omit<CuePoint, 'trackId' | 'hash' | 'title'>
): CuePoint {
  return {
    trackId: track.id,
    hash: track.hash_archivo,
    title: track.titulo,
    ...params,
  };
}

/**
 * Determina la estrategia de entrada
 */
function determineEntryStrategy(seg: TimelineSegmentMs, pointMs: number): CueStrategy {
  if (seg.tipo_seccion === 'intro') return 'INTRO_SIMPLE';
  if (seg.tipo_seccion === 'solo_instrumental') return 'BREAKDOWN_ENTRY';
  if (seg.tipo_seccion === 'subidon_build_up') return 'DROP_SWAP';
  if (pointMs < 10000) return 'INTRO_SIMPLE';
  return 'BREAKDOWN_ENTRY';
}

/**
 * Obtiene el foco de frecuencia
 */
function getFreqFocus(tipo: string): FrequencyFocus {
  switch (tipo) {
    case 'intro':
    case 'outro':
      return 'HIGH';
    case 'estribillo':
    case 'subidon_build_up':
      return 'LOW';
    case 'verso':
    case 'puente':
      return 'MID';
    default:
      return 'FULL';
  }
}

/**
 * Alineación a grid de 8 compases
 */
function snapTo8BarGrid(
  pointMs: number,
  bpm: number | null,
  downbeats: number[]
): { alignedMs: number; alignedToBar: boolean; alignedTo8Bar: boolean } {
  if (!bpm || !downbeats || downbeats.length === 0) {
    return { alignedMs: pointMs, alignedToBar: false, alignedTo8Bar: false };
  }

  const msPerBeat = 60000 / bpm;
  const msPerBar = msPerBeat * 4;
  const msPer8Bars = msPerBar * 8;

  const firstDownbeat = downbeats[0] || 0;
  const relativeTime = pointMs - firstDownbeat;

  const phrasesPassed = Math.round(relativeTime / msPer8Bars);
  const aligned8BarMs = firstDownbeat + (phrasesPassed * msPer8Bars);

  const barsPassed = Math.round(relativeTime / msPerBar);
  const alignedBarMs = firstDownbeat + (barsPassed * msPerBar);

  const tolerance = msPerBeat * 2;
  const distTo8Bar = Math.abs(pointMs - aligned8BarMs);
  const distToBar = Math.abs(pointMs - alignedBarMs);

  if (distTo8Bar < tolerance) {
    return { alignedMs: Math.max(0, aligned8BarMs), alignedToBar: true, alignedTo8Bar: true };
  }

  if (distToBar < tolerance) {
    return { alignedMs: Math.max(0, alignedBarMs), alignedToBar: true, alignedTo8Bar: false };
  }

  return { alignedMs: Math.max(0, pointMs), alignedToBar: false, alignedTo8Bar: false };
}

/**
 * Busca la frase más cercana
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

// --- UTILIDADES DE NORMALIZACIÓN ---

function normalizeTimeline(data: TimelineSegment[] | string | null | undefined): TimelineSegmentMs[] {
  const arr = normalizeArray<TimelineSegment>(data);
  return arr
    .filter(s => s && typeof s.inicio === 'string' && typeof s.fin === 'string')
    .map(s => ({
      tipo_seccion: s.tipo_seccion,
      inicio_ms: parseTimeStringToMs(s.inicio),
      fin_ms: parseTimeStringToMs(s.fin),
      has_vocals: s.has_vocals ?? false,
      descripcion: s.descripcion,
    }));
}

function normalizeLoops(data: LoopTransicion[] | string | null | undefined): Array<{ inicio_ms: number; fin_ms: number; texto: string }> {
  const arr = normalizeArray<LoopTransicion>(data);
  return arr
    .filter(l => l && typeof l.inicio === 'string' && typeof l.fin === 'string')
    .map(l => ({
      inicio_ms: parseTimeStringToMs(l.inicio),
      fin_ms: parseTimeStringToMs(l.fin),
      texto: l.texto || '',
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

function normalizeNumericArray(data: number[] | string | null | undefined): number[] {
  const arr = normalizeArray<number>(data);
  return arr.filter(v => typeof v === 'number' && Number.isFinite(v));
}
