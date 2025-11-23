import { actualizarProgresoJob } from './analysis-jobs';
/**
 * Optimizador de peticiones a Gemini
 * UNA SOLA PETICIÓN para transcripción + análisis completo
 */

import { GoogleGenAI } from '@google/genai';
import type {
  AnalisisContenido,
  EstructuraMusical,
  EventoClaveDJ,
  TranscripcionPalabra,
} from './db';
import { getGeminiApiKeys } from './gemini-keys';

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

const SECCION_MAP: Record<string, EstructuraMusical['tipo_seccion']> = {
  intro: 'intro',
  verso: 'verso',
  estribillo: 'estribillo',
  puente: 'puente',
  instrumental: 'solo_instrumental',
  outro: 'outro',
  build_up: 'subidon_build_up',
};

const EVENTO_DJ_MAP: Record<string, EventoClaveDJ['evento']> = {
  drop: 'caida_de_bajo',
  break: 'acapella_break',
  build_up: 'cambio_ritmico_notable',
  cambio_ritmo: 'cambio_ritmico_notable',
  hook: 'melodia_iconica',
};

function mapSeccionToTipo(seccion: string): EstructuraMusical['tipo_seccion'] {
  return SECCION_MAP[seccion] || 'verso';
}

function mapEventoDJ(tipo: string): EventoClaveDJ['evento'] | null {
  return EVENTO_DJ_MAP[tipo] || null;
}

const RMS_SAMPLE_WINDOW_MS = 250;

function pickExtremePositions(values: number[], count: number, order: 'max' | 'min'): number[] {
  if (!values.length || count <= 0) return [];
  return values
    .map((value, idx) => ({ value, idx }))
    .sort((a, b) => (order === 'max' ? b.value - a.value : a.value - b.value))
    .slice(0, count)
    .map(({ idx }) => idx * RMS_SAMPLE_WINDOW_MS);
}

function pickBeatPositions(
  beatsLoudness: number[],
  beatsTimeline: number[],
  count: number
): number[] {
  if (!beatsLoudness.length || !beatsTimeline.length || count <= 0) return [];
  return beatsLoudness
    .map((value, idx) => ({ value, tiempo: beatsTimeline[idx] ?? beatsTimeline[beatsTimeline.length - 1] }))
    .sort((a, b) => b.value - a.value)
    .slice(0, count)
    .map(({ tiempo }) => Math.round(tiempo));
}

const geminiClientCache = new Map<string, GoogleGenAI>();
let currentKeyIndex = 0;
let keyFailureCount = new Map<string, number>();

function getGeminiClient(apiKeyOverride?: string): GoogleGenAI {
  if (apiKeyOverride) {
    if (!geminiClientCache.has(apiKeyOverride)) {
      geminiClientCache.set(apiKeyOverride, new GoogleGenAI({ apiKey: apiKeyOverride }));
    }
    return geminiClientCache.get(apiKeyOverride)!;
  }

  const allKeys = getGeminiApiKeys();
  if (allKeys.length === 0) {
    throw new Error('No hay API keys de Gemini configuradas');
  }

  // Rotar entre keys disponibles (round-robin con skip de keys fallidas)
  let attempts = 0;
  while (attempts < allKeys.length) {
    currentKeyIndex = (currentKeyIndex + 1) % allKeys.length;
    const selectedKey = allKeys[currentKeyIndex];
    const failures = keyFailureCount.get(selectedKey) || 0;

    // Skip keys que han fallado más de 3 veces consecutivas
    if (failures < 3) {
      if (!geminiClientCache.has(selectedKey)) {
        geminiClientCache.set(selectedKey, new GoogleGenAI({ apiKey: selectedKey }));
      }
      console.log(`🔑 Usando API key #${currentKeyIndex + 1}/${allKeys.length} (${failures} fallos previos)`);
      return geminiClientCache.get(selectedKey)!;
    }
    attempts++;
  }

  // Si todas las keys están marcadas como fallidas, resetear contadores e intentar de nuevo
  console.warn('⚠️ Todas las API keys han fallado. Reseteando contadores...');
  keyFailureCount.clear();
  currentKeyIndex = 0;
  const firstKey = allKeys[0];
  if (!geminiClientCache.has(firstKey)) {
    geminiClientCache.set(firstKey, new GoogleGenAI({ apiKey: firstKey }));
  }
  return geminiClientCache.get(firstKey)!;
}

function markKeyFailure(client: GoogleGenAI): void {
  // Encontrar qué key usó este client
  for (const [key, cachedClient] of geminiClientCache.entries()) {
    if (cachedClient === client) {
      const failures = (keyFailureCount.get(key) || 0) + 1;
      keyFailureCount.set(key, failures);
      console.warn(`⚠️ Key marcada con ${failures} fallos`);
      break;
    }
  }
}

function markKeySuccess(client: GoogleGenAI): void {
  // Resetear contador de fallos para esta key
  for (const [key, cachedClient] of geminiClientCache.entries()) {
    if (cachedClient === client) {
      keyFailureCount.set(key, 0);
      break;
    }
  }
}

const RETRYABLE_GEMINI_CODES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
const RETRYABLE_GEMINI_LABELS = new Set([
  'unavailable',
  'resource_exhausted',
  'deadline_exceeded',
  'aborted',
]);

function isRetryableGeminiError(error: any): boolean {
  if (!error) return false;
  const status = Number(error?.status ?? error?.code ?? error?.error?.code);
  const statusLabel = String(error?.error?.status ?? '').toLowerCase();
  const message = String(error?.message ?? '').toLowerCase();
  const errorString = String(error).toLowerCase();

  if (RETRYABLE_GEMINI_CODES.has(status)) return true;
  if (statusLabel && RETRYABLE_GEMINI_LABELS.has(statusLabel)) return true;

  return [
    'overloaded',
    'temporarily unavailable',
    'quota',
    'try again later',
    'fetch failed',
    'etimedout',
    'network',
    'econnreset',
    'deadline',
  ].some(keyword => message.includes(keyword) || errorString.includes(keyword));
}

export interface FileUploadResult {
  name: string;
  uri: string;
  mimeType: string;
  sizeBytes: number;
}

/**
 * 1. POLLING INTELIGENTE - Espera activa del procesamiento del archivo
 * En lugar de espera fija, consulta el estado hasta que esté listo
 */
export async function esperarProcesamientoArchivo(
  fileName: string,
  options: {
    maxWaitTimeMs?: number;
    pollIntervalMs?: number;
  } = {}
): Promise<void> {
  const ai = getGeminiClient();
  const {
    maxWaitTimeMs = 120000, // 2 minutos máximo
    pollIntervalMs = 5000,   // Consultar cada 5 segundos
  } = options;

  console.log('⏳ Esperando a que Gemini procese el archivo...');

  let fileState = await ai.files.get({ name: fileName });
  let waitedTimeMs = 0;

  while (fileState.state === 'PROCESSING' && waitedTimeMs < maxWaitTimeMs) {
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    waitedTimeMs += pollIntervalMs;
    console.log(`   ...esperando (${waitedTimeMs / 1000}s) - Estado: ${fileState.state}`);
    fileState = await ai.files.get({ name: fileName });
  }

  if (fileState.state !== 'ACTIVE') {
    throw new Error(
      `El archivo ${fileName} no pudo ser procesado a tiempo. ` +
      `Estado final: ${fileState.state}. Tiempo de espera: ${waitedTimeMs}ms`
    );
  }

  console.log(`✅ Archivo procesado y ACTIVO (${waitedTimeMs / 1000}s)`);
}

/**
 * ESTRUCTURA DE DATOS UNIFICADA
 * Consolida toda la información de análisis en un solo objeto
 */
export interface CancionAnalizada {
  // Identificación
  id?: string;
  hash_archivo: string;
  titulo: string;

  // Métricas básicas
  bpm: number;
  tonalidad_camelot: string;
  tonalidad_compatible: string[];
  energia: number;
  bailabilidad: number;
  animo_general: string;
  compas: { numerador: number; denominador: number };
  duracion_ms: number;

  // Timing y estructura
  beats_ts_ms: number[];
  downbeats_ts_ms: number[];
  frases_ts_ms: number[];

  // Transcripción palabra por palabra
  palabras: Array<{
    palabra: string;
    inicio_ms: number;
    fin_ms: number;
  }>;

  // Análisis de huecos instrumentales
  huecos_analizados: AnalisisHuecoInstrumental[];

  // Estructura musical
  estructura: Array<{
    seccion: 'intro' | 'verso' | 'estribillo' | 'puente' | 'instrumental' | 'outro' | 'build_up';
    inicio_ms: number;
    fin_ms: number;
  }>;

  // Tema y contenido
  tema: {
    resumen: string;
    palabras_clave: string[];
    emocion: 'alegre' | 'triste' | 'energético' | 'romántico' | 'melancólico' | 'festivo' | 'reflexivo';
  };

  // Eventos para DJ
  eventos_dj: Array<{
    tipo: 'drop' | 'break' | 'build_up' | 'cambio_ritmo' | 'hook';
    tiempo_ms: number;
    descripcion?: string;
  }>;

  // Datos técnicos (VAD + RMS)
  segmentos_voz: Array<{ start_ms: number; end_ms: number }>;
  perfil_energia_rms: number[];

  // Datos persistentes requeridos por la BD
  letras_ts?: TranscripcionPalabra[];
  estructura_ts?: EstructuraMusical[];
  analisis_contenido?: AnalisisContenido;

  // Metadatos
  fecha_procesado?: Date;
}

/**
 * 2. DIVISIÓN EN DOS PASOS
 * Paso 1: Solo transcripción (audio → texto) - LA PARTE LENTA
 */
export interface AnalisisHuecoInstrumental {
  inicio_ms: number;
  fin_ms: number;
  tipo: 'instrumental_puro' | 'coros_melodicos' | 'adlibs_fx' | 'voz_principal_residuo';
  descripcion?: string;
  energia_relativa?: number; // 1-10
}

export interface TranscripcionSchema {
  palabras: Array<{
    palabra: string;
    inicio_ms: number;
    fin_ms: number;
  }>;
  analisis_huecos?: AnalisisHuecoInstrumental[];
}

/**
 * @deprecated Esta función ha sido reemplazada por `analizarConGeminiOptimizado`
 * que hace todo en una sola petición (transcripción + análisis estructural).
 * Se mantiene por compatibilidad pero NO se recomienda su uso.
 */
export async function transcribirAudio(
  fileUri: string,
  fileMimeType: string,
  duracionMs: number,
  segmentosVoz: Array<{ start_ms: number; end_ms: number }>,
  perfilEnergiaRMS: number[],
  nombreCancion?: string
): Promise<TranscripcionSchema> {
  console.log('🎤 PASO 1: Transcribiendo audio PALABRA POR PALABRA con segmentos VAD precisos y verificación de huecos...');
  if (nombreCancion) {
    console.log(`📀 Canción: ${nombreCancion}`);
  }
  console.log(`⏱️  Duración: ${duracionMs}ms (${Math.floor(duracionMs / 1000)}s)`);

  const duracionSegundos = Math.floor(duracionMs / 1000);
  const segmentosFormateados = segmentosVoz.map(s => `[${s.start_ms}, ${s.end_ms}]`).join(', ');

  console.log('\n🎯 SEGMENTOS VAD DETECTADOS:');
  segmentosVoz.forEach((seg, idx) => {
    const duracionSeg = seg.end_ms - seg.start_ms;
    console.log(`   Segmento ${idx + 1}: ${seg.start_ms}ms → ${seg.end_ms}ms (${duracionSeg}ms)`);
  });

  // Calcular huecos instrumentales (espacios entre segmentos VAD)
  const huecosInstrumentales: Array<{ inicio_ms: number; fin_ms: number }> = [];

  // Hueco antes del primer segmento
  if (segmentosVoz.length > 0 && segmentosVoz[0].start_ms > 0) {
    huecosInstrumentales.push({ inicio_ms: 0, fin_ms: segmentosVoz[0].start_ms });
  }

  // Huecos entre segmentos
  for (let i = 0; i < segmentosVoz.length - 1; i++) {
    const finActual = segmentosVoz[i].end_ms;
    const inicioSiguiente = segmentosVoz[i + 1].start_ms;
    if (inicioSiguiente > finActual) {
      huecosInstrumentales.push({ inicio_ms: finActual, fin_ms: inicioSiguiente });
    }
  }

  // Hueco después del último segmento
  if (segmentosVoz.length > 0 && segmentosVoz[segmentosVoz.length - 1].end_ms < duracionMs) {
    huecosInstrumentales.push({
      inicio_ms: segmentosVoz[segmentosVoz.length - 1].end_ms,
      fin_ms: duracionMs
    });
  }

  const huecosFormateados = huecosInstrumentales.map(h => `[${h.inicio_ms}, ${h.fin_ms}]`).join(', ');

  console.log('\n🔍 HUECOS INSTRUMENTALES CALCULADOS:');
  if (huecosInstrumentales.length === 0) {
    console.log('   (No hay huecos - audio continuo)');
  } else {
    huecosInstrumentales.forEach((hueco, idx) => {
      const duracionHueco = hueco.fin_ms - hueco.inicio_ms;
      console.log(`   Hueco ${idx + 1}: ${hueco.inicio_ms}ms → ${hueco.fin_ms}ms (${duracionHueco}ms)`);
    });
  }

  console.log(`\n📊 PERFIL DE ENERGÍA RMS (${perfilEnergiaRMS.length} muestras):`);
  const rmsResumen = perfilEnergiaRMS.slice(0, 10).map(v => v.toFixed(2)).join(', ');
  console.log(`   Primeras 10 muestras: [${rmsResumen}, ...]`);
  const rmsPromedio = (perfilEnergiaRMS.reduce((a, b) => a + b, 0) / perfilEnergiaRMS.length).toFixed(2);
  const rmsMax = Math.max(...perfilEnergiaRMS).toFixed(2);
  console.log(`   Promedio: ${rmsPromedio}, Máximo: ${rmsMax}`);

  const transcriptionSchema = {
    type: 'object',
    properties: {
      palabras: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            palabra: { type: 'string', description: 'Palabra individual' },
            inicio_ms: { type: 'number', description: 'Timestamp exacto de inicio (debe estar dentro de un segmento VAD)' },
            fin_ms: { type: 'number', description: 'Timestamp exacto de fin (debe estar dentro de un segmento VAD)' },
          },
          required: ['palabra', 'inicio_ms', 'fin_ms']
        }
      },
      analisis_huecos: {
        type: 'array',
        description: 'Análisis de los huecos entre segmentos de voz',
        items: {
          type: 'object',
          properties: {
            inicio_ms: { type: 'number', description: 'Inicio del hueco instrumental' },
            fin_ms: { type: 'number', description: 'Fin del hueco instrumental' },
            tipo: {
              type: 'string',
              enum: ['instrumental_puro', 'coros_melodicos', 'adlibs_fx', 'voz_principal_residuo'],
              description: 'Clasificación del contenido del hueco'
            },
            descripcion: {
              type: 'string',
              description: 'Descripción del contenido (obligatorio si no es instrumental_puro)'
            }
          },
          required: ['inicio_ms', 'fin_ms', 'tipo']
        }
      }
    },
    required: ['palabras', 'analisis_huecos']
  };

  const perfilRmsFormateado = `[${perfilEnergiaRMS.map(v => v.toFixed(2)).join(', ')}]`;

  const prompt = `Transcribe palabra por palabra y clasifica huecos instrumentales.

DATOS:
- Duración: ${duracionMs}ms
- Voz detectada: ${segmentosFormateados}
- Huecos a verificar: ${huecosFormateados}
- Perfil RMS: ${perfilRmsFormateado}

TAREA:

1. TRANSCRIPCIÓN:
- Palabra individual con inicio_ms y fin_ms exactos
- Timestamps dentro de segmentos VAD
- Array vacío si instrumental

2. HUECOS:
- Clasifica cada hueco: instrumental_puro | coros_melodicos | adlibs_fx | voz_principal_residuo
- Añade descripcion si no es instrumental_puro
- energia_relativa (1-10) solo si hay voces`;

  console.log('\n📝 PROMPT COMPLETO ENVIADO A GEMINI:');
  console.log('═'.repeat(80));
  console.log(prompt);
  console.log('═'.repeat(80));
  console.log('\n⏳ Esperando respuesta de Gemini...');

  const ai = getGeminiClient();
  const response = await ai.models.generateContent({
    model: 'models/gemini-flash-latest',
    contents: [
      {
        role: 'user',
        parts: [
          { fileData: { fileUri, mimeType: fileMimeType } },
          { text: prompt }
        ]
      }
    ],
    config: {
      temperature: 0, // Máxima precisión - confiamos 100% en los segmentos VAD
      topP: 1,
      topK: 1,
      maxOutputTokens: 65536,
      responseMimeType: 'application/json',
      responseJsonSchema: transcriptionSchema,
    }
  });

  const transcripcion = JSON.parse(response.text || '{"palabras":[],"analisis_huecos":[]}');

  // Validar que las palabras estén dentro de los segmentos VAD
  if (transcripcion.palabras && Array.isArray(transcripcion.palabras)) {
    const palabrasOriginales = transcripcion.palabras.length;
    transcripcion.palabras = transcripcion.palabras.filter((p: any) => {
      if (typeof p.inicio_ms !== 'number' || typeof p.fin_ms !== 'number') return false;
      if (p.inicio_ms < 0 || p.fin_ms > duracionMs || p.inicio_ms >= p.fin_ms) return false;

      // Verificar que la palabra esté dentro de algún segmento VAD
      return segmentosVoz.some(seg =>
        p.inicio_ms >= seg.start_ms && p.fin_ms <= seg.end_ms
      );
    });
    const palabrasDescartadas = palabrasOriginales - transcripcion.palabras.length;
    if (palabrasDescartadas > 0) {
      console.warn(`⚠️ ${palabrasDescartadas} palabras descartadas por estar fuera de segmentos VAD`);
    }
  }

  // Validar análisis de huecos
  if (transcripcion.analisis_huecos && Array.isArray(transcripcion.analisis_huecos)) {
    const huecosOriginales = transcripcion.analisis_huecos.length;
    transcripcion.analisis_huecos = transcripcion.analisis_huecos.filter((h: any) => {
      if (typeof h.inicio_ms !== 'number' || typeof h.fin_ms !== 'number') return false;
      if (!h.tipo || !['instrumental_puro', 'coros_melodicos', 'adlibs_fx', 'voz_principal_residuo'].includes(h.tipo)) return false;
      if (h.inicio_ms < 0 || h.fin_ms > duracionMs || h.inicio_ms >= h.fin_ms) return false;

      // Verificar que el hueco corresponda a uno calculado
      return huecosInstrumentales.some(hueco =>
        Math.abs(h.inicio_ms - hueco.inicio_ms) < 100 && Math.abs(h.fin_ms - hueco.fin_ms) < 100
      );
    });
    const huecosDescartados = huecosOriginales - transcripcion.analisis_huecos.length;
    if (huecosDescartados > 0) {
      console.warn(`⚠️ ${huecosDescartados} huecos descartados por timestamps inválidos`);
    }
  }

  console.log(`✅ PASO 1 completado: 
  - ${transcripcion.palabras?.length || 0} palabras transcritas
  - ${transcripcion.analisis_huecos?.length || 0} huecos analizados`);

  return transcripcion;
}

/**
 * PASO 2: Análisis basado en transcripción (texto → texto) - RÁPIDO
 */
export interface AnalisisAvanzadoSchema {
  estructura: Array<{
    seccion: 'intro' | 'verso' | 'estribillo' | 'puente' | 'instrumental' | 'outro' | 'build_up';
    inicio_ms: number;
    fin_ms: number;
  }>;
  tema: {
    resumen: string;
    palabras_clave: string[];
    emocion: 'alegre' | 'triste' | 'energético' | 'romántico' | 'melancólico' | 'festivo' | 'reflexivo';
  };
  eventos_dj: Array<{
    tipo: 'drop' | 'break' | 'build_up' | 'cambio_ritmo' | 'hook';
    tiempo_ms: number;
    descripcion?: string;
  }>;
}

export async function analizarTranscripcion(
  transcripcion: TranscripcionSchema,
  analisisTecnico: {
    bpm: number;
    compas: { numerador: number; denominador: number };
    energia: number;
    bailabilidad: number;
    animo_general: string;
    tonalidad_camelot: string;
    duracion_ms: number;
    downbeats_ts_ms: number[];
    frases_ts_ms: number[];
    transientes_ritmicos_ts_ms: number[];
  },
  segmentosVoz: Array<{ start_ms: number; end_ms: number }>,
  perfilEnergiaRMS: number[]
): Promise<AnalisisAvanzadoSchema> {
  console.log('🧠 PASO 2: Analizando transcripción y datos técnicos (rápido)...');

  const analysisSchema = {
    type: 'object',
    properties: {
      estructura: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            seccion: {
              type: 'string',
              enum: ['intro', 'verso', 'estribillo', 'puente', 'instrumental', 'outro', 'build_up']
            },
            inicio_ms: { type: 'number' },
            fin_ms: { type: 'number' }
          },
          required: ['seccion', 'inicio_ms', 'fin_ms']
        }
      },
      tema: {
        type: 'object',
        properties: {
          resumen: { type: 'string' },
          palabras_clave: { type: 'array', items: { type: 'string' } },
          emocion: {
            type: 'string',
            enum: ['alegre', 'triste', 'energético', 'romántico', 'melancólico', 'festivo', 'reflexivo']
          }
        },
        required: ['resumen', 'palabras_clave', 'emocion']
      },
      eventos_dj: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            tipo: {
              type: 'string',
              enum: ['drop', 'break', 'build_up', 'cambio_ritmo', 'hook']
            },
            tiempo_ms: { type: 'number' },
            descripcion: { type: 'string' }
          },
          required: ['tipo', 'tiempo_ms']
        }
      }
    },
    required: ['estructura', 'tema', 'eventos_dj']
  };

  const letra = transcripcion.palabras
    .map(p => `[${p.inicio_ms}ms - ${p.fin_ms}ms] ${p.palabra}`)
    .join(' ');

  const duracionMaxMs = analisisTecnico.duracion_ms;
  const duracionSegundos = Math.floor(duracionMaxMs / 1000);
  const segmentosFormateados = segmentosVoz.map(s => `[${s.start_ms}, ${s.end_ms}]`).join(', ');

  // Optimización de tokens: limitar RMS para analizarTranscripcion
  const MAX_RMS_ANALISIS = 1000;
  let rmsAnalisis = perfilEnergiaRMS;
  if (rmsAnalisis.length > MAX_RMS_ANALISIS) {
    const step = Math.ceil(rmsAnalisis.length / MAX_RMS_ANALISIS);
    rmsAnalisis = rmsAnalisis.filter((_, idx) => idx % step === 0);
  }
  const perfilRmsFormateado = `[${rmsAnalisis.map(v => v.toFixed(2)).join(', ')}]`;

  const totalTransientesAnalisis = analisisTecnico.transientes_ritmicos_ts_ms.length;
  const muestraTransientesAnalisis = analisisTecnico.transientes_ritmicos_ts_ms
    .slice(0, Math.min(60, totalTransientesAnalisis))
    .map(ms => Math.round(ms))
    .join(', ');
  const transientesFormateadosAnalisis = totalTransientesAnalisis
    ? `${totalTransientesAnalisis} hits · muestra [${muestraTransientesAnalisis}${totalTransientesAnalisis > 60 ? ', …' : ''}]`
    : '0 detectados';

  const prompt = `Analiza esta canción con PRECISIÓN ABSOLUTA usando palabras alineadas + Perfil RMS.

🎯 DATOS CONFIABLES AL 100%:
- Duración EXACTA: ${duracionMaxMs}ms (${duracionSegundos}s)
- Segmentos de voz VAD: ${segmentosFormateados}
- Palabras ya alineadas a estos segmentos (ver abajo)
- Perfil de Energía RMS (cada 250ms): ${perfilRmsFormateado}
- Transientes rítmicos detectados: ${transientesFormateadosAnalisis}
- BPM: ${analisisTecnico.bpm}
- Energía: ${(analisisTecnico.energia * 100).toFixed(0)}%
- Ánimo: ${analisisTecnico.animo_general}

📝 PALABRAS ALINEADAS CON TIMESTAMPS PRECISOS:
${letra || '[Instrumental - sin voces]'}

🎯 TU TAREA:
USA EXCLUSIVAMENTE los timestamps de las palabras Y el Perfil RMS para identificar:

1️⃣ ESTRUCTURA musical (intro/verso/estribillo/puente/outro/instrumental/build_up)
   - inicio_ms y fin_ms basados en palabras Y dinámica de energía
   - Usa el Perfil RMS: descenso brusco = 'break', aumento progresivo = 'build_up', pico sostenido = 'estribillo'
   - Los huecos entre segmentos VAD son secciones instrumentales
   
2️⃣ TEMA (resumen, palabras clave, emoción)
   - Analiza el contenido lírico de las palabras
   
3️⃣ EVENTOS DJ (drops, breaks, build-ups, hooks)
  - tiempo_ms debe coincidir con transientes fuertes y cambios de energía (RMS) o vocales
   - JUSTIFICA tus decisiones basadas en el RMS

⚠️ CRÍTICO: NO inventes timestamps. Usa solo los proporcionados: ${segmentosFormateados}`;

  const ai = getGeminiClient();
  const response = await ai.models.generateContent({
    model: 'models/gemini-flash-latest',
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }]
      }
    ],
    config: {
      temperature: 0,
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 65536,
      responseMimeType: 'application/json',
      responseJsonSchema: analysisSchema,
    }
  });

  const analisis = JSON.parse(response.text || '{}');

  // Validar y limpiar timestamps inválidos en estructura
  if (analisis.estructura && Array.isArray(analisis.estructura)) {
    const seccionesOriginales = analisis.estructura.length;
    analisis.estructura = analisis.estructura.filter((s: any) => {
      return typeof s.inicio_ms === 'number' && typeof s.fin_ms === 'number' &&
        s.inicio_ms >= 0 && s.fin_ms <= duracionMaxMs &&
        s.inicio_ms < s.fin_ms;
    });
    const seccionesDescartadas = seccionesOriginales - analisis.estructura.length;
    if (seccionesDescartadas > 0) {
      console.warn(`⚠️ ${seccionesDescartadas} secciones descartadas por timestamps inválidos (>${duracionMaxMs}ms)`);
    }
  }

  // Validar eventos DJ
  if (analisis.eventos_dj && Array.isArray(analisis.eventos_dj)) {
    const eventosOriginales = analisis.eventos_dj.length;
    analisis.eventos_dj = analisis.eventos_dj.filter((e: any) => {
      return typeof e.tiempo_ms === 'number' && e.tiempo_ms >= 0 && e.tiempo_ms <= duracionMaxMs;
    });
    const eventosDescartados = eventosOriginales - analisis.eventos_dj.length;
    if (eventosDescartados > 0) {
      console.warn(`⚠️ ${eventosDescartados} eventos DJ descartados por timestamps inválidos (>${duracionMaxMs}ms)`);
    }
  }

  console.log(`✅ PASO 2 completado: ${analisis.estructura?.length || 0} secciones, ${analisis.eventos_dj?.length || 0} eventos DJ`);

  return analisis;
}

/**
 * ANÁLISIS COMPLETO EN UNA SOLA PETICIÓN
 * Transcripción + Análisis en un solo llamado a Gemini
 */
export interface AnalisisCompletoSchema {
  transcripcion: {
    palabras: Array<{
      palabra: string;
      inicio_ms: number;
      fin_ms: number;
    }>;
    analisis_huecos?: AnalisisHuecoInstrumental[];
  };
  estructura: Array<{
    seccion: 'intro' | 'verso' | 'estribillo' | 'puente' | 'instrumental' | 'outro' | 'build_up';
    inicio_ms: number;
    fin_ms: number;
  }>;
  tema: {
    resumen: string;
    palabras_clave: string[];
    emocion: 'alegre' | 'triste' | 'energético' | 'romántico' | 'melancólico' | 'festivo' | 'reflexivo';
  };
  eventos_dj: Array<{
    tipo: 'drop' | 'break' | 'build_up' | 'cambio_ritmo' | 'hook';
    tiempo_ms: number;
    descripcion?: string;
  }>;
  diagnostico_tecnico?: {
    resumen_segmentos_voz?: string;
    segmentos_fuera_vad?: number;
    perfil_energia_resumen?: string;
    energia_promedio?: number;
    energia_picos_ms?: number[];
    energia_valles_ms?: number[];
    huecos_resumen?: string;
  };
}


export async function analizarConGeminiOptimizado(params: {
  fileUri?: string;
  fileMimeType: string;
  fileBuffer?: ArrayBuffer;
  segmentosVoz: Array<{ start_ms: number; end_ms: number }>;
  perfilEnergiaRMS?: number[];
  nombreCancion?: string;
  analisisTecnico: {
    bpm: number;
    compas: { numerador: number; denominador: number };
    energia: number;
    bailabilidad: number;
    animo_general: string;
    tonalidad_camelot: string;
    tonalidad_compatible: string[];
    duracion_ms: number;
    downbeats_ts_ms: number[];
    beats_ts_ms: number[];
    frases_ts_ms: number[];
    ritmoAvanzado?: {
      beats_loudness?: number[];
    };
  };
  // Datos adicionales para CancionAnalizada
  hash_archivo: string;
  titulo: string;
  apiKeyOverride?: string;
  jobId?: string;
}): Promise<CancionAnalizada> {
  let ai = getGeminiClient(params.apiKeyOverride);
  const inicio = Date.now();
  console.log('\n🚀 ANÁLISIS COMPLETO CON GEMINI + VAD (OPTIMIZADO)');
  if (params.jobId) {
    await actualizarProgresoJob(params.jobId, 82, 'Generando prompt para Gemini...');
  }

  console.log('═'.repeat(80));
  if (params.nombreCancion) {
    console.log(`📀 Canción: ${params.nombreCancion}`);
  }
  console.log(`⏱️  Duración: ${params.analisisTecnico.duracion_ms}ms (${Math.floor(params.analisisTecnico.duracion_ms / 1000)}s)`);

  // Schema SIMPLIFICADO para velocidad
  // Schema OPTIMIZADO - sin campos innecesarios (confianza siempre 1, descripcion no usada)
  const completeSchema = {
    type: 'object',
    properties: {
      transcripcion: {
        type: 'object',
        properties: {
          palabras: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                palabra: { type: 'string' },
                inicio_ms: { type: 'number' },
                fin_ms: { type: 'number' }
              },
              required: ['palabra', 'inicio_ms', 'fin_ms']
            }
          },
          analisis_huecos: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                inicio_ms: { type: 'number' },
                fin_ms: { type: 'number' },
                tipo: {
                  type: 'string',
                  enum: ['instrumental_puro', 'coros_melodicos', 'adlibs_fx', 'voz_principal_residuo']
                }
              },
              required: ['inicio_ms', 'fin_ms', 'tipo']
            }
          }
        },
        required: ['palabras', 'analisis_huecos']
      },
      estructura: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            seccion: {
              type: 'string',
              enum: ['intro', 'verso', 'estribillo', 'puente', 'instrumental', 'outro', 'build_up']
            },
            inicio_ms: { type: 'number' },
            fin_ms: { type: 'number' }
          },
          required: ['seccion', 'inicio_ms', 'fin_ms']
        }
      },
      tema: {
        type: 'object',
        properties: {
          palabras_clave: { type: 'array', items: { type: 'string' } },
          emocion: {
            type: 'string',
            enum: ['alegre', 'triste', 'energético', 'romántico', 'melancólico', 'festivo', 'reflexivo', 'neutral']
          }
        },
        required: ['palabras_clave', 'emocion']
      },
      eventos_dj: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            tipo: {
              type: 'string',
              enum: ['drop', 'break', 'build_up', 'cambio_ritmo', 'hook']
            },
            tiempo_ms: { type: 'number' }
          },
          required: ['tipo', 'tiempo_ms']
        }
      }
    },
    required: ['transcripcion', 'estructura', 'tema', 'eventos_dj']
  };

  const duracionMaxMs = params.analisisTecnico.duracion_ms;
  const duracionContexto = formatTimeContext(duracionMaxMs);

  // Preparar contexto VAD simplificado
  const segmentosContexto = params.segmentosVoz
    .map(s => `[${Math.round(s.start_ms)}-${Math.round(s.end_ms)}ms]`)
    .join(', ');

  // Calcular huecos instrumentales
  const huecosInstrumentales: Array<{ inicio_ms: number; fin_ms: number }> = [];
  if (params.segmentosVoz.length > 0 && params.segmentosVoz[0].start_ms > 0) {
    huecosInstrumentales.push({ inicio_ms: 0, fin_ms: params.segmentosVoz[0].start_ms });
  }
  for (let i = 0; i < params.segmentosVoz.length - 1; i++) {
    const finActual = params.segmentosVoz[i].end_ms;
    const inicioSiguiente = params.segmentosVoz[i + 1].start_ms;
    if (inicioSiguiente > finActual) {
      huecosInstrumentales.push({ inicio_ms: finActual, fin_ms: inicioSiguiente });
    }
  }
  if (params.segmentosVoz.length > 0 && params.segmentosVoz[params.segmentosVoz.length - 1].end_ms < duracionMaxMs) {
    huecosInstrumentales.push({
      inicio_ms: params.segmentosVoz[params.segmentosVoz.length - 1].end_ms,
      fin_ms: duracionMaxMs
    });
  }
  const huecosContexto = huecosInstrumentales
    .map(h => `[${Math.round(h.inicio_ms)}-${Math.round(h.fin_ms)}ms]`)
    .join(', ');

  // RMS simplificado (menos puntos)
  const MAX_RMS_POINTS = 200; // Reducido drásticamente para ahorrar tokens
  let rmsParaPrompt = params.perfilEnergiaRMS || [];
  if (rmsParaPrompt.length > MAX_RMS_POINTS) {
    const step = Math.ceil(rmsParaPrompt.length / MAX_RMS_POINTS);
    rmsParaPrompt = rmsParaPrompt.filter((_, idx) => idx % step === 0);
  }
  const perfilRmsFormateado = `[${rmsParaPrompt.map(v => v.toFixed(2)).join(',')}]`;

  const prompt = `ANÁLISIS DJ EXPRESS - Transcripción y Estructura Musical

DATOS TÉCNICOS:
- Duración: ${duracionContexto}
- Segmentos con voz (VAD): ${segmentosContexto}
- Huecos instrumentales: ${huecosContexto}
- Energía RMS: ${perfilRmsFormateado}
- BPM: ${params.analisisTecnico.bpm} | Energía: ${(params.analisisTecnico.energia * 100).toFixed(0)}%

INSTRUCCIONES DE SEGURIDAD CRÍTICAS:
1. ⛔ PROHIBIDO ALUCINAR LETRA: Si el audio es instrumental en una sección, NO inventes letra aunque conozcas la canción.
2. ⛔ RESPETAR VAD: Solo genera palabras cuyos timestamps caigan DENTRO de los "Segmentos con voz" proporcionados arriba.
3. Si una sección es instrumental, devuelve array vacío [] en palabras.

TAREAS (devolver JSON):

1. TRANSCRIPCIÓN (transcripcion.palabras):
   - Transcribe letra palabra por palabra
   - Timestamps exactos: inicio_ms, fin_ms
   - CRÍTICO: Solo en segmentos VAD detectados
   - Array vacío si es instrumental

2. HUECOS (transcripcion.analisis_huecos):
   - Clasifica cada hueco: instrumental_puro | coros_melodicos | adlibs_fx | voz_principal_residuo
   - Solo tipo, inicio_ms, fin_ms (sin descripción)

3. ESTRUCTURA (estructura):
   - Divide en secciones: intro, verso, estribillo, puente, instrumental, outro, build_up
   - Usa cambios de energía y contenido lírico

4. TEMA (tema):
   - palabras_clave: array de palabras importantes
   - emocion: alegre | triste | energético | romántico | melancólico | festivo | reflexivo | neutral

5. EVENTOS DJ (eventos_dj):
   - Identifica: drop, break, build_up, cambio_ritmo, hook
   - Solo tipo y tiempo_ms

IMPORTANTE: Sé rápido y preciso. Timestamps en milisegundos.`;

  console.log('\n📝 PROMPT SIMPLIFICADO ENVIADO A GEMINI');
  if (params.jobId) {
    await actualizarProgresoJob(params.jobId, 85, 'Esperando respuesta de Gemini...');
  }


  // Usar modelo más rápido primero, fallback a flash si falla
  const modelos = [
    { id: 'models/gemini-flash-latest', label: 'Gemini Flash Lite (rápido)' },
    { id: 'models/gemini-flash-latest', label: 'Gemini Flash (fallback)' },
  ];

  const maxIntentosPorModelo = 3; // Aumentado a 3 intentos
  let response: any;
  const errores: any[] = [];
  const allKeys = getGeminiApiKeys();
  let currentKeyAttempt = 0;

  for (const modelo of modelos) {
    let intentos = 0;
    while (intentos < maxIntentosPorModelo) {
      try {
        console.log(`   Intento ${intentos + 1}/${maxIntentosPorModelo} con ${modelo.label}...`);
        const parts: any[] = [];
        if (params.fileUri) {
          parts.push({ fileData: { fileUri: params.fileUri, mimeType: params.fileMimeType } });
        } else if (params.fileBuffer) {
          const buffer = Buffer.from(params.fileBuffer instanceof ArrayBuffer ? new Uint8Array(params.fileBuffer) : params.fileBuffer);
          parts.push({ inlineData: { data: buffer.toString('base64'), mimeType: params.fileMimeType } });
        }
        parts.push({ text: prompt });

        response = await ai.models.generateContent({
          model: modelo.id,
          contents: [{ role: 'user', parts }],
          config: {
            temperature: 1.0, // Según docs de Gemini para mejor creatividad
            topP: 0.95,
            topK: 40,
            maxOutputTokens: 65536,
            responseMimeType: 'application/json',
            responseJsonSchema: completeSchema,
          }
        });
        markKeySuccess(ai);
        console.log(`✅ Respuesta exitosa con ${modelo.label}`);
        break;
      } catch (error: any) {
        intentos++;
        const errorMsg = error?.message || String(error);
        const errorCode = error?.status || error?.code || error?.error?.code;
        errores.push({ error: errorMsg, code: errorCode, modelo: modelo.label });

        console.warn(`⚠️ Error en intento ${intentos}: ${errorMsg} (código: ${errorCode})`);

        // Si es error 429 (rate limit), cambiar inmediatamente a otra key
        if (errorCode === 429 || errorMsg.includes('quota') || errorMsg.includes('RESOURCE_EXHAUSTED')) {
          console.warn(`🔄 Error 429 detectado - cambiando a otra API key...`);
          markKeyFailure(ai);

          // Intentar con otra key si hay disponibles
          if (currentKeyAttempt < allKeys.length - 1) {
            currentKeyAttempt++;
            ai = getGeminiClient(); // Obtener nueva key
            console.log(`🔑 Cambiado a nueva API key para reintentar`);
            await new Promise(resolve => setTimeout(resolve, 500)); // Pequeña pausa
            continue; // Reintentar con nueva key
          } else {
            console.error(`❌ Todas las API keys agotadas`);
            break;
          }
        }

        if (isRetryableGeminiError(error)) {
          await new Promise(resolve => setTimeout(resolve, 1000 * intentos));
        } else {
          console.error(`❌ Error no recuperable: ${errorMsg}`);
          break;
        }
      }
    }
    if (response) break;
  }

  if (!response) {
    const errorDetails = errores.map(e => `${e.modelo}: ${e.error} (${e.code})`).join(' | ');
    throw new Error(`Fallo en Gemini tras ${errores.length} intentos. Errores: ${errorDetails}`);
  }

  // Parsear y validar JSON
  if (params.jobId) {
    await actualizarProgresoJob(params.jobId, 95, 'Procesando respuesta de Gemini...');
  }

  let resultado: any;
  try {
    resultado = JSON.parse(response.text || '{}');
  } catch (e) {
    throw new Error('Respuesta JSON inválida de Gemini');
  }

  // ==================================================================================
  // 🛡️ FILTRO DE ALUCINACIONES - "Cúpula de Hierro"
  // ==================================================================================
  // Elimina palabras que Gemini haya inventado en zonas instrumentales
  // Confianza: Análisis de señal matemático > LLM
  
  const TOLERANCIA_MS = 300; // Margen para palabras en el borde de segmentos
  let palabrasOriginales = 0;
  let palabrasEliminadas = 0;

  if (Array.isArray(resultado.transcripcion?.palabras)) {
    palabrasOriginales = resultado.transcripcion.palabras.length;
    
    resultado.transcripcion.palabras = resultado.transcripcion.palabras.filter((p: any) => {
      const inicio = Number(p.inicio_ms);
      const fin = Number(p.fin_ms);
      
      // Validar números
      if (isNaN(inicio) || isNaN(fin)) return false;

      // VERIFICACIÓN CONTRA VAD:
      // ¿Esta palabra cae dentro de algún segmento donde detectamos energía vocal?
      const caeEnZonaVocal = params.segmentosVoz.some(seg => {
        const segInicio = seg.start_ms - TOLERANCIA_MS;
        const segFin = seg.end_ms + TOLERANCIA_MS;

        // Lógica de superposición:
        // La palabra empieza dentro O termina dentro O engloba al segmento
        return (inicio >= segInicio && inicio <= segFin) || 
               (fin >= segInicio && fin <= segFin) ||
               (inicio <= segInicio && fin >= segFin);
      });

      if (!caeEnZonaVocal) {
        palabrasEliminadas++;
        console.warn(`👻 Alucinación detectada: "${p.palabra}" en [${inicio}-${fin}ms] (Zona Instrumental)`);
      }

      return caeEnZonaVocal;
    });
    
    if (palabrasEliminadas > 0) {
      console.log(`🛡️  Filtro de alucinaciones: ${palabrasEliminadas}/${palabrasOriginales} palabras eliminadas`);
    }
  }

  // Recalcular huecos basándose en palabras filtradas
  const palabrasFiltradas = resultado.transcripcion?.palabras || [];
  const huecosRecalculados: any[] = [];
  
  if (palabrasFiltradas.length > 0) {
    // Ordenar palabras por tiempo
    palabrasFiltradas.sort((a: any, b: any) => a.inicio_ms - b.inicio_ms);

    // Hueco inicial (si la primera palabra empieza tarde)
    if (palabrasFiltradas[0].inicio_ms > 4000) {
      huecosRecalculados.push({
        inicio_ms: 0,
        fin_ms: palabrasFiltradas[0].inicio_ms,
        tipo: 'instrumental_puro'
      });
    }

    // Huecos intermedios
    for (let i = 0; i < palabrasFiltradas.length - 1; i++) {
      const finActual = palabrasFiltradas[i].fin_ms;
      const inicioSiguiente = palabrasFiltradas[i + 1].inicio_ms;
      const duracionHueco = inicioSiguiente - finActual;

      if (duracionHueco > 3000) { // Solo huecos mayores a 3 segundos
        huecosRecalculados.push({
          inicio_ms: finActual,
          fin_ms: inicioSiguiente,
          tipo: 'instrumental_puro'
        });
      }
    }
    
    // Hueco final
    const ultimaPalabra = palabrasFiltradas[palabrasFiltradas.length - 1];
    if (duracionMaxMs - ultimaPalabra.fin_ms > 4000) {
      huecosRecalculados.push({
        inicio_ms: ultimaPalabra.fin_ms,
        fin_ms: duracionMaxMs,
        tipo: 'instrumental_puro'
      });
    }
  } else {
    // Si no hay palabras (totalmente instrumental), todo es un hueco
    huecosRecalculados.push({
      inicio_ms: 0,
      fin_ms: duracionMaxMs,
      tipo: 'instrumental_puro'
    });
  }

  // Mezclar tipos que Gemini detectó con tiempos reales
  const huecosFinales = huecosRecalculados.map(huecoReal => {
    // Buscar si Gemini clasificó este rango temporal
    const opinionGemini = resultado.transcripcion?.analisis_huecos?.find((h: any) => {
      const solapamiento = Math.max(huecoReal.inicio_ms, h.inicio_ms) < 
                          Math.min(huecoReal.fin_ms, h.fin_ms);
      return solapamiento;
    });
    
    return {
      ...huecoReal,
      tipo: opinionGemini?.tipo || 'instrumental_puro',
      descripcion: opinionGemini?.descripcion
    };
  });

  // Reemplazar los huecos de Gemini con los recalculados
  if (resultado.transcripcion) {
    resultado.transcripcion.analisis_huecos = huecosFinales;
  }

  // ==================================================================================
  // FIN DEL FILTRO DE ALUCINACIONES
  // ==================================================================================

  // 🔒 VALIDACIÓN EXHAUSTIVA: Verificar TODOS los campos obligatorios
  const validaciones = {
    transcripcion: !!resultado.transcripcion,
    palabras: Array.isArray(resultado.transcripcion?.palabras),
    analisis_huecos: Array.isArray(resultado.transcripcion?.analisis_huecos),
    estructura: Array.isArray(resultado.estructura) && resultado.estructura.length > 0,
    tema: !!resultado.tema,
    palabras_clave: Array.isArray(resultado.tema?.palabras_clave),
    emocion: !!resultado.tema?.emocion,
    eventos_dj: Array.isArray(resultado.eventos_dj)
  };

  // Lista de campos críticos OBLIGATORIOS (deben existir siempre)
  const camposFaltantes: string[] = [];
  if (!validaciones.transcripcion) camposFaltantes.push('transcripcion');
  if (!validaciones.palabras) camposFaltantes.push('transcripcion.palabras (array)');
  if (!validaciones.analisis_huecos) camposFaltantes.push('transcripcion.analisis_huecos (array)');
  if (!validaciones.estructura) camposFaltantes.push('estructura (array con elementos)');
  if (!validaciones.tema) camposFaltantes.push('tema');
  if (!validaciones.palabras_clave) camposFaltantes.push('tema.palabras_clave (array)');
  if (!validaciones.emocion) camposFaltantes.push('tema.emocion');
  if (!validaciones.eventos_dj) camposFaltantes.push('eventos_dj (array)');

  // ❌ Si falta CUALQUIER campo obligatorio, rechazar respuesta y reintentar
  if (camposFaltantes.length > 0) {
    console.error('❌ Gemini devolvió respuesta INCOMPLETA - campos faltantes:');
    console.error(`   📋 Faltantes: ${camposFaltantes.join(', ')}`);
    console.error('   📄 Respuesta recibida:', JSON.stringify(resultado, null, 2));
    throw new Error(`Gemini devolvió respuesta incompleta. Faltan: ${camposFaltantes.join(', ')}. Reintentando...`);
  }

  // ✅ Log de validación exitosa
  console.log(`📊 Validación COMPLETA:`);
  console.log(`   ✅ Palabras: ${resultado.transcripcion.palabras.length}`);
  console.log(`   ✅ Huecos: ${resultado.transcripcion.analisis_huecos.length}`);
  console.log(`   ✅ Estructura: ${resultado.estructura.length} secciones`);
  console.log(`   ✅ Tema: ${resultado.tema.palabras_clave.length} palabras clave, emoción: ${resultado.tema.emocion}`);
  console.log(`   ✅ Eventos DJ: ${resultado.eventos_dj.length}`);

  // Sanitización básica
  const palabrasSanitizadas = Array.isArray(resultado.transcripcion?.palabras)
    ? resultado.transcripcion.palabras.map((p: any) => ({
      palabra: String(p.palabra),
      inicio_ms: Number(p.inicio_ms),
      fin_ms: Number(p.fin_ms)
    }))
    : [];

  const huecosSanitizados = Array.isArray(resultado.transcripcion?.analisis_huecos)
    ? resultado.transcripcion.analisis_huecos.map((h: any) => ({
      inicio_ms: Number(h.inicio_ms),
      fin_ms: Number(h.fin_ms),
      tipo: h.tipo,
      descripcion: h.descripcion
    }))
    : [];

  const estructuraSanitizada = Array.isArray(resultado.estructura)
    ? resultado.estructura.map((s: any) => ({
      seccion: s.seccion,
      inicio_ms: Number(s.inicio_ms),
      fin_ms: Number(s.fin_ms)
    }))
    : [];

  const eventosSanitizados = Array.isArray(resultado.eventos_dj)
    ? resultado.eventos_dj.map((e: any) => ({
      tipo: e.tipo,
      tiempo_ms: Number(e.tiempo_ms),
      descripcion: e.descripcion
    }))
    : [];

  const temaSanitizado = {
    resumen: '', // Ya no se solicita a Gemini para ahorrar tokens
    palabras_clave: resultado.tema?.palabras_clave || [],
    emocion: resultado.tema?.emocion || 'neutral'
  };

  console.log(`✅ Gemini completado en ${(Date.now() - inicio) / 1000}s`);
  console.log(`   - Palabras: ${palabrasSanitizadas.length}`);
  console.log(`   - Secciones: ${estructuraSanitizada.length}`);

  // Mapeo a tipos internos
  const letrasTs: TranscripcionPalabra[] = palabrasSanitizadas.map((p: any) => ({
    palabra: p.palabra,
    inicio_ms: p.inicio_ms,
    fin_ms: p.fin_ms,
  }));

  const estructuraTs: EstructuraMusical[] = estructuraSanitizada.map((item: any) => ({
    tipo_seccion: mapSeccionToTipo(item.seccion),
    inicio_ms: item.inicio_ms,
    fin_ms: item.fin_ms,
  }));

  const eventosClaveDj: EventoClaveDJ[] = eventosSanitizados
    .map((evento: any) => {
      const mapped = mapEventoDJ(evento.tipo);
      if (!mapped) return null;
      return {
        evento: mapped,
        inicio_ms: evento.tiempo_ms,
        fin_ms: Math.min(evento.tiempo_ms + 8000, duracionMaxMs),
      } satisfies EventoClaveDJ;
    })
    .filter((item: any): item is EventoClaveDJ => Boolean(item));

  const analisisContenido: AnalisisContenido = {
    analisis_lirico_tematico: {
      tema_principal: temaSanitizado.resumen,
      palabras_clave_semanticas: temaSanitizado.palabras_clave,
      evolucion_emocional: temaSanitizado.emocion,
    },
    eventos_clave_dj: eventosClaveDj,
    diagnostico_tecnico: {
      resumen_segmentos_voz: 'Análisis optimizado',
      segmentos_fuera_vad: 0,
      perfil_energia_resumen: 'Optimizado',
      energia_promedio: params.analisisTecnico.energia,
      energia_picos_ms: [],
      energia_valles_ms: [],
      huecos_resumen: 'Optimizado'
    },
  };

  return {
    hash_archivo: params.hash_archivo,
    titulo: params.titulo,
    bpm: params.analisisTecnico.bpm,
    tonalidad_camelot: params.analisisTecnico.tonalidad_camelot,
    tonalidad_compatible: params.analisisTecnico.tonalidad_compatible,
    energia: params.analisisTecnico.energia,
    bailabilidad: params.analisisTecnico.bailabilidad,
    animo_general: params.analisisTecnico.animo_general,
    compas: params.analisisTecnico.compas,
    duracion_ms: params.analisisTecnico.duracion_ms,
    beats_ts_ms: params.analisisTecnico.beats_ts_ms,
    downbeats_ts_ms: params.analisisTecnico.downbeats_ts_ms,
    frases_ts_ms: params.analisisTecnico.frases_ts_ms,
    palabras: palabrasSanitizadas,
    huecos_analizados: huecosSanitizados,
    estructura: estructuraSanitizada,
    tema: temaSanitizado,
    eventos_dj: eventosSanitizados,
    segmentos_voz: params.segmentosVoz,
    perfil_energia_rms: params.perfilEnergiaRMS || [],
    letras_ts: letrasTs,
    estructura_ts: estructuraTs,
    analisis_contenido: analisisContenido,
    fecha_procesado: new Date(),
  };
}
