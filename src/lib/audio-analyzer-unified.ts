// ============================================================================
// ANÁLISIS DE AUDIO UNIFICADO - TODO REAL
// ============================================================================
// Sistema completo de análisis de audio para DJs
// Combina: Realtime BPM Analyzer (BPM preciso) + Pitchfinder (pitch) + Tonal (tonalidad)
// + Essentia.js (análisis avanzado) + cálculos matemáticos (energía, beats, etc.)
// ============================================================================

import Pitchfinder from 'pitchfinder';
import { Note, Key } from 'tonal';
// AudioContext se resuelve dinámicamente dentro de decodificarAudio para compatibilidad Node
// Essentia.js se carga dinámicamente para compatibilidad con Next.js y Turbopack

// ============================================
// FUNCIONES DE CONVERSIÓN DE TIEMPO (SOLUCIÓN HÍBRIDA)
// ============================================

/**
 * Convierte milisegundos a formato MM:SS para el Prompt (legibilidad humana)
 * Ej: 65000 -> "01:05"
 */
function msToMinSec(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Crea una cadena formateada para el Prompt que incluye ambos formatos.
 * Esto ayuda a Gemini a no "perderse" con números grandes.
 * Ej: 65432 -> "65432ms (01:05)"
 */
function formatTimeContext(ms: number): string {
  return `${Math.round(ms)}ms (${msToMinSec(ms)})`;
}

/**
 * Formatea un rango de tiempo para el Prompt
 * Ej: [60000, 75000] -> "[60000-75000ms] (de 01:00 a 01:15)"
 */
function formatRangeContext(start: number, end: number): string {
  return `[${Math.round(start)}-${Math.round(end)}ms] (de ${msToMinSec(start)} a ${msToMinSec(end)})`;
}

// ============================================================================
// TIPOS
// ============================================================================

export interface AnalisisCompleto {
  // Básico
  bpm: number;
  bpm_rango: { min: number; max: number };
  tonalidad_camelot: string;
  tonalidad_compatible: string[];
  energia: number;
  bailabilidad: number;
  animo_general: string;
  compas: { numerador: number; denominador: number };
  // Duración total en milisegundos
  duracion_ms: number;
  
  // Timing
  downbeats_ts_ms: number[];
  beats_ts_ms: number[];
  frases_ts_ms: number[];
  transientes_ritmicos_ts_ms: number[];
  
  // ============================================================================
  // NUEVAS CARACTERÍSTICAS AVANZADAS DE ESSENTIA
  // ============================================================================
  
  // Análisis de Ritmo Avanzado (OPTIMIZADO - solo lo esencial para DJs)
  ritmo_avanzado: {
    onset_rate: number; // Tasa de ataques por segundo
    beats_loudness: number[]; // Intensidad de cada beat
    danceability: number; // Bailabilidad calculada por Essentia (0-3+)
    transients_ts_ms: number[]; // Onsets detectados en milisegundos
  };
  
  // Análisis Tonal Avanzado (OPTIMIZADO - sin acordes ni métricas académicas)
  tonal_avanzado: {
    key: string; // Tonalidad detectada (e.g., "C major")
    scale: string; // Escala (e.g., "major", "minor")
    key_strength: number; // Confianza de la tonalidad (0-1)
  };
  
  // Análisis de Loudness
  loudness: {
    integrated: number; // LUFS integrado
    momentary: number[]; // LUFS momentáneo a lo largo del tiempo
    short_term: number[]; // LUFS a corto plazo
    dynamic_range: number; // Rango dinámico en dB
    loudness_range: number; // LRA (Loudness Range)
    replay_gain_db: number; // NUEVO: Ganancia sugerida para normalización (ReplayGain)
  };
  
  // Nota: Clasificación de género y mood eliminada - se obtiene mejor con Gemini AI
  
  // Estructura de la Canción
  estructura: {
    segmentos: { inicio_ms: number; fin_ms: number; tipo: string }[];
    intro_duration_ms: number;
    outro_duration_ms: number;
    fade_in_duration_ms: number;
    fade_out_duration_ms: number;
  };
  
  // Datos complementarios para análisis posterior
  segmentos_voz: Array<{ start_ms: number; end_ms: number }>; // Segmentos VAD
}

// Opciones de análisis para permitir ejecución en batch y Node puro
export interface AnalisisConfig {
  // Normalización del audio (aprox -14 LUFS usando RMS como proxy)
  normalize?: boolean | { targetLUFS?: number };
  // Desactivar módulos para acelerar
  disable?: {
    vocal?: boolean;
    tonalidad?: boolean;
    djCues?: boolean;
    bpm?: boolean; // si true, se usa heurística simple en vez de Essentia
  };
  // Habilita configuraciones internas extra rápidas (omite análisis secundarios)
  fast?: boolean;
}

export interface CuePoint {
  tiempo_ms: number;
  tipo: 'intro' | 'verso' | 'estribillo' | 'drop' | 'break' | 'outro';
  descripcion: string;
  color?: string;
}

interface EssentiaSignal {
  vector: any;
  array: Float32Array;
  sampleRate: number;
}

interface RitmoResult {
  bpm: number;
  beatsMs: number[];
  downbeatsMs: number[];
  compas: { numerador: number; denominador: number; meter?: string };
  frasesMs: number[];
  loudnessPerBeat: number[];
}

let essentiaInstancePromise: Promise<any> | null = null;

/**
 * Carga Essentia.js usando importación dinámica para compatibilidad con Next.js y Turbopack
 * Esto resuelve el error "EssentiaWASM is not a function" en entornos de bundling modernos
 */
async function loadEssentiaInstance(): Promise<any> {
  if (!essentiaInstancePromise) {
    essentiaInstancePromise = (async () => {
      try {
        // Carga dinámica de la librería
        const essentiaModule = await import('essentia.js');
        
        // ====================================================================
        // SOLUCIÓN: EssentiaWASM ya es el módulo WASM cargado (no una función)
        // ====================================================================
        
        // Buscar el módulo WASM (es un objeto, no una función)
        const EssentiaWASMModule = essentiaModule.EssentiaWASM || essentiaModule.default?.EssentiaWASM;
        const EssentiaCore = essentiaModule.Essentia || essentiaModule.default?.Essentia;
        
        if (!EssentiaWASMModule || typeof EssentiaWASMModule !== 'object') {
          throw new Error('EssentiaWASM module no encontrado o no es un objeto válido.');
        }

        if (typeof EssentiaCore !== 'function') {
          throw new Error('Essentia (Core) no es una función. La importación pudo haber fallado.');
        }

        // Crear instancia directamente con el módulo WASM ya cargado
        return new EssentiaCore(EssentiaWASMModule);
        
        // ====================================================================
        // FIN DE LA SOLUCIÓN
        // ====================================================================

      } catch (error) {
        essentiaInstancePromise = null; // Resetea la promesa en caso de error
        throw error; // Propaga el error para que el fallback se active
      }
    })();
  }

  return essentiaInstancePromise;
}

function prepareEssentiaSignal(
  essentia: any,
  audioData: Float32Array,
  sampleRate: number,
  targetSampleRate = 44100
): EssentiaSignal {
  if (sampleRate === targetSampleRate) {
    return {
      vector: essentia.arrayToVector(audioData),
      array: audioData,
      sampleRate
    };
  }

  const originalVector = essentia.arrayToVector(audioData);
  const resampled = essentia.Resample(originalVector, sampleRate, targetSampleRate);
  const resampledVector = resampled.signal;
  const resampledArray = essentia.vectorToArray(resampledVector);

  return {
    vector: resampledVector,
    array: resampledArray,
    sampleRate: targetSampleRate
  };
}

// ============================================================================
// CONSTANTES
// ============================================================================

const CAMELOT_WHEEL: { [key: string]: string[] } = {
  '1A': ['1A', '12A', '2A', '1B'], '2A': ['2A', '1A', '3A', '2B'],
  '3A': ['3A', '2A', '4A', '3B'], '4A': ['4A', '3A', '5A', '4B'],
  '5A': ['5A', '4A', '6A', '5B'], '6A': ['6A', '5A', '7A', '6B'],
  '7A': ['7A', '6A', '8A', '7B'], '8A': ['8A', '7A', '9A', '8B'],
  '9A': ['9A', '8A', '10A', '9B'], '10A': ['10A', '9A', '11A', '10B'],
  '11A': ['11A', '10A', '12A', '11B'], '12A': ['12A', '11A', '1A', '12B'],
  '1B': ['1B', '12B', '2B', '1A'], '2B': ['2B', '1B', '3B', '2A'],
  '3B': ['3B', '2B', '4B', '3A'], '4B': ['4B', '3B', '5B', '4A'],
  '5B': ['5B', '4B', '6B', '5A'], '6B': ['6B', '5B', '7B', '6A'],
  '7B': ['7B', '6B', '8B', '7A'], '8B': ['8B', '7B', '9B', '8A'],
  '9B': ['9B', '8B', '10B', '9A'], '10B': ['10B', '9B', '11B', '10A'],
  '11B': ['11B', '10B', '12B', '11A'], '12B': ['12B', '11B', '1B', '12A'],
};

const KEY_TO_CAMELOT: { [key: string]: string } = {
  'C major': '8B', 'C minor': '5A', 'C# major': '3B', 'C# minor': '12A',
  'D major': '10B', 'D minor': '7A', 'D# major': '5B', 'D# minor': '2A',
  'E major': '12B', 'E minor': '9A', 'F major': '7B', 'F minor': '4A',
  'F# major': '2B', 'F# minor': '11A', 'G major': '9B', 'G minor': '6A',
  'G# major': '4B', 'G# minor': '1A', 'A major': '11B', 'A minor': '8A',
  'A# major': '6B', 'A# minor': '3A', 'B major': '1B', 'B minor': '10A',
};

const CAMELOT_TO_KEY: { [camelot: string]: string } = Object.entries(KEY_TO_CAMELOT)
  .reduce((acc, [key, camelot]) => {
    acc[camelot] = key;
    return acc;
  }, {} as { [camelot: string]: string });

const FLAT_TO_SHARP: Record<string, string> = {
  'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#',
  'Cb': 'B', 'Fb': 'E', 'E#': 'F', 'B#': 'C'
};

type KeyDetectionSource = 'tonal-extractor' | 'key-extractor';

interface KeyDetectionCandidate {
  key: string;
  scale: 'major' | 'minor';
  strength: number;
  source: KeyDetectionSource;
  segmentIndex: number;
}

interface SegmentTonalAnalysis {
  candidate: KeyDetectionCandidate;
  samples: Float32Array;
}

function normalizeTonic(tonicRaw: string): string {
  const cleaned = tonicRaw.trim().replace(/[^A-Ga-g#b]/g, '');
  if (!cleaned) {
    return 'C';
  }
  const normalized = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  return FLAT_TO_SHARP[normalized] || normalized;
}

function canonicalKeyString(tonic: string, scale: string): string {
  const normalizedScale = scale.toLowerCase().includes('minor') ? 'minor' : 'major';
  return `${normalizeTonic(tonic)} ${normalizedScale}`;
}

function canonicalKeyFromString(key: string | undefined): string | null {
  if (!key) return null;
  const parts = key.trim().split(/\s+/);
  if (parts.length < 2) return null;
  return canonicalKeyString(parts[0], parts[1]);
}

function extraerSegmentosParaTonalidad(audio: Float32Array, sampleRate: number): Float32Array[] {
  if (audio.length === 0) {
    return [audio];
  }

  const totalSamples = audio.length;
  const segmentDurationSamples = Math.min(
    Math.max(Math.floor(sampleRate * 15), 4096 * 4),
    totalSamples
  );

  const anchors = [
    Math.floor(totalSamples * 0.2),
    Math.floor(totalSamples * 0.5) - Math.floor(segmentDurationSamples / 2),
    Math.floor(totalSamples * 0.8) - segmentDurationSamples,
    Math.floor(totalSamples * 0.35)
  ];

  const segments: Float32Array[] = [];
  const usedPositions = new Set<number>();

  anchors.forEach(anchor => {
    const start = Math.min(
      Math.max(0, anchor),
      Math.max(0, totalSamples - segmentDurationSamples)
    );
    if (!usedPositions.has(start)) {
      usedPositions.add(start);
      const slice = audio.slice(start, start + segmentDurationSamples);
      if (slice.length > 2048) {
        segments.push(slice);
      }
    }
  });

  if (segments.length === 0) {
    segments.push(audio.slice());
  }

  return segments;
}

function applyFirstOrderHighPass(samples: Float32Array, sampleRate: number, cutoffHz = 100): Float32Array {
  if (samples.length === 0) return samples.slice();
  const rc = 1 / (2 * Math.PI * Math.max(1, cutoffHz));
  const dt = 1 / sampleRate;
  const alpha = rc / (rc + dt);
  const output = new Float32Array(samples.length);
  output[0] = samples[0];
  for (let i = 1; i < samples.length; i++) {
    output[i] = alpha * (output[i - 1] + samples[i] - samples[i - 1]);
  }
  return output;
}

function normalizeSegment(samples: Float32Array): Float32Array {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const abs = Math.abs(samples[i]);
    if (abs > peak) peak = abs;
  }
  if (peak < 1e-6) return samples.slice();
  const factor = 0.99 / peak;
  const normalized = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    normalized[i] = samples[i] * factor;
  }
  return normalized;
}

function prepararSegmentoParaTonalidad(samples: Float32Array, sampleRate: number): Float32Array {
  const highPassed = applyFirstOrderHighPass(samples, sampleRate, 100);
  return normalizeSegment(highPassed);
}

function analizarSegmentoClave(
  essentia: any,
  segment: Float32Array,
  sampleRate: number,
  segmentIndex: number
): SegmentTonalAnalysis | null {
  const preparedSamples = prepararSegmentoParaTonalidad(segment, sampleRate);
  const candidates: KeyDetectionCandidate[] = [];

  const registerCandidate = (
    keyValue: unknown,
    scaleValue: unknown,
    strengthValue: unknown,
    source: KeyDetectionSource
  ) => {
    if (typeof keyValue !== 'string' || typeof scaleValue !== 'string') {
      return;
    }
    let strength = Number(strengthValue);
    if (!Number.isFinite(strength)) {
      strength = 0;
    }
    const normalizedScale: 'major' | 'minor' = scaleValue.toLowerCase().includes('minor') ? 'minor' : 'major';
    const tonic = normalizeTonic(keyValue.split(/\s+/)[0] ?? keyValue);
    candidates.push({
      key: tonic,
      scale: normalizedScale,
      strength: Math.max(0, Math.min(1, strength)),
      source,
      segmentIndex,
    });
  };

  if (typeof essentia?.TonalExtractor === 'function') {
    try {
      const tonalVector = essentia.arrayToVector(preparedSamples);
      const tonalResult = essentia.TonalExtractor(tonalVector, sampleRate);
      registerCandidate(tonalResult?.key ?? tonalResult?.tonic, tonalResult?.scale ?? tonalResult?.mode, tonalResult?.keyStrength ?? tonalResult?.strength, 'tonal-extractor');
    } catch (error) {
      /* noop */
    }
  }

  try {
    const keyResult = essentia.KeyExtractor(
      essentia.arrayToVector(preparedSamples),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      sampleRate
    );
    registerCandidate(keyResult?.key ?? keyResult?.tonic, keyResult?.scale ?? keyResult?.mode, keyResult?.strength ?? keyResult?.keyStrength ?? keyResult?.firstToSecondRelativeStrength, 'key-extractor');
  } catch (error) {
    /* noop */
  }

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((a, b) => {
    if (b.strength !== a.strength) return b.strength - a.strength;
    if (a.source === b.source) return 0;
    return a.source === 'tonal-extractor' ? -1 : 1;
  });

  const candidate = candidates[0];
  return { candidate, samples: preparedSamples };
}

function parseMeterSignature(signature: unknown): { numerador: number; denominador: number; meter: string } {
  if (typeof signature === 'string') {
    const [numStr, denStr] = signature.split('/');
    const numerador = Number(numStr);
    const denominador = Number(denStr);
    if (Number.isFinite(numerador) && numerador > 0 && Number.isFinite(denominador) && denominador > 0) {
      return { numerador, denominador, meter: signature };
    }
  }

  return { numerador: 4, denominador: 4, meter: '4/4' };
}

function construirFrasesDesdeDownbeats(downbeatsMs: number[], barsPerPhrase = 8): number[] {
  if (downbeatsMs.length === 0) {
    return [];
  }

  const frases: number[] = [];
  for (let i = 0; i < downbeatsMs.length; i += barsPerPhrase) {
    frases.push(downbeatsMs[i]);
  }

  const ultimoDownbeat = downbeatsMs[downbeatsMs.length - 1];
  if (frases[frases.length - 1] !== ultimoDownbeat) {
    frases.push(ultimoDownbeat);
  }

  return frases;
}

function snapToNearestDownbeat(time: number, downbeats: number[], tolerance = 1500): number {
  if (downbeats.length === 0) {
    return time;
  }

  let closest = downbeats[0];
  let minDiff = Math.abs(time - closest);

  for (let i = 1; i < downbeats.length; i++) {
    const candidate = downbeats[i];
    const diff = Math.abs(time - candidate);
    if (diff < minDiff) {
      minDiff = diff;
      closest = candidate;
    }
    if (diff === 0) {
      break;
    }
  }

  return minDiff <= tolerance ? closest : time;
}

// ============================================================================
// 1. DECODIFICACIÓN DE AUDIO
// ============================================================================

/**
 * Decodifica audio desde Buffer usando node-web-audio-api
 * Convierte MP3/M4A/WAV a Float32Array para análisis
 */
async function decodificarAudio(buffer: Buffer): Promise<AudioBuffer> {
  // Resolver AudioContext para Node puro si no existe globalmente
  let AC: any = (globalThis as any).AudioContext;
  if (!AC) {
    try {
      const mod: any = await import('node-web-audio-api');
      AC = mod.AudioContext || mod?.default?.AudioContext;
      if (AC && !(globalThis as any).AudioContext) (globalThis as any).AudioContext = AC;
      if (mod?.AudioBuffer && !(globalThis as any).AudioBuffer) (globalThis as any).AudioBuffer = mod.AudioBuffer;
    } catch (e) {
      // Si no se puede importar, se reportará más abajo
    }
  }
  if (!AC) {
    throw new Error('AudioContext no disponible. Asegúrate de tener instalada la dependencia node-web-audio-api.');
  }
  const audioContext = new AC();
  
  try {
    const arrayBuffer = new ArrayBuffer(buffer.length);
    const view = new Uint8Array(arrayBuffer);
    for (let i = 0; i < buffer.length; i++) {
      view[i] = buffer[i];
    }
    
    return await audioContext.decodeAudioData(arrayBuffer);
  } finally {
    try { await audioContext.close(); } catch { /* noop */ }
  }
}

/**
 * Remuestrea un AudioBuffer a una tasa de muestreo objetivo
 * CRÍTICO para Essentia.js que requiere 44.1kHz
 */
async function remuestrearAudioBuffer(
  audioBuffer: AudioBuffer,
  targetSampleRate: number
): Promise<AudioBuffer> {
  const duracion = audioBuffer.duration;
  const numCanales = audioBuffer.numberOfChannels;

  // Obtener OfflineAudioContext
  let OfflineAC: any = (globalThis as any).OfflineAudioContext;
  if (!OfflineAC) {
    const mod: any = await import('node-web-audio-api');
    OfflineAC = mod.OfflineAudioContext || mod?.default?.OfflineAudioContext;
    if (OfflineAC && !(globalThis as any).OfflineAudioContext) {
      (globalThis as any).OfflineAudioContext = OfflineAC;
    }
  }
  
  if (!OfflineAC) {
    throw new Error('OfflineAudioContext no disponible para remuestreo');
  }
  
  const numFrames = Math.ceil(duracion * targetSampleRate);
  const offlineCtx = new OfflineAC(numCanales, numFrames, targetSampleRate);
  
  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;
  
  source.connect(offlineCtx.destination);
  source.start(0);
  
  console.log(`⚡ Remuestreando audio de ${audioBuffer.sampleRate}Hz a ${targetSampleRate}Hz...`);
  const resampledBuffer = await offlineCtx.startRendering();
  console.log('✅ Remuestreo completado.');
  
  return resampledBuffer;
}

/**
 * Calcula el perfil de energía RMS del audio
 * @param audioData - Datos de audio (Float32Array)
 * @param sampleRate - Tasa de muestreo del audio
 * @param ventanaMs - Tamaño de ventana en milisegundos (por defecto 250ms)
 * @returns Array de valores RMS normalizados (0-1)
 */
export function calcularPerfilRMS(
  audioData: Float32Array,
  sampleRate: number,
  ventanaMs: number = 250
): number[] {
  const muestrasPorVentana = Math.floor((ventanaMs / 1000) * sampleRate);
  const perfilRMS: number[] = [];
  
  for (let i = 0; i < audioData.length; i += muestrasPorVentana) {
    const ventana = audioData.slice(i, Math.min(i + muestrasPorVentana, audioData.length));
    
    // Calcular RMS de la ventana
    let sumCuadrados = 0;
    for (let j = 0; j < ventana.length; j++) {
      sumCuadrados += ventana[j] * ventana[j];
    }
    const rms = Math.sqrt(sumCuadrados / ventana.length);
    perfilRMS.push(rms);
  }
  
  // Normalizar el perfil RMS al rango 0-1
  const maxRMS = Math.max(...perfilRMS, 1e-6);
  return perfilRMS.map(v => v / maxRMS);
}

// Normalización básica aproximada a -14 LUFS (usando RMS como aproximación)
function normalizarAudioBufferInPlace(audioBuffer: AudioBuffer, targetLUFS = -14) {
  try {
    const channels = audioBuffer.numberOfChannels;
    const targetAmp = Math.pow(10, targetLUFS / 20); // dBFS a amplitud
    const ch0 = audioBuffer.getChannelData(0);
    let sum = 0;
    for (let i = 0; i < ch0.length; i++) sum += ch0[i] * ch0[i];
    const rms = Math.sqrt(sum / Math.max(1, ch0.length));
    const safe = Math.max(rms, 1e-6);
    const gain = targetAmp / safe;
    for (let c = 0; c < channels; c++) {
      const data = audioBuffer.getChannelData(c);
      for (let i = 0; i < data.length; i++) {
        let v = data[i] * gain;
        if (v > 1) v = 1; else if (v < -1) v = -1;
        data[i] = v;
      }
    }
  } catch (e) {
    console.warn('No se pudo normalizar el audio:', e);
  }
}

// ============================================================================
// 2. ANÁLISIS DE RITMO CON ESSENTIA
// ============================================================================

async function analizarRitmoConEssentia(
  essentia: any,
  signal: EssentiaSignal
): Promise<{
  bpm: number;
  beatsMs: number[];
  downbeatsMs: number[];
  compas: { numerador: number; denominador: number; meter: string };
  frasesMs: number[];
  loudnessPerBeat: number[];
}> {
  const beatTracking = essentia.BeatTrackerMultiFeature(signal.vector);
  const ticksVector = beatTracking?.ticks;

  if (!ticksVector) {
    throw new Error('BeatTrackerMultiFeature no devolvió ticks');
  }

  const ticksArray = essentia.vectorToArray(ticksVector) as Float32Array;
  const ticksSeconds = Array.from(ticksArray);
  if (ticksSeconds.length < 2) {
    throw new Error('Essentia detectó muy pocos beats');
  }

  const intervals: number[] = [];
  for (let i = 1; i < ticksSeconds.length; i++) {
    const interval = ticksSeconds[i] - ticksSeconds[i - 1];
    if (interval > 0) {
      intervals.push(interval);
    }
  }

  if (intervals.length === 0) {
    throw new Error('Essentia devolvió intervalos inválidos');
  }

  const averageInterval = intervals.reduce((acc, value) => acc + value, 0) / intervals.length;
  let bpm = 60 / averageInterval;
  bpm = Math.min(Math.max(bpm, 40), 220);

  const beatsMs = ticksSeconds.map(timeSec => Math.round(timeSec * 1000));

  let numerador = 4;
  let denominador = 4;
  let meterLabel = '4/4';
  let loudnessPerBeat: number[] = [];

  try {
    const beatsLoudness = essentia.BeatsLoudness(signal.vector, undefined, undefined, ticksVector, undefined, signal.sampleRate);
    loudnessPerBeat = Array.from(essentia.vectorToArray(beatsLoudness.loudness) as Float32Array);
    
    const beatogram = essentia.Beatogram(beatsLoudness.loudness, beatsLoudness.loudnessBandRatio);
    const meter = essentia.Meter(beatogram.beatogram);
    
    // Si Essentia devuelve un resultado válido, lo usamos
    if (meter && meter.meter) {
      const parsedMeter = parseMeterSignature(meter.meter);
      numerador = parsedMeter.numerador;
      denominador = parsedMeter.denominador;
      meterLabel = parsedMeter.meter;
    } else {
      throw new Error('Essentia Meter no devolvió resultado.');
    }
  } catch (meterError) {
    // PLAN B: Usar heurística de análisis de energía de beats
    if (beatsMs.length > 8) {
      const beatEnergies = computeBeatEnergiesFromAudio(signal.array, signal.sampleRate, beatsMs);
      const inferred = inferMeterAndOffset(beatEnergies);
      numerador = inferred.numerador;
      denominador = inferred.denominador;
      meterLabel = inferred.meter;
    }
  }

  // Mejorar downbeats: si hay loudness por beat, estimar offset del downbeat
  let downbeatsMs: number[] = [];
  if (loudnessPerBeat.length === beatsMs.length && beatsMs.length >= numerador * 2) {
    const inferred = inferMeterAndOffsetFromLoudness(loudnessPerBeat, numerador);
    const offset = inferred.offset % Math.max(1, numerador);
    for (let i = offset; i < beatsMs.length; i += numerador) {
      downbeatsMs.push(beatsMs[i]);
    }
  } else {
    downbeatsMs = beatsMs.filter((_, index) => index % numerador === 0);
  }
  const frasesMs = construirFrasesDesdeDownbeats(downbeatsMs);

  return {
    bpm: Math.round(bpm * 10) / 10,
    beatsMs,
    downbeatsMs,
    compas: { numerador, denominador, meter: meterLabel },
    frasesMs,
    loudnessPerBeat
  };
}

// ============================================================================
// 2a. FUNCIÓN DE AYUDA PARA ESPECTRO (CORRIGE ERROR .size)
// ============================================================================

/**
 * Calcula el espectro de magnitud de una señal de audio.
 * Centraliza el windowing y la FFT para evitar errores repetidos.
 * CORRECCIÓN CRÍTICA: Usa un tamaño de frame estándar (2048) para el análisis espectral
 */
function calcularEspectro(essentia: any, signal: EssentiaSignal): any | null {
  try {
    // CORRECCIÓN: Usar un tamaño de frame estándar para FFT (2048 es óptimo para música)
    const frameSize = 2048;
    
    // Extraer solo un frame del audio completo (análisis de una ventana representativa)
    const startSample = Math.floor(signal.array.length / 2); // Mitad de la canción
    const endSample = Math.min(startSample + frameSize, signal.array.length);
    const frame = signal.array.slice(startSample, endSample);
    
    // Si el frame es más corto que frameSize, rellenar con ceros
    const paddedFrame = new Float32Array(frameSize);
    paddedFrame.set(frame);
    
    const frameVector = essentia.arrayToVector(paddedFrame);
    const windowed = essentia.Windowing(frameVector, true, frameSize, 'hann');
    const spectrumResult = essentia.Spectrum(windowed.frame, frameSize);
    
    return spectrumResult.spectrum;
  } catch (error) {
    // Espectro no disponible - se usarán valores por defecto
    return null;
  }
}

// ============================================================================
// 2b. ANÁLISIS AVANZADO DE RITMO CON ESSENTIA
// ============================================================================

async function analizarRitmoAvanzado(
  essentia: any,
  signal: EssentiaSignal
): Promise<AnalisisCompleto['ritmo_avanzado']> {
  try {
    // Onset Rate - Tasa de ataques
    let transientsMs: number[] = [];
    let onsetRate = 0;
    
    try {
      const onsets = essentia.OnsetRate(signal.vector);
      onsetRate = onsets?.onsetRate ?? 0;
      const onsetTimesVector = onsets?.onsetTimes;
      if (onsetTimesVector) {
        const onsetArray = essentia.vectorToArray(onsetTimesVector) as Float32Array;
        transientsMs = Array.from(onsetArray).map((t: number) => Math.round(t * 1000));
      }
    } catch (onsetError) {
      console.warn('   ⚠️ OnsetRate falló, usando OnsetDetection alternativo:', onsetError);
    }
    
    // PLAN B: Si OnsetRate no devuelve onsets, usar análisis directo de energía
    if (transientsMs.length === 0) {
      try {
        const audioArray = essentia.vectorToArray(signal.vector) as Float32Array;
        const sampleRate = signal.sampleRate || 44100;
        const ventanaMs = 10; // Ventanas de 10ms para detectar ataques rápidos
        const muestrasPorVentana = Math.floor((ventanaMs / 1000) * sampleRate);
        const hopSize = Math.floor(muestrasPorVentana / 2); // 50% overlap
        
        // Calcular energía por ventana
        const energias: number[] = [];
        for (let i = 0; i < audioArray.length - muestrasPorVentana; i += hopSize) {
          let energia = 0;
          for (let j = 0; j < muestrasPorVentana; j++) {
            const sample = audioArray[i + j];
            energia += sample * sample;
          }
          energias.push(Math.sqrt(energia / muestrasPorVentana));
        }
        
        // Detectar picos de energía (transientes)
        const energiaMedia = energias.reduce((a, b) => a + b, 0) / energias.length;
        const umbral = energiaMedia * 3; // Picos 3x por encima de la media
        
        for (let i = 2; i < energias.length - 2; i++) {
          // Detectar pico: más alto que vecinos y supera umbral
          if (energias[i] > umbral &&
              energias[i] > energias[i - 1] &&
              energias[i] > energias[i - 2] &&
              energias[i] > energias[i + 1] &&
              energias[i] > energias[i + 2]) {
            const tiempoMs = Math.round((i * hopSize / sampleRate) * 1000);
            // Evitar duplicados muy cercanos (< 50ms)
            if (transientsMs.length === 0 || tiempoMs - transientsMs[transientsMs.length - 1] > 50) {
              transientsMs.push(tiempoMs);
            }
          }
        }
        
        console.log(`   🥁 Transientes detectados por análisis de energía: ${transientsMs.length} hits`);
      } catch (altError) {
        console.warn('   ⚠️ Método alternativo de onsets también falló:', altError);
      }
    }
    
    // Danceability - Bailabilidad calculada por Essentia
    const danceability = essentia.Danceability(signal.vector);
    const danceabilityValue = danceability?.danceability ?? 0;
    
    // Dynamic Complexity - Complejidad dinámica
    // NOTA: Dynamic Complexity y BPM Histogram eliminados (no útiles para DJs)
    
    return {
      onset_rate: onsetRate,
      beats_loudness: [], // Se llenará desde el análisis principal
      danceability: danceabilityValue,
      transients_ts_ms: transientsMs,
    };
  } catch (error) {
    console.warn('Error en análisis de ritmo avanzado:', error);
    return {
      onset_rate: 0,
      beats_loudness: [],
      danceability: 0,
      transients_ts_ms: [],
    };
  }
}

// ============================================================================
// 2c. ANÁLISIS TONAL AVANZADO CON ESSENTIA
// ============================================================================

async function analizarTonalAvanzado(
  essentia: any,
  signal: EssentiaSignal
): Promise<AnalisisCompleto['tonal_avanzado']> {
  try {
    const segments = extraerSegmentosParaTonalidad(signal.array, signal.sampleRate);
    const segmentAnalyses = segments
      .map((segment, index) => analizarSegmentoClave(essentia, segment, signal.sampleRate, index))
      .filter((item): item is SegmentTonalAnalysis => Boolean(item));

    let finalTonic = 'C';
    let finalScale: 'major' | 'minor' = 'major';
    let keyStrength = 0;
    let bestSegment: SegmentTonalAnalysis | null = null;

    if (segmentAnalyses.length > 0) {
      const grouped = new Map<string, { totalStrength: number; best: SegmentTonalAnalysis; count: number }>();

      for (const analysis of segmentAnalyses) {
        const keyName = canonicalKeyString(analysis.candidate.key, analysis.candidate.scale);
        const current = grouped.get(keyName);
        if (!current) {
          grouped.set(keyName, { totalStrength: analysis.candidate.strength, best: analysis, count: 1 });
        } else {
          current.totalStrength += analysis.candidate.strength;
          current.count += 1;
          if (analysis.candidate.strength > current.best.candidate.strength) {
            current.best = analysis;
          }
        }
      }

      const sorted = Array.from(grouped.entries()).sort((a, b) => {
        const avgA = a[1].totalStrength / a[1].count;
        const avgB = b[1].totalStrength / b[1].count;
        if (avgA === avgB) {
          return b[1].best.candidate.strength - a[1].best.candidate.strength;
        }
        return avgB - avgA;
      });

      const [bestKey, stats] = sorted[0];
      const [tonic, scale] = bestKey.split(' ');
      finalTonic = normalizeTonic(tonic);
      finalScale = (scale === 'minor' ? 'minor' : 'major');
      keyStrength = Math.min(1, stats.totalStrength / stats.count);
      bestSegment = stats.best;
    }

    if (keyStrength < 0.35) {
      try {
        const fallback = detectarTonalidad(signal.array, signal.sampleRate);
        const fallbackKey = CAMELOT_TO_KEY[fallback.camelot];
        if (fallbackKey) {
          const parsed = fallbackKey.split(' ');
          if (parsed.length >= 2) {
            finalTonic = normalizeTonic(parsed[0]);
            finalScale = parsed[1] === 'minor' ? 'minor' : 'major';
            keyStrength = Math.max(keyStrength, 0.35);
          }
        }
      } catch (fallbackError) {
        console.warn('Fallback tonal key detection failed:', fallbackError);
      }
    }

    const baseSamples = bestSegment?.samples ?? prepararSegmentoParaTonalidad(signal.array, signal.sampleRate);
    const baseVector = essentia.arrayToVector(baseSamples);

    // NOTA: Detección de acordes, tuning frequency, harmonic complexity y dissonance
    // eliminados - son análisis académicos que no aportan valor práctico a un DJ

    const keyString = canonicalKeyString(finalTonic, finalScale);

    return {
      key: keyString,
      scale: finalScale,
      key_strength: keyStrength,
    };
  } catch (error) {
    console.warn('Error en análisis tonal avanzado:', error);
    return {
      key: 'C major',
      scale: 'major',
      key_strength: 0,
    };
  }
}

// ============================================================================
// FUNCIONES DE ANÁLISIS ESPECTRAL, TIMBRE Y CLASIFICACIÓN ELIMINADAS
// ============================================================================
// Estos análisis eran computacionalmente costosos y de baja utilidad para DJs:
// - analizarEspectral: Centroid, Rolloff, Flux, Complexity, Contrast, ZCR
// - analizarTimbre: MFCC, Brightness, Roughness, Warmth, Sharpness  
// - analizarClasificacion: Mood detection (acoustic, electronic, aggressive, etc.)
//
// Gemini AI proporciona clasificación de género y mood mucho más precisa y rica.
// Los DJs evalúan el "brillo" y "textura" auditivamente usando EQs y filtros.
// ============================================================================

// ============================================================================
// 2f. ANÁLISIS DE LOUDNESS CON ESSENTIA
// ============================================================================

async function analizarLoudness(
  essentia: any,
  signal: EssentiaSignal
): Promise<AnalisisCompleto['loudness']> {
  // Calcular aproximación usando RMS como fallback
  let integrated = -14;
  let loudnessRange = 0;
  const momentary: number[] = [];
  const shortTerm: number[] = [];
  let dynamicRange = 0;
  
  try {
    // Intentar usar LoudnessEBUR128 si está disponible
    if (typeof essentia.LoudnessEBUR128 === 'function') {
      // LoudnessEBUR128 puede fallar con ciertos formatos de audio
      // Envolver en try-catch interno para usar fallback
      try {
        const loudnessEBU = essentia.LoudnessEBUR128(signal.vector, signal.vector, undefined, undefined, signal.sampleRate);
        
        if (loudnessEBU && typeof loudnessEBU === 'object') {
          integrated = loudnessEBU.integratedLoudness ?? integrated;
          loudnessRange = loudnessEBU.loudnessRange ?? loudnessRange;
          
          // Momentary y Short-term loudness
          try {
            const momentaryVector = loudnessEBU?.momentaryLoudness;
            const shortTermVector = loudnessEBU?.shortTermLoudness;
            
            if (momentaryVector) {
              const momentaryArray = essentia.vectorToArray(momentaryVector) as Float32Array;
              momentary.push(...Array.from(momentaryArray).slice(0, 100));
            }
            
            if (shortTermVector) {
              const shortTermArray = essentia.vectorToArray(shortTermVector) as Float32Array;
              shortTerm.push(...Array.from(shortTermArray).slice(0, 100));
            }
          } catch (e) {
            // Momentary/short-term no disponibles
          }
        }
      } catch (innerError) {
        // LoudnessEBUR128 falló - usar aproximación RMS
        const rms = Math.sqrt(signal.array.reduce((sum, val) => sum + val * val, 0) / signal.array.length);
        integrated = 20 * Math.log10(Math.max(rms, 1e-10)) - 14; // Convertir RMS a LUFS aproximado
      }
    } else {
      // LoudnessEBUR128 no disponible - usar aproximación RMS
      const rms = Math.sqrt(signal.array.reduce((sum, val) => sum + val * val, 0) / signal.array.length);
      integrated = 20 * Math.log10(Math.max(rms, 1e-10)) - 14;
    }
    
    
    // Dynamic Range
    try {
      const dr = essentia.DynamicComplexity(signal.vector);
      dynamicRange = (dr?.dynamicComplexity ?? 0) * 20;
    } catch (e) {
      // DynamicComplexity no disponible
    }
    
    return {
      integrated,
      momentary,
      short_term: shortTerm,
      dynamic_range: dynamicRange,
      loudness_range: loudnessRange,
      replay_gain_db: 0, // Se calculará por separado
    };
  } catch (error) {
    // Usar valores por defecto si todo falla
    const rms = Math.sqrt(signal.array.reduce((sum, val) => sum + val * val, 0) / signal.array.length);
    const approxLoudness = 20 * Math.log10(Math.max(rms, 1e-10)) - 14;
    
    return {
      integrated: approxLoudness,
      momentary: [],
      short_term: [],
      dynamic_range: 0,
      loudness_range: 0,
      replay_gain_db: 0,
    };
  }
}

// ============================================================================
// 2g. ANÁLISIS DE REPLAYGAIN (NUEVA CARACTERÍSTICA)
// ============================================================================

/**
 * Calcula el ReplayGain de la pista para normalización de volumen.
 * ReplayGain indica cuántos dB debes ajustar el volumen para que la pista
 * suene a un nivel consistente con otras canciones.
 * ¡Extremadamente útil para DJs!
 */
async function analizarReplayGain(
  essentia: any,
  signal: EssentiaSignal
): Promise<{ replay_gain_db: number }> {
  try {
    if (typeof essentia.ReplayGain !== 'function') {
      return { replay_gain_db: 0 };
    }
    const rg = essentia.ReplayGain(signal.vector, signal.sampleRate);
    return { replay_gain_db: rg?.replayGain ?? 0 };
  } catch (e) {
    console.warn('   ⚠️ No se pudo calcular ReplayGain:', e);
    return { replay_gain_db: 0 };
  }
}

// ============================================================================
// 2i. ANÁLISIS DE ESTRUCTURA CON ESSENTIA
// ============================================================================

async function analizarEstructura(
  essentia: any,
  signal: EssentiaSignal,
  duracionMs: number
): Promise<AnalisisCompleto['estructura']> {
  try {
    const segmentos: { inicio_ms: number; fin_ms: number; tipo: string }[] = [];
    
    // Detección básica de segmentos usando energy
    const frameSize = Math.floor(signal.sampleRate * 2); // 2 segundos
    const audioArray = signal.array;
    
    for (let i = 0; i < audioArray.length; i += frameSize) {
      const frame = audioArray.slice(i, i + frameSize);
      let energy = 0;
      for (let j = 0; j < frame.length; j++) {
        energy += frame[j] * frame[j];
      }
      energy = energy / frame.length;
      
      const inicioMs = Math.round((i / signal.sampleRate) * 1000);
      const finMs = Math.min(Math.round(((i + frameSize) / signal.sampleRate) * 1000), duracionMs);
      
      // Clasificar segmento basado en energía
      let tipo = 'normal';
      if (energy < 0.01) {
        tipo = 'silencio';
      } else if (energy > 0.1) {
        tipo = 'intenso';
      }
      
      segmentos.push({ inicio_ms: inicioMs, fin_ms: finMs, tipo });
    }
    
    // Estimar intro y outro
    let introDuration = 0;
    let outroDuration = 0;
    
    for (let i = 0; i < segmentos.length && i < 5; i++) {
      if (segmentos[i].tipo !== 'intenso') {
        introDuration = segmentos[i].fin_ms;
      } else {
        break;
      }
    }
    
    for (let i = segmentos.length - 1; i >= 0 && i >= segmentos.length - 5; i--) {
      if (segmentos[i].tipo !== 'intenso') {
        outroDuration = duracionMs - segmentos[i].inicio_ms;
      } else {
        break;
      }
    }
    
    // Fade in/out (aproximación)
    const fadeInDuration = Math.min(introDuration, 8000); // Max 8 segundos
    const fadeOutDuration = Math.min(outroDuration, 8000);
    
    return {
      segmentos: segmentos.slice(0, 50), // Limitar a 50 segmentos
      intro_duration_ms: introDuration,
      outro_duration_ms: outroDuration,
      fade_in_duration_ms: fadeInDuration,
      fade_out_duration_ms: fadeOutDuration,
    };
  } catch (error) {
    console.warn('Error en análisis de estructura:', error);
    return {
      segmentos: [],
      intro_duration_ms: 0,
      outro_duration_ms: 0,
      fade_in_duration_ms: 0,
      fade_out_duration_ms: 0,
    };
  }
}

// ============================================================================
// 3. DETECCIÓN DE BPM (fallback heurístico)
// ============================================================================

/**
 * Detecta BPM usando un análisis heurístico de energía
 * Precisión: ±3 BPM en ausencia de Essentia
 */
function detectarBPM(audioData: Float32Array, sampleRate: number): number {
  return detectarBPMSimple(audioData, sampleRate);
}

/**
 * Detección de BPM por análisis de picos de energía (heurística ligera)
 */
function detectarBPMSimple(audioData: Float32Array, sampleRate: number): number {
  const windowSize = Math.floor(sampleRate * 0.05);
  if (!Number.isFinite(windowSize) || windowSize <= 0) {
    return 120;
  }
  const energies: number[] = [];
  
  for (let i = 0; i < audioData.length; i += windowSize) {
    let energy = 0;
    for (let j = 0; j < windowSize && i + j < audioData.length; j++) {
      energy += Math.abs(audioData[i + j]);
    }
    energies.push(energy / windowSize);
  }
  
  const threshold = energies.reduce((a, b) => a + b, 0) / energies.length * 1.5;
  const peaks: number[] = [];
  
  for (let i = 1; i < energies.length - 1; i++) {
    if (energies[i] > threshold && energies[i] > energies[i - 1] && energies[i] > energies[i + 1]) {
      peaks.push(i);
    }
  }
  
  if (peaks.length < 2) return 120;
  
  const intervals: number[] = [];
  for (let i = 1; i < peaks.length; i++) {
    intervals.push(peaks[i] - peaks[i - 1]);
  }
  
  const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const timePerWindow = windowSize / sampleRate;
  const beatsPerSecond = 1 / (avgInterval * timePerWindow);
  let bpm = beatsPerSecond * 60;
  
  while (bpm < 60) bpm *= 2;
  while (bpm > 180) bpm /= 2;
  
  return Math.round(bpm * 10) / 10;
}

// ============================================================================
// 3b. DETECCIÓN DE BPM (Algoritmo mejorado basado en Realtime BPM Analyzer)
// ============================================================================

/**
 * Implementación del algoritmo de Realtime BPM Analyzer adaptado para Node.js
 * Basado en: https://github.com/dlepaux/realtime-bpm-analyzer
 * 
 * El algoritmo funciona así:
 * 1. Aplica un filtro paso-bajo (lowpass) para aislar frecuencias bajas (beats)
 * 2. Encuentra picos de energía en diferentes umbrales
 * 3. Calcula intervalos entre picos
 * 4. Agrupa intervalos similares para encontrar BPM candidatos
 * 5. Retorna los mejores candidatos ordenados por confianza
 */

interface BPMCandidate {
  tempo: number;
  count: number;
  confidence: number;
}

function aplicarLowpass(data: Float32Array, sampleRate: number, cutoff: number = 200): Float32Array {
  // Filtro paso-bajo simple (Butterworth de primer orden simulado)
  const RC = 1.0 / (cutoff * 2 * Math.PI);
  const dt = 1.0 / sampleRate;
  const alpha = dt / (RC + dt);
  
  const filtered = new Float32Array(data.length);
  filtered[0] = data[0];
  
  for (let i = 1; i < data.length; i++) {
    filtered[i] = filtered[i - 1] + alpha * (data[i] - filtered[i - 1]);
  }
  
  return filtered;
}

function encontrarPicos(data: Float32Array, sampleRate: number, threshold: number): number[] {
  const picos: number[] = [];
  const minDistance = Math.floor(sampleRate * 0.25); // 250ms mínimo entre picos
  
  for (let i = 1; i < data.length - 1; i++) {
    if (data[i] > threshold && data[i] > data[i - 1] && data[i] > data[i + 1]) {
      // Verificar que no haya otro pico muy cerca
      if (picos.length === 0 || i - picos[picos.length - 1] >= minDistance) {
        picos.push(i);
      }
    }
  }
  
  return picos;
}

function calcularIntervalos(picos: number[]): Map<number, number> {
  const intervalos = new Map<number, number>();
  
  for (let i = 0; i < picos.length; i++) {
    for (let j = 0; j < 10 && i + j < picos.length; j++) {
      const intervalo = picos[i + j] - picos[i];
      if (intervalo > 0) {
        intervalos.set(intervalo, (intervalos.get(intervalo) || 0) + 1);
      }
    }
  }
  
  return intervalos;
}

function agruparPorTempo(intervalos: Map<number, number>, sampleRate: number): BPMCandidate[] {
  const candidatos: BPMCandidate[] = [];
  
  for (const [intervalo, count] of intervalos.entries()) {
    if (intervalo === 0) continue;
    
    // Convertir intervalo de samples a BPM
    let tempo = 60 / (intervalo / sampleRate);
    
    // Ajustar al rango 90-180 BPM
    while (tempo < 90) tempo *= 2;
    while (tempo > 180) tempo /= 2;
    
    tempo = Math.round(tempo);
    
    // Buscar si ya existe este tempo
    const existente = candidatos.find(c => c.tempo === tempo);
    if (existente) {
      existente.count += count;
    } else {
      candidatos.push({ tempo, count, confidence: 0 });
    }
  }
  
  // Ordenar por count descendente
  candidatos.sort((a, b) => b.count - a.count);
  
  // Calcular confidence
  if (candidatos.length > 0) {
    const maxCount = candidatos[0].count;
    candidatos.forEach(c => {
      c.confidence = c.count / maxCount;
    });
  }
  
  return candidatos.slice(0, 5); // Top 5 candidatos
}

async function detectarBPMConRBA(audioBuffer: AudioBuffer): Promise<number | null> {
  try {
    console.log('   🎵 Usando algoritmo de Realtime BPM Analyzer...');
    
    // Obtener canal de audio (mono mix si es stereo)
    const channelData = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;
    
    console.log(`   📊 Audio: ${audioBuffer.duration.toFixed(1)}s @ ${sampleRate}Hz`);
    
    // 1. Aplicar filtro paso-bajo para aislar beats
    const filtered = aplicarLowpass(channelData, sampleRate);
    
    // 2. Encontrar picos en diferentes umbrales
    const thresholds = [0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5];
    let mejorCandidatos: BPMCandidate[] = [];
    let mejorThreshold = 0;
    
    for (const threshold of thresholds) {
      const picos = encontrarPicos(filtered, sampleRate, threshold);
      
      // Necesitamos al menos 15 picos para un análisis confiable
      if (picos.length >= 15) {
        const intervalos = calcularIntervalos(picos);
        const candidatos = agruparPorTempo(intervalos, sampleRate);
        
        if (candidatos.length > 0 && candidatos[0].count > (mejorCandidatos[0]?.count || 0)) {
          mejorCandidatos = candidatos;
          mejorThreshold = threshold;
        }
        
        // Si tenemos buenos resultados, podemos parar
        if (candidatos.length > 0 && candidatos[0].confidence > 0.7) {
          break;
        }
      }
    }
    
    if (mejorCandidatos.length === 0) {
      console.warn('   ⚠️ No se encontraron candidatos de BPM');
      return null;
    }
    
    console.log(`   📊 Top 3 candidatos (threshold ${mejorThreshold.toFixed(2)}):`);
    mejorCandidatos.slice(0, 3).forEach((c, i) => {
      console.log(`      ${i + 1}. ${c.tempo} BPM (count: ${c.count}, confidence: ${(c.confidence * 100).toFixed(1)}%)`);
    });
    
    // ============================================================================
    // LÓGICA INTELIGENTE: Elegir entre candidatos basado en contexto musical
    // ============================================================================
    // Si el primer candidato está relacionado con el segundo (doble/mitad/4:3/3:2),
    // preferir el que tenga más sentido musical (rango 80-140 BPM es más común)
    
    let best = mejorCandidatos[0];
    
    // Si hay un segundo candidato con confianza similar
    if (mejorCandidatos.length > 1) {
      const segundo = mejorCandidatos[1];
      const diferencia = Math.abs(best.confidence - segundo.confidence);
      
      // Si la diferencia de confianza es menor al 15%, elegir el más musical
      if (diferencia < 0.15) {
        // Verificar relaciones entre BPMs (doble, mitad, 3:2, 4:3)
        const ratio1 = best.tempo / segundo.tempo;
        const ratio2 = segundo.tempo / best.tempo;
        
        // Relaciones comunes: 2:1, 3:2, 4:3
        const esRelacionado = 
          Math.abs(ratio1 - 2) < 0.1 ||     // doble
          Math.abs(ratio2 - 2) < 0.1 ||     // mitad
          Math.abs(ratio1 - 1.5) < 0.1 ||   // 3:2
          Math.abs(ratio2 - 1.5) < 0.1 ||   // 2:3
          Math.abs(ratio1 - 1.33) < 0.1 ||  // 4:3
          Math.abs(ratio2 - 1.33) < 0.1;    // 3:4
        
        if (esRelacionado) {
          // Preferir el que esté en el rango 80-140 BPM (más común en música popular)
          const primeroEnRango = best.tempo >= 80 && best.tempo <= 140;
          const segundoEnRango = segundo.tempo >= 80 && segundo.tempo <= 140;
          
          // Si ambos están en rango, preferir el más bajo (más natural)
          if (primeroEnRango && segundoEnRango && segundo.tempo < best.tempo) {
            console.log(`   🔄 Eligiendo segundo candidato (${segundo.tempo} BPM) sobre ${best.tempo} BPM (ambos en rango, prefiriendo el más bajo)`);
            best = segundo;
          }
          // Si solo el segundo está en rango, elegirlo
          else if (!primeroEnRango && segundoEnRango) {
            console.log(`   🔄 Eligiendo segundo candidato (${segundo.tempo} BPM) sobre ${best.tempo} BPM por estar en rango musical común`);
            best = segundo;
          }
        }
      }
    }
    
    let bpm = best.tempo;
    
    // Ajustar BPM al rango razonable (60-200)
    while (bpm < 60) bpm *= 2;
    while (bpm > 200) bpm /= 2;
    
    console.log(`   ✅ BPM detectado: ${bpm} (confidence: ${(best.confidence * 100).toFixed(1)}%)`);
    return Math.round(bpm * 10) / 10;
    
  } catch (e) {
    console.warn('   ⚠️ Error en detección de BPM:', e);
  }
  return null;
}

// ============================================================================
// 4. DETECCIÓN DE COMPÁS
// ============================================================================

/**
 * Detecta compás (4/4, 3/4, 6/8) analizando patrones de energía
 */
function detectarCompas(audioData: Float32Array, sampleRate: number, bpm: number): { numerador: number; denominador: number } {
  const beatDuration = (60 / bpm) * sampleRate;
  const windowSize = Math.floor(sampleRate * 0.05);
  
  const beatEnergies: number[] = [];
  for (let i = 0; i < audioData.length; i += beatDuration) {
    let energy = 0;
    for (let j = 0; j < windowSize && i + j < audioData.length; j++) {
      energy += Math.abs(audioData[Math.floor(i + j)]);
    }
    beatEnergies.push(energy);
  }
  
  if (beatEnergies.length < 8) return { numerador: 4, denominador: 4 };
  
  const patterns = {
    '4/4': [1.0, 0.6, 0.8, 0.6],
    '3/4': [1.0, 0.6, 0.6],
    '6/8': [1.0, 0.5, 0.5, 0.7, 0.5, 0.5],
  };
  
  let bestMatch = '4/4';
  let bestScore = 0;
  
  for (const [signature, pattern] of Object.entries(patterns)) {
    let score = 0;
    const patternLength = pattern.length;
    
    for (let i = 0; i < beatEnergies.length - patternLength; i += patternLength) {
      for (let j = 0; j < patternLength; j++) {
        const normalized = beatEnergies[i + j] / Math.max(...beatEnergies.slice(i, i + patternLength));
        score += 1 - Math.abs(normalized - pattern[j]);
      }
    }
    
    if (score > bestScore) {
      bestScore = score;
      bestMatch = signature;
    }
  }
  
  const [num, den] = bestMatch.split('/').map(Number);
  return { numerador: num, denominador: den };
}

// ============================================================================
// 4b. HEURÍSTICA MEJORADA: COMPÁS Y OFFSET DE DOWNBEAT
// ============================================================================

// Calcula energía por beat a partir del audio y las marcas de beat
function computeBeatEnergiesFromAudio(
  audioData: Float32Array,
  sampleRate: number,
  beatsMs: number[],
  windowMs = 60
): number[] {
  const half = Math.max(1, Math.floor((windowMs / 1000) * sampleRate / 2));
  const energies: number[] = [];
  for (const tMs of beatsMs) {
    const center = Math.floor((tMs / 1000) * sampleRate);
    const start = Math.max(0, center - half);
    const end = Math.min(audioData.length, center + half);
    let e = 0;
    for (let i = start; i < end; i++) e += Math.abs(audioData[i]);
    energies.push(e / Math.max(1, end - start));
  }
  return energies;
}

// Infieren numerador (beats por compás) y offset del downbeat a partir de energías por beat
function inferMeterAndOffset(beatEnergies: number[]): { numerador: number; denominador: number; offset: number; meter: string } {
  if (beatEnergies.length < 6) return { numerador: 4, denominador: 4, offset: 0, meter: '4/4' };
  const maxE = Math.max(...beatEnergies);
  const energies = beatEnergies.map(e => e / Math.max(1e-9, maxE));
  const candidates = Array.from({ length: 11 }, (_, i) => i + 2); // 2..12
  let best = { n: 4, offset: 0, score: -Infinity };
  for (const n of candidates) {
    let bestOffset = 0;
    let bestSum = -Infinity;
    const sumsPerOffset: number[] = [];
    for (let off = 0; off < n; off++) {
      let sum = 0;
      let count = 0;
      for (let i = off; i < energies.length; i += n) {
        sum += energies[i];
        count++;
      }
      const avg = sum / Math.max(1, count);
      sumsPerOffset.push(avg);
      if (avg > bestSum) { bestSum = avg; bestOffset = off; }
    }
    const mean = sumsPerOffset.reduce((a, b) => a + b, 0) / sumsPerOffset.length;
    const variance = sumsPerOffset.reduce((a, b) => a + (b - mean) * (b - mean), 0) / sumsPerOffset.length;
    const std = Math.sqrt(Math.max(variance, 1e-9));
    const preference = (n === 4 ? 1.0 : n === 3 ? 0.95 : n === 6 ? 0.9 : 0.8);
    const score = ((bestSum - mean) / std) * preference;
    if (score > best.score) best = { n, offset: bestOffset, score };
  }
  const numerador = best.n;
  const denominador = (numerador === 6 || numerador === 9 || numerador === 12) ? 8 : 4;
  return { numerador, denominador, offset: best.offset, meter: `${numerador}/${denominador}` };
}

// Estimar solo el offset de downbeat a partir de loudness por beat y un numerador conocido
function inferMeterAndOffsetFromLoudness(loudnessPerBeat: number[], numerador: number): { offset: number } {
  const n = Math.max(2, numerador);
  let bestOffset = 0;
  let bestAvg = -Infinity;
  for (let off = 0; off < n; off++) {
    let sum = 0;
    let count = 0;
    for (let i = off; i < loudnessPerBeat.length; i += n) {
      sum += loudnessPerBeat[i];
      count++;
    }
    const avg = sum / Math.max(1, count);
    if (avg > bestAvg) { bestAvg = avg; bestOffset = off; }
  }
  return { offset: bestOffset };
}

// ============================================================================
// 5. CÁLCULO DE BEATS, DOWNBEATS Y FRASES
// ============================================================================

/**
 * Calcula beats, downbeats y frases basándose en BPM y compás
 * - Beats: cada beat
 * - Downbeats: primer beat de cada compás
 * - Frases: cada 8 compases
 */
function calcularTiming(bpm: number, compas: { numerador: number; denominador: number }, duracionMs: number) {
  const beatDuration = (60 / bpm) * 1000;
  const beatsPerBar = compas.numerador;
  const barDuration = beatDuration * beatsPerBar;
  
  const beats: number[] = [];
  for (let time = 0; time < duracionMs; time += beatDuration) {
    beats.push(Math.round(time));
  }
  
  const downbeats: number[] = [];
  for (let time = 0; time < duracionMs; time += barDuration) {
    downbeats.push(Math.round(time));
  }
  
  const fraseDuration = barDuration * 8;
  const frases: number[] = [];
  for (let time = 0; time < duracionMs; time += fraseDuration) {
    frases.push(Math.round(time));
  }
  
  return { beats, downbeats, frases };
}

// ============================================================================
// 6. MÉTRICAS DE ENERGÍA Y ÁNIMO CON ESSENTIA
// ============================================================================

async function analizarMetricasConEssentia(
  essentia: any,
  signal: EssentiaSignal
): Promise<{ energia: number; bailabilidad: number; animo_general: string }> {
  const danceabilityInfo = essentia.Danceability(signal.vector, undefined, undefined, signal.sampleRate);
  const energyInfo = essentia.Energy(signal.vector);

  const rawDanceability = typeof danceabilityInfo?.danceability === 'number' ? danceabilityInfo.danceability : 0;
  const rawEnergy = typeof energyInfo?.energy === 'number' ? energyInfo.energy : 0;

  const bailabilidad = Math.min(1, rawDanceability / 2.5);

  const energyPerSample = rawEnergy / Math.max(signal.array.length, 1);
  const rms = Math.sqrt(Math.max(energyPerSample, 0));
  // Convert energy to RMS and compress exponentially for stable 0-1 normalization.
  const energia = Math.min(1, 1 - Math.exp(-rms * 4));

  let valence = bailabilidad;
  let arousal = energia;

  if (typeof essentia.MoodAcoustic === 'function') {
    try {
      const moodInfo = essentia.MoodAcoustic(signal.vector);
      if (typeof moodInfo?.valence === 'number') {
        valence = Math.min(Math.max(moodInfo.valence, 0), 1);
      }
      if (typeof moodInfo?.arousal === 'number') {
        arousal = Math.min(Math.max(moodInfo.arousal, 0), 1);
      }
    } catch (error) {
      console.warn('   ⚠️ Essentia MoodAcoustic no disponible, usando aproximación simple', error);
    }
  }

  let animo_general = 'neutral';
  if (valence > 0.6 && arousal > 0.6) animo_general = 'energético';
  else if (valence > 0.6) animo_general = 'feliz';
  else if (valence < 0.35 && arousal < 0.35) animo_general = 'melancólico';
  else if (valence < 0.35) animo_general = 'triste';

  return {
    energia: Math.round(energia * 100) / 100,
    bailabilidad: Math.round(bailabilidad * 100) / 100,
    animo_general
  };
}

// ============================================================================
// 7. CÁLCULO DE ENERGÍA (RMS)
// ============================================================================

/**
 * Calcula energía usando RMS (Root Mean Square)
 * Rango: 0.0 - 1.0
 */
function calcularEnergia(audioData: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < audioData.length; i++) {
    sum += audioData[i] * audioData[i];
  }
  const rms = Math.sqrt(sum / audioData.length);
  return Math.min(1, rms * 5);
}

// ============================================================================
// 8. CÁLCULO DE BAILABILIDAD
// ============================================================================

/**
 * Calcula bailabilidad basándose en BPM y energía
 * BPM óptimo: ~125 BPM
 * Rango: 0.0 - 1.0
 */
function calcularBailabilidad(bpm: number, energia: number): number {
  return Math.min(1, (1 - Math.abs(125 - bpm) / 125) * 0.6 + energia * 0.4);
}

// ============================================================================
// 9. DETECCIÓN DE ÁNIMO
// ============================================================================

/**
 * Detecta ánimo general basándose en energía y BPM
 */
function detectarAnimo(energia: number, bpm: number): string {
  if (energia > 0.7 && bpm > 120) return 'energético';
  if (energia > 0.6 && bpm > 100) return 'feliz';
  if (energia < 0.3 && bpm < 90) return 'melancólico';
  if (energia < 0.4 && bpm < 100) return 'triste';
  return 'neutral';
}

// ============================================================================
// 10. DETECCIÓN DE TONALIDAD (Pitchfinder + Tonal)
// ============================================================================

/**
 * Detecta tonalidad usando Pitchfinder (YIN) + Tonal.js
 * 1. Pitchfinder detecta frecuencias
 * 2. Tonal convierte a notas
 * 3. Compara con escalas mayores/menores
 * 4. Convierte a Camelot
 * 
 * OPTIMIZACIÓN: Analiza solo 20s centrales con hopSize mayor para ser 4x más rápido
 */
function detectarTonalidad(audioData: Float32Array, sampleRate: number): {
  camelot: string;
  compatibles: string[];
} {
  try {
    // OPTIMIZACIÓN: Analizar solo 20 segundos centrales (en lugar de 60)
    const analysisDuration = 20; // segundos
    const maxSamples = Math.min(audioData.length, sampleRate * analysisDuration);
    const startOffset = Math.floor((audioData.length - maxSamples) / 2);
    const audioDataCorto = audioData.slice(startOffset, startOffset + maxSamples);
    
    // Detectar pitch con YIN
    const detectPitch = Pitchfinder.YIN({ sampleRate, threshold: 0.1 });
    
    const windowSize = 2048;
    const hopSize = 1024; // OPTIMIZACIÓN: Aumentado de 512 → 1024 (2x más rápido)
    const pitches: number[] = [];
    
    for (let i = 0; i + windowSize <= audioDataCorto.length; i += hopSize) {
      const window = audioDataCorto.slice(i, i + windowSize);
      const pitch = detectPitch(window);
      if (pitch && pitch > 0) pitches.push(pitch);
    }
    
    if (pitches.length === 0) {
      return { camelot: '8A', compatibles: CAMELOT_WHEEL['8A'] };
    }
    
    // Convertir frecuencias a notas
    const notas = pitches.map(freq => Note.pitchClass(Note.fromFreq(freq))).filter(Boolean);
    
    // Contar pitch classes
    const conteo: { [key: string]: number } = {};
    notas.forEach(pc => {
      if (pc) conteo[pc] = (conteo[pc] || 0) + 1;
    });
    
    const notasOrdenadas = Object.entries(conteo)
      .sort((a, b) => b[1] - a[1])
      .map(([nota]) => nota);
    
    // Probar todas las tonalidades
    const tonalidadesPosibles = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    let mejorMatch = { tonalidad: 'C', escala: 'major', score: 0 };
    
    for (const tonica of tonalidadesPosibles) {
      // Escala mayor
      const keyMayor = Key.majorKey(tonica);
      const notasMayor = (keyMayor.scale || []).map(n => Note.pitchClass(n)).filter(Boolean);
      const scoreMayor = notasOrdenadas.reduce((score, nota, index) => 
        notasMayor.includes(nota) ? score + (notasOrdenadas.length - index) : score, 0
      );
      
      if (scoreMayor > mejorMatch.score) {
        mejorMatch = { tonalidad: tonica, escala: 'major', score: scoreMayor };
      }
      
      // Escala menor
      const keyMenor = Key.minorKey(tonica);
      const notasMenor = (keyMenor.natural?.scale || []).map(n => Note.pitchClass(n)).filter(Boolean);
      const scoreMenor = notasOrdenadas.reduce((score, nota, index) => 
        notasMenor.includes(nota) ? score + (notasOrdenadas.length - index) : score, 0
      );
      
      if (scoreMenor > mejorMatch.score) {
        mejorMatch = { tonalidad: tonica, escala: 'minor', score: scoreMenor };
      }
    }
    
    // Convertir a Camelot
    const key = `${mejorMatch.tonalidad} ${mejorMatch.escala}`;
    const camelot = KEY_TO_CAMELOT[key] || '8A';
    
    return {
      camelot,
      compatibles: CAMELOT_WHEEL[camelot] || [camelot]
    };
    
  } catch (error) {
    console.warn('Error detectando tonalidad:', error);
    return { camelot: '8A', compatibles: CAMELOT_WHEEL['8A'] };
  }
}

// ============================================================================
// 12. CUE POINTS
// ============================================================================

/**
 * Genera cue points basándose en estructura (frases + downbeats)
 */
function generarCuePointsReales(
  beats: number[],
  downbeats: number[],
  loudnessPerBeat: number[],
  duracionMs: number
): { cuePoints: CuePoint[]; mixInPoint: number; mixOutPoint: number } {
  const usarFallback = () => {
    const frasesFallback = construirFrasesDesdeDownbeats(downbeats);
    return generarCuePointsHeuristico(downbeats, frasesFallback, duracionMs);
  };

  if (downbeats.length === 0 || beats.length === 0) {
    return usarFallback();
  }

  try {
    const boundaries = new Set<number>();
    boundaries.add(downbeats[0] ?? beats[0]);

    if (loudnessPerBeat.length > 1) {
      const diffs: Array<{ index: number; diff: number }> = [];
      let sum = 0;
      let sumSq = 0;

      const usableLength = Math.min(loudnessPerBeat.length, beats.length);

      for (let i = 1; i < usableLength; i++) {
        const diff = Math.abs(loudnessPerBeat[i] - loudnessPerBeat[i - 1]);
        diffs.push({ index: i, diff });
        sum += diff;
        sumSq += diff * diff;
      }

      if (diffs.length > 0) {
        const mean = sum / diffs.length;
        const variance = Math.max(sumSq / diffs.length - mean * mean, 0);
        const std = Math.sqrt(variance);
        const threshold = mean + std * 0.75;

        diffs
          .filter(item => item.diff >= threshold)
          .forEach(item => {
            boundaries.add(beats[item.index]);
          });
      }
    }

    const midIndex = Math.floor(downbeats.length / 2);
    if (midIndex > 0) {
      boundaries.add(downbeats[midIndex]);
    }

    const penultimateDownbeat = downbeats[downbeats.length - 2];
    if (typeof penultimateDownbeat === 'number') {
      boundaries.add(penultimateDownbeat);
    }

    boundaries.add(downbeats[downbeats.length - 1]);

    const sortedBoundaries = Array.from(boundaries)
      .map(time => snapToNearestDownbeat(time, downbeats))
      .filter(time => Number.isFinite(time) && time >= 0 && time <= duracionMs)
      .sort((a, b) => a - b);

    const uniqueBoundaries = sortedBoundaries.filter((time, index, arr) => index === 0 || time !== arr[index - 1]);

    if (uniqueBoundaries.length < 3) {
      return usarFallback();
    }

    const cuePoints: CuePoint[] = [];

    uniqueBoundaries.forEach((time, index) => {
      let tipo: CuePoint['tipo'] = 'break';
      let descripcion = `Sección ${index + 1}`;
      let color: string | undefined;

      if (index === 0) {
        tipo = 'intro';
        descripcion = 'Inicio de la canción';
        color = '#00ff00';
      } else if (index === 1) {
        tipo = 'drop';
        descripcion = 'Primer clímax/drop';
        color = '#ff0000';
      } else if (index === uniqueBoundaries.length - 1) {
        tipo = 'outro';
        descripcion = 'Inicio del outro';
        color = '#0000ff';
      }

      cuePoints.push({
        tiempo_ms: time,
        tipo,
        descripcion,
        color
      });
    });

    const mixInPoint = cuePoints[1]?.tiempo_ms ?? downbeats[0] ?? 0;
    const mixOutCandidate = cuePoints[cuePoints.length - 1]?.tiempo_ms;
    const mixOutPoint = typeof mixOutCandidate === 'number' ? mixOutCandidate : Math.max(0, duracionMs - 30000);

    return { cuePoints, mixInPoint, mixOutPoint };
  } catch (error) {
    console.warn('   ⚠️ Error generando cue points a partir de Essentia, se usa heurística', error);
    return usarFallback();
  }
}

function generarCuePointsHeuristico(
  downbeats: number[],
  frases: number[],
  duracionMs: number
): { cuePoints: CuePoint[]; mixInPoint: number; mixOutPoint: number } {
  const cuePoints: CuePoint[] = [];
  
  if (frases.length > 0) {
    cuePoints.push({
      tiempo_ms: frases[0],
      tipo: 'intro',
      descripcion: 'Inicio de la canción',
      color: '#00ff00'
    });
  }
  
  if (frases.length > 2) {
    cuePoints.push({
      tiempo_ms: frases[2],
      tipo: 'drop',
      descripcion: 'Primer drop/estribillo',
      color: '#ff0000'
    });
  }
  
  const mitad = Math.floor(frases.length / 2);
  if (mitad > 0 && mitad < frases.length) {
    cuePoints.push({
      tiempo_ms: frases[mitad],
      tipo: 'break',
      descripcion: 'Break/puente',
      color: '#ffff00'
    });
  }
  
  if (frases.length > 2) {
    cuePoints.push({
      tiempo_ms: frases[frases.length - 2],
      tipo: 'outro',
      descripcion: 'Inicio del outro',
      color: '#0000ff'
    });
  }
  
  const mixInPoint = frases.length > 1 ? frases[1] : (downbeats.length > 16 ? downbeats[16] : 0);
  const mixOutPoint = downbeats.length > 16 ? downbeats[downbeats.length - 16] : Math.max(0, duracionMs - 30000);
  
  return { cuePoints, mixInPoint, mixOutPoint };
}

// ============================================================================
// 13. ANÁLISIS COMPLETO
// ============================================================================

/**
 * Procesa múltiples archivos de audio en lotes de hasta 10 simultáneos
 * Respeta el límite de 10 peticiones por minuto de Gemini
 */
export async function analizarAudiosEnLote(
  buffers: { id: string; buffer: Buffer; config?: AnalisisConfig }[],
  onProgress?: (completados: number, total: number, resultado: { id: string; analisis: AnalisisCompleto }) => void
): Promise<{ id: string; analisis: AnalisisCompleto; error?: string }[]> {
  const BATCH_SIZE = 10; // Máximo 10 canciones en paralelo
  const resultados: { id: string; analisis: AnalisisCompleto; error?: string }[] = [];
  
  console.log(`\n📊 Iniciando análisis por lotes: ${buffers.length} canciones (${BATCH_SIZE} en paralelo)`);
  
  // Procesar en lotes de 10
  for (let i = 0; i < buffers.length; i += BATCH_SIZE) {
    const lote = buffers.slice(i, i + BATCH_SIZE);
    const numeroLote = Math.floor(i / BATCH_SIZE) + 1;
    const totalLotes = Math.ceil(buffers.length / BATCH_SIZE);
    
    console.log(`\n🎵 Procesando lote ${numeroLote}/${totalLotes} (${lote.length} canciones)...`);
    
    // Procesar todas las canciones del lote en paralelo
    const promesasLote = lote.map(async ({ id, buffer, config }) => {
      try {
        const analisis = await analizarAudioCompleto(buffer, config);
        const resultado = { id, analisis };
        
        // Notificar progreso
        if (onProgress) {
          onProgress(resultados.length + 1, buffers.length, resultado);
        }
        
        return resultado;
      } catch (error) {
        console.error(`❌ Error analizando ${id}:`, error);
        return {
          id,
          analisis: null as any,
          error: error instanceof Error ? error.message : 'Error desconocido'
        };
      }
    });
    
    // Esperar a que termine todo el lote
    const resultadosLote = await Promise.all(promesasLote);
    resultados.push(...resultadosLote);
    
    console.log(`✅ Lote ${numeroLote}/${totalLotes} completado (${resultados.length}/${buffers.length} canciones procesadas)`);
    
    // Si hay más lotes, esperar un pequeño delay para no saturar
    if (i + BATCH_SIZE < buffers.length) {
      console.log('⏳ Esperando 1 segundo antes del siguiente lote...');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  const exitosos = resultados.filter(r => !r.error).length;
  const fallidos = resultados.filter(r => r.error).length;
  
  console.log(`\n✅ Análisis por lotes completado:`);
  console.log(`   - Total: ${buffers.length} canciones`);
  console.log(`   - Exitosos: ${exitosos}`);
  console.log(`   - Fallidos: ${fallidos}`);
  
  return resultados;
}

/**
 * FUNCIÓN PRINCIPAL: Analiza audio completo
 * Combina todos los análisis en un solo resultado
 */
/**
 * Encuentra puntos de cambio brusco de energía (picos en la derivada del RMS)
 * Estos puntos marcan transiciones musicales (intro→verso, verso→estribillo, etc.)
 */
function encontrarPuntosDeCorte(
  energias: number[],
  ventanaMs: number,
  minDistanciaMs: number = 10000 // Mínimo 10s entre cortes para evitar fragmentación excesiva
): number[] {
  if (energias.length < 3) return [];
  
  // 1. Calcular diferencias entre ventanas consecutivas (derivada de energía)
  const diferencias: number[] = [];
  for (let i = 1; i < energias.length; i++) {
    diferencias.push(Math.abs(energias[i] - energias[i - 1]));
  }
  
  // 2. Suavizar con media móvil (ventana de 5 para eliminar ruido)
  const diferenciasSuavizadas: number[] = [];
  for (let i = 0; i < diferencias.length; i++) {
    const inicio = Math.max(0, i - 2);
    const fin = Math.min(diferencias.length, i + 3);
    const ventana = diferencias.slice(inicio, fin);
    const promedio = ventana.reduce((a, b) => a + b, 0) / ventana.length;
    diferenciasSuavizadas.push(promedio);
  }
  
  // 3. Calcular umbral adaptativo para detectar cambios significativos
  const promedio = diferenciasSuavizadas.reduce((a, b) => a + b, 0) / diferenciasSuavizadas.length;
  const varianza = diferenciasSuavizadas.reduce((sum, val) => sum + Math.pow(val - promedio, 2), 0) / diferenciasSuavizadas.length;
  const desviacion = Math.sqrt(varianza);
  const umbralPico = promedio + 1.5 * desviacion;
  
  // 4. Detectar picos: puntos que superan el umbral y son máximos locales
  const puntosDeCorte: number[] = [0]; // Siempre empezar en 0
  const minVentanasEntreCortes = Math.floor(minDistanciaMs / ventanaMs);
  
  for (let i = 1; i < diferenciasSuavizadas.length - 1; i++) {
    const esPico = diferenciasSuavizadas[i] > umbralPico &&
                   diferenciasSuavizadas[i] > diferenciasSuavizadas[i - 1] &&
                   diferenciasSuavizadas[i] > diferenciasSuavizadas[i + 1];
    
    if (esPico) {
      const tiempoMs = i * ventanaMs;
      const ultimoCorte = puntosDeCorte[puntosDeCorte.length - 1];
      
      // Respetar distancia mínima entre cortes
      if (tiempoMs - ultimoCorte >= minDistanciaMs) {
        puntosDeCorte.push(tiempoMs);
      }
    }
  }
  
  return puntosDeCorte;
}

/**
 * Detecta segmentos de voz con configuración personalizada de umbrales
 * Versión parametrizable para ejecutar múltiples pasadas con diferentes sensibilidades
 */
function detectarSegmentosVozConConfig(
  audioData: Float32Array,
  sampleRate: number,
  config: {
    ventanaMs?: number;
    minSilencioDuracionMs?: number;
    percentilEnergia?: number;
    percentilZCR?: number;
    multiplicadorEnergia?: number;
    multiplicadorZCR?: number;
    minDuracionSegmento?: number;
  } = {}
): Array<{ start_ms: number; end_ms: number }> {
  const {
    ventanaMs = 50,
    minSilencioDuracionMs = 700,
    percentilEnergia = 0.25,
    percentilZCR = 0.40,
    multiplicadorEnergia = 1.5,
    multiplicadorZCR = 1.2,
    minDuracionSegmento = 450
  } = config;

  const muestrasPorVentana = Math.floor((ventanaMs / 1000) * sampleRate);
  const numVentanas = Math.floor(audioData.length / muestrasPorVentana);
  const duracionTotalMs = (audioData.length / sampleRate) * 1000;
  
  // Calcular características por ventana
  const caracteristicas: Array<{
    energia: number;
    zcr: number;
    espectralCentroid: number;
    tiempoMs: number;
  }> = [];
  
  for (let i = 0; i < numVentanas; i++) {
    const inicio = i * muestrasPorVentana;
    const ventana = audioData.slice(inicio, Math.min(inicio + muestrasPorVentana, audioData.length));
    
    // Energía RMS
    let sumaEnergia = 0;
    for (let j = 0; j < ventana.length; j++) {
      sumaEnergia += ventana[j] * ventana[j];
    }
    const energia = Math.sqrt(sumaEnergia / ventana.length);
    
    // Zero Crossing Rate
    let crossings = 0;
    for (let j = 1; j < ventana.length; j++) {
      if ((ventana[j] >= 0 && ventana[j - 1] < 0) || (ventana[j] < 0 && ventana[j - 1] >= 0)) {
        crossings++;
      }
    }
    const zcr = crossings / ventana.length;
    
    // Spectral Centroid simplificado
    let sumaMagnitudes = 0;
    let sumaPonderada = 0;
    for (let j = 0; j < ventana.length; j++) {
      const magnitud = Math.abs(ventana[j]);
      sumaMagnitudes += magnitud;
      sumaPonderada += magnitud * j;
    }
    const espectralCentroid = sumaMagnitudes > 0 ? sumaPonderada / sumaMagnitudes : 0;
    
    caracteristicas.push({
      energia,
      zcr,
      espectralCentroid,
      tiempoMs: Math.floor((inicio / sampleRate) * 1000),
    });
  }
  
  // Segmentación dinámica por cambios de energía
  const energiasSimplificadas = caracteristicas.map(c => c.energia);
  const puntosDeCorteMs = encontrarPuntosDeCorte(energiasSimplificadas, ventanaMs, 10000);
  
  const bloquesDinamicos: Array<{ inicio_ms: number; fin_ms: number }> = [];
  for (let i = 0; i < puntosDeCorteMs.length; i++) {
    const inicioMs = puntosDeCorteMs[i];
    const finMs = i < puntosDeCorteMs.length - 1 ? puntosDeCorteMs[i + 1] : duracionTotalMs;
    bloquesDinamicos.push({ inicio_ms: inicioMs, fin_ms: finMs });
  }
  
  const esVoz: boolean[] = new Array(caracteristicas.length).fill(false);
  
  // Análisis adaptativo por bloque con umbrales configurables
  for (let idx = 0; idx < bloquesDinamicos.length; idx++) {
    const bloque = bloquesDinamicos[idx];
    const inicioVentana = Math.floor(bloque.inicio_ms / ventanaMs);
    const finVentana = Math.min(Math.floor(bloque.fin_ms / ventanaMs), caracteristicas.length);
    const caracteristicasBloque = caracteristicas.slice(inicioVentana, finVentana);
    
    if (caracteristicasBloque.length === 0) continue;
    
    const energiasBloque = caracteristicasBloque.map(c => c.energia).sort((a, b) => a - b);
    const zcrsBloque = caracteristicasBloque.map(c => c.zcr).sort((a, b) => a - b);
    
    const umbralEnergiaLocal = energiasBloque[Math.floor(energiasBloque.length * percentilEnergia)];
    const umbralZCRLocal = zcrsBloque[Math.floor(zcrsBloque.length * percentilZCR)];
    
    for (let i = 0; i < caracteristicasBloque.length; i++) {
      const idxGlobal = inicioVentana + i;
      const c = caracteristicasBloque[i];
      
      const tieneEnergia = c.energia > umbralEnergiaLocal * multiplicadorEnergia;
      const tieneZCRAltro = c.zcr > umbralZCRLocal * multiplicadorZCR;
      
      esVoz[idxGlobal] = tieneEnergia && tieneZCRAltro;
    }
  }
  
  // Suavizar con filtro de mediana
  const esVozSuavizado = [...esVoz];
  for (let i = 2; i < esVoz.length - 2; i++) {
    const ventanaLocal = esVoz.slice(i - 2, i + 3);
    const conteoVerdaderos = ventanaLocal.filter(v => v).length;
    esVozSuavizado[i] = conteoVerdaderos >= 3;
  }
  
  // Detectar transiciones voz/silencio
  const segmentos: Array<{ start_ms: number; end_ms: number }> = [];
  let inicioSegmento: number | null = null;
  let contadorSilencioVentanas = 0;
  const ventanasSilencioMinimas = Math.ceil(minSilencioDuracionMs / ventanaMs);
  
  for (let i = 0; i < esVozSuavizado.length; i++) {
    if (esVozSuavizado[i]) {
      contadorSilencioVentanas = 0;
      if (inicioSegmento === null) {
        inicioSegmento = caracteristicas[i].tiempoMs;
      }
    } else {
      if (inicioSegmento !== null) {
        contadorSilencioVentanas++;
        if (contadorSilencioVentanas >= ventanasSilencioMinimas) {
          const finSegmento = caracteristicas[i - ventanasSilencioMinimas].tiempoMs;
          if (finSegmento > inicioSegmento) {
            segmentos.push({ start_ms: inicioSegmento, end_ms: finSegmento });
          }
          inicioSegmento = null;
          contadorSilencioVentanas = 0;
        }
      }
    }
  }
  
  if (inicioSegmento !== null) {
    const ultimaVentana = caracteristicas[caracteristicas.length - 1];
    segmentos.push({ start_ms: inicioSegmento, end_ms: ultimaVentana.tiempoMs });
  }
  
  // Filtrar segmentos muy cortos
  return segmentos.filter(seg => (seg.end_ms - seg.start_ms) >= minDuracionSegmento);
}

/**
 * Fusiona segmentos que se solapan o están muy cerca
 */
function fusionarSegmentosVoz(
  segmentos: Array<{ start_ms: number; end_ms: number }>,
  huecoMaximoMs: number = 500
): Array<{ start_ms: number; end_ms: number }> {
  if (segmentos.length === 0) return [];
  
  // Ordenar por tiempo de inicio
  const ordenados = [...segmentos].sort((a, b) => a.start_ms - b.start_ms);
  const fusionados: Array<{ start_ms: number; end_ms: number }> = [];
  
  let actual = { ...ordenados[0] };
  
  for (let i = 1; i < ordenados.length; i++) {
    const siguiente = ordenados[i];
    
    // Si el siguiente segmento empieza antes de que termine el actual + hueco máximo
    if (siguiente.start_ms <= actual.end_ms + huecoMaximoMs) {
      // Fusionar extendiendo el fin del segmento actual
      actual.end_ms = Math.max(actual.end_ms, siguiente.end_ms);
    } else {
      // Guardar el segmento actual y empezar uno nuevo
      fusionados.push(actual);
      actual = { ...siguiente };
    }
  }
  
  fusionados.push(actual);
  return fusionados;
}

/**
 * Detecta segmentos de voz usando análisis adaptativo con segmentación DINÁMICA
 * Implementa enfoque HÍBRIDO: VAD principal + VAD súper sensible para intros/outros
 */
function detectarSegmentosVozBasico(
  audioData: Float32Array,
  sampleRate: number,
  ventanaMs: number = 50,
  minSilencioDuracionMs: number = 700
): Array<{ start_ms: number; end_ms: number }> {
  console.log('   🔬 VAD Híbrido: Ejecutando análisis en 2 pasadas...');
  
  // PASADA 1: VAD Adaptativo Principal (alta confianza)
  console.log('   📊 Pasada 1/2: VAD Adaptativo (umbrales estándar)');
  const segmentosPrincipales = detectarSegmentosVozConConfig(audioData, sampleRate, {
    ventanaMs,
    minSilencioDuracionMs,
    percentilEnergia: 0.25,
    percentilZCR: 0.40,
    multiplicadorEnergia: 1.5,
    multiplicadorZCR: 1.2,
    minDuracionSegmento: 450
  });
  
  console.log(`      ✅ ${segmentosPrincipales.length} segmentos detectados (alta confianza)`);
  
  // PASADA 2: VAD Súper Sensible (red de seguridad para voces suaves)
  console.log('   🎯 Pasada 2/2: VAD Súper Sensible (captura intros/outros suaves)');
  const segmentosSensibles = detectarSegmentosVozConConfig(audioData, sampleRate, {
    ventanaMs,
    minSilencioDuracionMs: 500, // Más permisivo con huecos
    percentilEnergia: 0.10,     // MUCHO más bajo (percentil 10 en lugar de 25)
    percentilZCR: 0.20,          // Más bajo (percentil 20 en lugar de 40)
    multiplicadorEnergia: 1.2,   // Menos estricto
    multiplicadorZCR: 1.1,       // Menos estricto
    minDuracionSegmento: 300     // Segmentos más cortos permitidos
  });
  
  console.log(`      ✅ ${segmentosSensibles.length} segmentos adicionales detectados (sensible)`);
  
  // FUSIÓN INTELIGENTE: Agregar segmentos sensibles que estén en "huecos" del VAD principal
  const todosLosSegmentos = [...segmentosPrincipales];
  let segmentosNuevos = 0;
  
  for (const segSensible of segmentosSensibles) {
    // ¿Este segmento sensible está en un hueco (no solapa con ningún segmento principal)?
    const estaEnHueco = !segmentosPrincipales.some(segPrincipal => 
      segSensible.start_ms < segPrincipal.end_ms && segSensible.end_ms > segPrincipal.start_ms
    );
    
    if (estaEnHueco) {
      todosLosSegmentos.push(segSensible);
      segmentosNuevos++;
    }
  }
  
  console.log(`      🔗 ${segmentosNuevos} segmentos nuevos agregados de VAD sensible`);
  
  // Ordenar y fusionar segmentos que estén muy cerca
  todosLosSegmentos.sort((a, b) => a.start_ms - b.start_ms);
  const segmentosFinales = fusionarSegmentosVoz(todosLosSegmentos, 500);
  
  if (segmentosFinales.length > 0) {
    const primerSegmentoMs = segmentosFinales[0].start_ms;
    console.log(`   🎙️ VAD Híbrido: ${segmentosFinales.length} segmentos finales (primer segmento: ${primerSegmentoMs}ms)`);
  } else {
    console.log(`   ⚠️ VAD Híbrido: 0 segmentos detectados - posible audio instrumental puro`);
  }
  
  return segmentosFinales;
}


export async function analizarAudioCompleto(buffer: Buffer, config: AnalisisConfig = {}): Promise<AnalisisCompleto> {
  console.log('🎵 Iniciando análisis completo con Essentia.js...');
  if (config.fast) console.log('⚡ MODO RÁPIDO ACTIVADO: Saltando análisis pesados');

  const audioPromise = decodificarAudio(buffer);
  const essentiaPromise = loadEssentiaInstance().catch(error => {
    console.warn('Essentia no pudo inicializarse, se usará el plan de respaldo', error);
    return null;
  });

  let audioBuffer = await audioPromise;
  
  // CRÍTICO: Remuestrear a 44.1kHz si es necesario (Essentia.js requiere esta tasa)
  if (audioBuffer.sampleRate !== 44100) {
    console.log(`🔄 Audio original: ${audioBuffer.sampleRate}Hz - remuestreando a 44100Hz para Essentia.js...`);
    audioBuffer = await remuestrearAudioBuffer(audioBuffer, 44100);
  } else {
    console.log(`✅ Audio ya está a 44100Hz - no requiere remuestreo`);
  }
  
  // Normalización opcional antes de extraer datos
  const normalizeOpt = config.normalize;
  if (normalizeOpt) {
    const target = typeof normalizeOpt === 'object' && typeof normalizeOpt.targetLUFS === 'number' ? normalizeOpt.targetLUFS : -14;
    normalizarAudioBufferInPlace(audioBuffer, target);
    console.log(`🔊 Normalización aplicada (~${target} LUFS aprox)`);
  }
  const audioData = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  const duracionMs = Math.round(audioBuffer.duration * 1000);

  const essentia = await essentiaPromise;
  let essentiaSignal: EssentiaSignal | null = null;

  if (essentia) {
    try {
      essentiaSignal = prepareEssentiaSignal(essentia, audioData, sampleRate);
      console.log(`   Duración: ${Math.floor(duracionMs / 1000)}s @ ${sampleRate}Hz (procesando a ${essentiaSignal.sampleRate}Hz)`);
    } catch (error) {
      console.warn('Essentia no pudo preparar la señal, aplicando heurísticas de respaldo', error);
      essentiaSignal = null;
    }
  }

  if (!essentiaSignal) {
    console.log(`   Duración: ${Math.floor(duracionMs / 1000)}s @ ${sampleRate}Hz`);
  }

  let ritmo: RitmoResult | null = null;

  if (!config.disable?.bpm && essentia && essentiaSignal) {
    console.log('🥁 Analizando ritmo con Essentia...');
    try {
      ritmo = await analizarRitmoConEssentia(essentia, essentiaSignal);
      console.log(`   ✓ BPM: ${ritmo.bpm}, Compás: ${ritmo.compas.meter ?? `${ritmo.compas.numerador}/${ritmo.compas.denominador}`}`);
    } catch (error) {
      console.warn('   ⚠️ Essentia no pudo analizar el ritmo, se activan heurísticas de respaldo', error);
    }
  }

  if (!ritmo) {
    // Intento con Realtime BPM Analyzer (offline)
    console.log('🥁 Analizando ritmo con Realtime BPM Analyzer...');
    const bpmRba = await detectarBPMConRBA(audioBuffer);
    if (bpmRba) {
      const beatDurationMs = (60 / bpmRba) * 1000;
      const beatsMs: number[] = [];
      for (let t = 0; t < duracionMs; t += beatDurationMs) beatsMs.push(Math.round(t));
      const beatEnergies = computeBeatEnergiesFromAudio(audioData, sampleRate, beatsMs);
      const inferred = inferMeterAndOffset(beatEnergies);
      const downbeatsMs: number[] = [];
      for (let i = inferred.offset; i < beatsMs.length; i += inferred.numerador) downbeatsMs.push(beatsMs[i]);
      const frasesMs = construirFrasesDesdeDownbeats(downbeatsMs);
      ritmo = {
        bpm: bpmRba,
        beatsMs,
        downbeatsMs,
        compas: { numerador: inferred.numerador, denominador: inferred.denominador, meter: inferred.meter },
        frasesMs,
        loudnessPerBeat: []
      };
      console.log(`   ✓ BPM (RBA): ${ritmo.bpm}, Compás: ${ritmo.compas.meter}`);
    }
  }

  if (!ritmo) {
    console.log('🥁 Analizando ritmo con heurísticas...');
    const bpmFallback = detectarBPM(audioData, sampleRate);
    const beatDurationMs = (60 / bpmFallback) * 1000;
    const beatsMs: number[] = [];
    for (let t = 0; t < duracionMs; t += beatDurationMs) beatsMs.push(Math.round(t));
    const beatEnergies = computeBeatEnergiesFromAudio(audioData, sampleRate, beatsMs);
    const inferred = inferMeterAndOffset(beatEnergies);
    const downbeatsMs: number[] = [];
    for (let i = inferred.offset; i < beatsMs.length; i += inferred.numerador) downbeatsMs.push(beatsMs[i]);
    const frasesMs = construirFrasesDesdeDownbeats(downbeatsMs);
    ritmo = {
      bpm: Math.round(bpmFallback * 10) / 10,
      beatsMs,
      downbeatsMs,
      compas: { numerador: inferred.numerador, denominador: inferred.denominador, meter: inferred.meter },
      frasesMs,
      loudnessPerBeat: []
    };
    console.log(`   ✓ BPM (fallback): ${ritmo.bpm}, Compás: ${ritmo.compas.meter}`);
  }

  const bpmFinal = ritmo.bpm;
  const compasFinal = { numerador: ritmo.compas.numerador, denominador: ritmo.compas.denominador };
  const beatsFinal = ritmo.beatsMs;
  const downbeatsFinal = ritmo.downbeatsMs;
  const frasesFinal = ritmo.frasesMs;

  let metricas: { energia: number; bailabilidad: number; animo_general: string } | null = null;

  if (essentia && essentiaSignal) {
    console.log('⚡ Calculando métricas de alto nivel con Essentia...');
    try {
      metricas = await analizarMetricasConEssentia(essentia, essentiaSignal);
      console.log(`   ✓ Energía: ${(metricas.energia * 100).toFixed(0)}%, Bailabilidad ${(metricas.bailabilidad * 100).toFixed(0)}%`);
    } catch (error) {
      console.warn('   ⚠️ Essentia no pudo calcular métricas, se activan fórmulas heurísticas', error);
    }
  }

  if (!metricas) {
    const energiaHeuristica = calcularEnergia(audioData);
    const bailabilidadHeuristica = calcularBailabilidad(bpmFinal, energiaHeuristica);
    const animoHeuristico = detectarAnimo(energiaHeuristica, bpmFinal);
    metricas = {
      energia: Math.round(energiaHeuristica * 100) / 100,
      bailabilidad: Math.round(bailabilidadHeuristica * 100) / 100,
      animo_general: animoHeuristico
    };
    console.log(`   ✓ Energía (fallback): ${(energiaHeuristica * 100).toFixed(0)}%, Bailabilidad ${(bailabilidadHeuristica * 100).toFixed(0)}%`);
  }

  let camelot = '8A';
  let compatibles = CAMELOT_WHEEL['8A'];
  if (!config.disable?.tonalidad) {
    console.log('🎹 Detectando tonalidad...');
    const keyInfo = detectarTonalidad(audioData, sampleRate);
    camelot = keyInfo.camelot;
    compatibles = keyInfo.compatibles;
    console.log(`   ✓ Tonalidad: ${camelot}`);
  } else {
    console.log('🎹 Detección de tonalidad deshabilitada por configuración');
  }

  let cues: { cuePoints: CuePoint[]; mixInPoint: number; mixOutPoint: number } | null = null;

  if (!config.disable?.djCues) {
    if (ritmo.loudnessPerBeat.length > 0) {
      cues = generarCuePointsReales(beatsFinal, downbeatsFinal, ritmo.loudnessPerBeat, duracionMs);
    }
    if (!cues) {
      cues = generarCuePointsHeuristico(downbeatsFinal, frasesFinal, duracionMs);
    }
  } else {
    cues = {
      cuePoints: [],
      mixInPoint: frasesFinal[1] ?? (downbeatsFinal[16] ?? 0),
      mixOutPoint: downbeatsFinal.length > 16 ? downbeatsFinal[downbeatsFinal.length - 16] : Math.max(0, duracionMs - 30000)
    };
  }

  console.log('✅ Análisis completado\n');

  // ============================================================================
  // ANÁLISIS AVANZADOS CON ESSENTIA (OPTIMIZADO)
  // ============================================================================
  
  let ritmoAvanzado: AnalisisCompleto['ritmo_avanzado'];
  let tonalAvanzado: AnalisisCompleto['tonal_avanzado'];
  let loudness: AnalisisCompleto['loudness'];
  let estructura: AnalisisCompleto['estructura'];
  
  if (essentia && essentiaSignal) {
    console.log('🔬 Ejecutando análisis avanzados de Essentia (optimizado)...');
    
    // Si es modo FAST, saltamos los análisis pesados
    if (config.fast) {
        console.log('   ⏩ MODO FAST: Saltando Ritmo Avanzado, Loudness y ReplayGain');
        ritmoAvanzado = {
            onset_rate: 0,
            beats_loudness: ritmo.loudnessPerBeat,
            danceability: metricas.bailabilidad,
            transients_ts_ms: [],
        };
        tonalAvanzado = {
            key: camelot,
            scale: 'major',
            key_strength: 0,
        };
        loudness = {
            integrated: -14,
            momentary: [],
            short_term: [],
            dynamic_range: 0,
            loudness_range: 0,
            replay_gain_db: 0,
        };
        // Estructura es rápida, la mantenemos
        estructura = await analizarEstructura(essentia, essentiaSignal, duracionMs);
    } else {
        // Ejecutar solo los análisis relevantes para DJs en paralelo
        const [
          ritmoAvanzadoResult,
          tonalAvanzadoResult,
          loudnessResult,
          replayGainResult,
          estructuraResult
        ] = await Promise.all([
          analizarRitmoAvanzado(essentia, essentiaSignal),
          analizarTonalAvanzado(essentia, essentiaSignal),
          analizarLoudness(essentia, essentiaSignal),
          analizarReplayGain(essentia, essentiaSignal),
          analizarEstructura(essentia, essentiaSignal, duracionMs)
        ]);
        
        ritmoAvanzado = ritmoAvanzadoResult;
        ritmoAvanzado.beats_loudness = ritmo.loudnessPerBeat; // Añadir loudness de beats
        tonalAvanzado = tonalAvanzadoResult;
        if (tonalAvanzado.key_strength >= 0.35) {
          const canonicalKey = canonicalKeyFromString(tonalAvanzado.key);
          if (canonicalKey) {
            const advancedCamelot = KEY_TO_CAMELOT[canonicalKey];
            if (advancedCamelot) {
              camelot = advancedCamelot;
              compatibles = CAMELOT_WHEEL[camelot] || [camelot];
            }
          }
        }
        loudness = loudnessResult;
        loudness.replay_gain_db = replayGainResult.replay_gain_db; // Añadir ReplayGain
        estructura = estructuraResult;
    }
    
    console.log('   ✓ Análisis avanzados completados');
  } else {
    // Valores por defecto si Essentia no está disponible
    console.log('⚠️ Essentia no disponible, usando valores por defecto para análisis avanzados');
    ritmoAvanzado = {
      onset_rate: 0,
      beats_loudness: ritmo.loudnessPerBeat,
      danceability: metricas.bailabilidad,
      transients_ts_ms: [],
    };
    tonalAvanzado = {
      key: camelot,
      scale: 'major',
      key_strength: 0,
    };
    loudness = {
      integrated: -14,
      momentary: [],
      short_term: [],
      dynamic_range: 0,
      loudness_range: 0,
      replay_gain_db: 0,
    };
    estructura = {
      segmentos: [],
      intro_duration_ms: 0,
      outro_duration_ms: 0,
      fade_in_duration_ms: 0,
      fade_out_duration_ms: 0,
    };
  }
  
  // Detectar segmentos de voz (VAD básico)
  console.log('🎬 Detectando segmentos de voz (VAD)...');
  const segmentosVoz = detectarSegmentosVozBasico(audioData, sampleRate);
  console.log(`   ✓ ${segmentosVoz.length} segmentos de voz detectados`);

  return {
    bpm: bpmFinal,
    bpm_rango: { min: bpmFinal * 0.97, max: bpmFinal * 1.03 },
    tonalidad_camelot: camelot,
    tonalidad_compatible: compatibles,
    energia: metricas.energia,
    bailabilidad: metricas.bailabilidad,
    animo_general: metricas.animo_general,
    compas: compasFinal,
    duracion_ms: duracionMs,
    downbeats_ts_ms: downbeatsFinal,
    beats_ts_ms: beatsFinal,
    frases_ts_ms: frasesFinal,
    transientes_ritmicos_ts_ms: ritmoAvanzado.transients_ts_ms,
    // Características avanzadas OPTIMIZADAS para DJs
    ritmo_avanzado: ritmoAvanzado,
    tonal_avanzado: tonalAvanzado,
    loudness,
    estructura,
    // Datos para análisis adicional
    segmentos_voz: segmentosVoz,
  };
}
