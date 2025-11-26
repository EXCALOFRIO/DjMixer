/**
 * DJ-CENTRIC GEMINI OPTIMIZER
 * Optimized for speed and DJ-specific analysis
 * NO word-by-word transcription - focuses on structure, vocal blocks, and loops
 */

import { GoogleGenAI } from '@google/genai';
import { actualizarProgresoJob } from './analysis-jobs';
import { getGeminiApiKeys } from './gemini-keys';
import type {
  EstructuraMusical,
  BloqueVocal,
  LoopTransicion,
  CancionAnalizada,
  HuecoInstrumental,
} from './db';

import * as fs from 'fs/promises';
import * as path from 'path';

// ... imports ...

// ============================================================================
// CONFIGURATION
// ============================================================================
const ENABLE_DEBUG_LOGGING = false; // Deshabilitado para producción
const DEBUG_LOG_DIR = path.join(process.cwd(), '.gemini', 'debug');

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/** Guarda el prompt y la respuesta en un archivo de texto para depuración */
async function saveDebugLog(songTitle: string, prompt: string, response: any) {
  if (!ENABLE_DEBUG_LOGGING) return;

  try {
    await fs.mkdir(DEBUG_LOG_DIR, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const sanitizedTitle = songTitle.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
    const filename = `${timestamp}_${sanitizedTitle}.txt`;
    const filePath = path.join(DEBUG_LOG_DIR, filename);

    const content = `=== PROMPT ===\n${prompt}\n\n=== RESPONSE ===\n${JSON.stringify(response, null, 2)}\n`;

    await fs.writeFile(filePath, content, 'utf-8');
    console.log(`📝 Debug log guardado: ${filename}`);
  } catch (error) {
    console.error('⚠️ Error guardando debug log:', error);
  }
}

/** Convierte ms a MM:SS.d para el prompt (Gemini entiende mejor este formato con decimales) */
function formatTimeForPrompt(ms: number): string {
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  // Formato MM:SS.d (ej: 01:30.5)
  return `${minutes}:${seconds.toFixed(1).padStart(4, '0')}`;
}

/** Convierte ms a segundos con 2 decimales (1500ms -> 1.5s) */
function msToSec(ms: number): number {
  return Math.round(ms / 10) / 100;
}

/** Convierte segundos a ms enter os (1.5s -> 1500ms) */
function secToMs(sec: number): number {
  return Math.round(sec * 1000);
}

/** Convierte MM:SS a ms */
export function parseTimeStringToMs(timeStr: string): number {
  if (!timeStr || typeof timeStr !== 'string') return 0;

  try {
    const parts = timeStr.split(':');
    if (parts.length === 2) {
      const minutes = parseInt(parts[0], 10);
      const seconds = parseFloat(parts[1]); // Permitir decimales en segundos si Gemini los manda
      return (minutes * 60 * 1000) + Math.round(seconds * 1000);
    }
    // Fallback si manda solo segundos como string
    const seconds = parseFloat(timeStr);
    if (!isNaN(seconds)) return Math.round(seconds * 1000);
  } catch (e) {
    console.warn(`⚠️ Error parseando tiempo: ${timeStr}`, e);
  }
  return 0;
}

/**
 * CLASIFICADOR DE DENSIDAD VOCAL (Exported for mix-planner and mix-transitions)
 * Distingue entre un Verso real (canto fluido) y efectos vocales/chanteos (gritos, "pla pla pla").
 */
export function clasificarTipoVocal(inicioMs: number, finMs: number, vad: Array<{ start_ms: number; end_ms: number }>): 'verso_denso' | 'chanteo_esporadico' | 'silencio' {
  const duracionTotal = finMs - inicioMs;
  if (duracionTotal <= 0) return 'silencio';

  const segmentosEnBloque = vad.filter(v =>
    (v.end_ms > inicioMs) && (v.start_ms < finMs)
  );

  if (segmentosEnBloque.length === 0) return 'silencio';

  let tiempoVozReal = 0;
  segmentosEnBloque.forEach(v => {
    const s = Math.max(inicioMs, v.start_ms);
    const e = Math.min(finMs, v.end_ms);
    if (e > s) tiempoVozReal += (e - s);
  });

  const porcentajeCobertura = tiempoVozReal / duracionTotal;

  let maxGap = 0;
  const segsOrdenados = [...segmentosEnBloque].sort((a, b) => a.start_ms - b.start_ms);

  for (let i = 0; i < segsOrdenados.length - 1; i++) {
    const finActual = Math.min(finMs, segsOrdenados[i].end_ms);
    const inicioSiguiente = Math.max(inicioMs, segsOrdenados[i + 1].start_ms);
    const gap = inicioSiguiente - finActual;
    if (gap > maxGap) maxGap = gap;
  }

  if (porcentajeCobertura < 0.30 && maxGap > 1200) {
    return 'chanteo_esporadico';
  }

  return 'verso_denso';
}

/**
 * ALINEACIÓN MAGNÉTICA POR CLÚSTER (VAD CLUSTERING)
 * Toma el tiempo aproximado de Gemini y busca un GRUPO de segmentos VAD que encajen.
 * Devuelve el inicio del PRIMER segmento del grupo y el fin del ÚLTIMO.
 * 
 * Esto resuelve el problema de VAD "ametralladora" (muchos cortes pequeños) vs
 * Gemini que entiende la frase completa.
 */
function snapToVADCluster(
  inicioGeminiMs: number,
  finGeminiMs: number,
  vad: Array<{ start_ms: number; end_ms: number }>
): { start: number; end: number; match: boolean; gaps_filled: number } {
  // 1. Configuración de Tolerancia
  // Cuánto permitimos que Gemini se desvíe por fuera de los bordes reales
  const MARGEN_TOLERANCIA = 1500; // 1.5s

  // 2. Filtrar segmentos VAD que "tocan" la predicción de Gemini
  // Un segmento es relevante si:
  // - Empieza dentro del rango de Gemini (+- margen)
  // - O termina dentro del rango de Gemini (+- margen)
  // - O está completamente dentro
  // - O cubre completamente el rango de Gemini
  const segmentosRelevantes = vad.filter(v => {
    const startOverlap = v.start_ms >= (inicioGeminiMs - MARGEN_TOLERANCIA) && v.start_ms <= (finGeminiMs + MARGEN_TOLERANCIA);
    const endOverlap = v.end_ms >= (inicioGeminiMs - MARGEN_TOLERANCIA) && v.end_ms <= (finGeminiMs + MARGEN_TOLERANCIA);
    const contained = v.start_ms >= (inicioGeminiMs - MARGEN_TOLERANCIA) && v.end_ms <= (finGeminiMs + MARGEN_TOLERANCIA);
    const covers = v.start_ms <= (inicioGeminiMs + MARGEN_TOLERANCIA) && v.end_ms >= (finGeminiMs - MARGEN_TOLERANCIA);

    return startOverlap || endOverlap || contained || covers;
  });

  // 3. Si no hay coincidencia, devolvemos lo que dijo Gemini (fallback) o false si somos estrictos
  if (segmentosRelevantes.length === 0) {
    return { start: inicioGeminiMs, end: finGeminiMs, match: false, gaps_filled: 0 };
  }

  // 4. Calcular los extremos REALES basados en el VAD
  // Ordenamos por si acaso
  segmentosRelevantes.sort((a, b) => a.start_ms - b.start_ms);

  const startReal = segmentosRelevantes[0].start_ms;
  const endReal = segmentosRelevantes[segmentosRelevantes.length - 1].end_ms;

  // 5. Validación de cordura (Sanity Check)
  // Si Gemini dijo 5 segundos, pero el cluster VAD resultante es de 30 segundos, algo falló.
  // const duracionGemini = finGeminiMs - inicioGeminiMs;
  // const duracionReal = endReal - startReal;

  // Si el VAD detectado es monstruosamente más grande (> 300% y > 5s de diferencia),
  // probablemente Gemini alucinó un verso corto en medio de un verso largo.
  // En ese caso, confiamos más en Gemini para recortar, o en el VAD para expandir.
  // Para DJing, es mejor pecar de "dejar sonar un poco más" que cortar voz.

  return {
    start: startReal,
    end: endReal,
    match: true,
    gaps_filled: segmentosRelevantes.length - 1 // Cuántos huecos de silencio unimos
  };
}

/** Verifica si un error de Gemini es reintentable */
function isRetryableError(error: any): boolean {
  const code = error?.status || error?.code || error?.error?.code;
  return [429, 500, 503, 504].includes(Number(code));
}

// ============================================================================
// GEMINI CLIENT MANAGEMENT
// ============================================================================

const geminiClientCache = new Map<string, GoogleGenAI>();

function getGeminiClient(apiKeyOverride?: string): GoogleGenAI {
  const keys = getGeminiApiKeys();
  const key = apiKeyOverride || keys[Math.floor(Math.random() * keys.length)];

  if (!key) throw new Error('No Gemini API keys found');

  if (!geminiClientCache.has(key)) {
    geminiClientCache.set(key, new GoogleGenAI({ apiKey: key }));
  }

  return geminiClientCache.get(key)!;
}

// ============================================================================
// TYPES
// ============================================================================

export interface AnalisisGeminiParams {
  fileUri?: string;
  fileMimeType: string;
  fileBuffer?: ArrayBuffer;
  segmentosVoz?: Array<{ start_ms: number; end_ms: number }>; // OPCIONAL - Ya no se usa en Gemini
  nombreCancion?: string;
  analisisTecnico: {
    duracion_ms: number;
    bpm: number;
    tonalidad_camelot: string;
    tonalidad_compatible: string[];
    bailabilidad: number;
    compas: { numerador: number; denominador: number };
    beats_ts_ms: number[];
    downbeats_ts_ms: number[];
    frases_ts_ms: number[];
  };
  hash_archivo: string;
  titulo: string;
  apiKeyOverride?: string;
  jobId?: string;
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

export async function analizarConGeminiDJ(params: AnalisisGeminiParams): Promise<CancionAnalizada> {
  let ai = getGeminiClient(params.apiKeyOverride);
  const inicio = Date.now();

  console.log('\n🎧 ANÁLISIS DJ-CENTRIC CON GEMINI (OPTIMIZADO REMIXES)');
  console.log('═'.repeat(80));

  if (params.nombreCancion) {
    console.log(`📀 Canción: ${params.nombreCancion}`);
  }

  if (params.jobId) {
    await actualizarProgresoJob(params.jobId, 82, 'Iniciando análisis DJ-céntrico...');
  }

  const duracionMaxMs = params.analisisTecnico.duracion_ms;
  const duracionFormatted = formatTimeForPrompt(duracionMaxMs);
  const durationSec = msToSec(duracionMaxMs);

  console.log(`⏱️  Duración: ${duracionFormatted} (${durationSec}s)`);
  console.log(`🎵 Análisis 100% Gemini (sin VAD - análisis puro de audio)`);

  // ============================================================================
  // UNIFIED TIMELINE SCHEMA (OPTIMIZADO)
  // ============================================================================
  const djUnifiedSchema = {
    type: 'object',
    properties: {
      // UNA SOLA LÍNEA DE TIEMPO
      timeline: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            s: { type: 'string', description: "Start MM:SS.d" },
            e: { type: 'string', description: "End MM:SS.d" },
            type: { type: 'string', enum: ['intro', 'verse', 'chorus', 'bridge', 'outro', 'instrumental', 'breakdown'] },
            has_vocals: { type: 'boolean', description: "True if ANY vocals are present" },
            desc: { type: 'string', description: "Lyrics snippet or instrument description" }
          },
          required: ['s', 'e', 'type', 'has_vocals']
        }
      },
      // LOOPS: Los 10 mejores momentos para hacer loops de DJ
      loops: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            s: { type: 'string' },
            e: { type: 'string' },
            text: { type: 'string' }
          },
          required: ['s', 'e', 'text']
        },
        maxItems: 10
      }
    },
    required: ['timeline', 'loops']
  };

  // ============================================================================
  // PROMPT UNIFICADO - TODO EN UNO (OPTIMIZADO)
  // ============================================================================
  const prompt = `ANALISTA MUSICAL EXPERTO.
Canción: ${durationSec}s de duración. BPM: ${params.analisisTecnico.bpm}.

OBJETIVO: Crear una LÍNEA DE TIEMPO ÚNICA y contigua desde 00:00 hasta el final exacto.

INSTRUCCIONES CRÍTICAS:
1. COBERTURA TOTAL: No dejes huecos. El fin de un segmento es el inicio del siguiente.
2. OUTRO REAL: ¡Cuidado! Muchas canciones tienen voces hasta el último segundo. NO marques "instrumental/outro" largo al final a menos que estés 100% seguro de que la voz desaparece totalmente.
3. LOGICA DJ: 
   - "intro": Inicio instrumental (seguro para mezclar).
   - "verse": Energía media, historia.
   - "chorus": Energía alta, repetitivo (Estribillo).
   - "bridge": Cambio de ritmo/melodía.
   - "breakdown": Bajón sin bombos.
   - "outro": Final de la canción.
4. HAS_VOCALS: Marca "true" si hay CUALQUIER tipo de voz (canto, rap, adlibs, chops). Solo usa "false" para instrumental puro.
5. DESC: Escribe 3-4 palabras de la letra si hay voz, o describe los instrumentos si es instrumental.

Responde JSON con:
- "timeline": Lista ordenada de secciones.
- "loops": Los 10 MEJORES momentos para loops de DJ (frases pegadizas de 2-8s).

USA FORMATO "MM:SS.d" (Ej: "01:30.5", "02:45.2").`;

  console.log('\n📝 Enviando prompt DJ-céntrico a Gemini...');

  if (params.jobId) {
    await actualizarProgresoJob(params.jobId, 85, 'Esperando respuesta de Gemini...');
  }

  // ============================================================================
  // LLAMADA A GEMINI CON RETRY INTELIGENTE
  // ============================================================================

  const maxIntentos = 3;
  let response: any;
  const errores: any[] = [];
  const allKeys = getGeminiApiKeys();
  let currentKeyIndex = 0;

  for (let intento = 0; intento < maxIntentos; intento++) {
    try {
      console.log(`   Intento ${intento + 1}/${maxIntentos}...`);

      const parts: any[] = [];

      if (params.fileUri) {
        parts.push({ fileData: { fileUri: params.fileUri, mimeType: params.fileMimeType } });
      } else if (params.fileBuffer) {
        const buffer = Buffer.from(
          params.fileBuffer instanceof ArrayBuffer ? new Uint8Array(params.fileBuffer) : params.fileBuffer
        );
        parts.push({ inlineData: { data: buffer.toString('base64'), mimeType: params.fileMimeType } });
      }

      parts.push({ text: prompt });

      // Usamos gemini-flash-latest por ser más estable y tener mejores cuotas que el experimental
      response = await ai.models.generateContent({
        model: 'models/gemini-flash-latest',
        contents: [{ role: 'user', parts }],
        config: {
          temperature: 1.0,
          topP: 0.95,
          topK: 40,
          maxOutputTokens: 65536,
          responseMimeType: 'application/json',
          responseJsonSchema: djUnifiedSchema,
        }
      });

      console.log(`✅ Respuesta exitosa en intento ${intento + 1}`);
      break; // Exit loop on success

    } catch (error: any) {
      // Only log and retry if we don't have a response yet
      const errorMsg = error?.message || String(error);
      const errorCode = error?.status || error?.code || error?.error?.code;
      errores.push({ error: errorMsg, code: errorCode });

      console.warn(`⚠️ Error en intento ${intento + 1}: ${errorMsg} (código: ${errorCode})`);

      // Extraer tiempo de espera sugerido (retryDelay)
      let waitTime = 2000 * (intento + 1); // Default backoff: 2s, 4s, 6s

      // Para errores 503 (Service Overloaded), esperar mucho más tiempo
      if (errorCode === 503 || errorMsg.includes('503') || errorMsg.includes('overloaded')) {
        waitTime = 10000 * (intento + 1); // 10s, 20s, 30s when service is overloaded
        console.log(`⚠️ Servicio sobrecargado (503). Esperando ${waitTime / 1000}s antes de reintentar...`);
      }

      const retryDelayMatch = errorMsg.match(/retry in ([\d.]+)s/);
      if (retryDelayMatch) {
        waitTime = Math.ceil(parseFloat(retryDelayMatch[1]) * 1000) + 1000; // +1s buffer
        console.log(`⏳ Gemini solicita espera de ${waitTime}ms`);
      }

      // Si es error 429 (Quota), intentar cambiar de key INMEDIATAMENTE si hay disponibles
      if (errorCode === 429 || errorMsg.includes('429') || errorMsg.includes('quota')) {
        if (currentKeyIndex < allKeys.length - 1) {
          currentKeyIndex++;
          ai = getGeminiClient(allKeys[currentKeyIndex]); // Forzar siguiente key
          console.log(`🔑 Cuota excedida. Cambiando a Key #${currentKeyIndex + 1}...`);
          await new Promise(resolve => setTimeout(resolve, 1000)); // Pequeña pausa
          continue; // Reintentar con nueva key
        } else {
          console.warn('⚠️ Todas las API keys han agotado su cuota o fallado.');
          // Si todas fallan, esperar el tiempo solicitado antes de reintentar con la primera (o la actual)
          if (intento < maxIntentos - 1) {
            console.log(`⏳ Esperando ${waitTime}ms antes de reintentar...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
          }
        }
      } else if (isRetryableError(error) && intento < maxIntentos - 1) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
      } else if (intento === maxIntentos - 1) {
        break;
      }
    }
  }

  if (!response) {
    const errorDetails = errores.map(e => `${e.error} (${e.code})`).join(' | ');
    throw new Error(`Fallo en Gemini tras ${errores.length} intentos. Errores: ${errorDetails}`);
  }

  // ============================================================================
  // PROCESAMIENTO DE RESPUESTA
  // ============================================================================

  if (params.jobId) {
    await actualizarProgresoJob(params.jobId, 95, 'Procesando respuesta...');
  }

  let resultado: any = {};
  try {
    // CORRECCIÓN: Limpieza de Markdown antes de parsear
    let text = typeof response.text === 'function' ? response.text() : (response.text || '{}');

    // GUARDAR DEBUG LOG
    await saveDebugLog(params.titulo, prompt, text);

    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    resultado = JSON.parse(text);
  } catch (e) {
    console.error('⚠️ Error parseando JSON de Gemini, usando Fallbacks:', e);
    resultado = {}; // Esto activará los fallbacks
  }

  console.log('\n📊 Procesando respuesta con Timeline Unificado...');

  // Mapeo de tipos del timeline a tipos de DB
  const mapTipoTimeline: Record<string, EstructuraMusical['tipo_seccion']> = {
    intro: 'intro',
    verse: 'verso',
    chorus: 'estribillo',
    bridge: 'puente',
    outro: 'outro',
    instrumental: 'solo_instrumental',
    breakdown: 'subidon_build_up'
  };

  // ============================================================================
  // 1. PROCESAR TIMELINE UNIFICADO
  // ============================================================================
  let timelineRaw = (resultado.timeline || []).map((item: any) => ({
    start_ms: Math.min(parseTimeStringToMs(item.s), duracionMaxMs),
    end_ms: Math.min(parseTimeStringToMs(item.e), duracionMaxMs),
    type: item.type,
    has_vocals: Boolean(item.has_vocals),
    desc: item.desc || ''
  })).sort((a: any, b: any) => a.start_ms - b.start_ms);

  // CORRECCIÓN DE FINAL: Asegurar que el último segmento llega al final real
  if (timelineRaw.length > 0) {
    const ultimo = timelineRaw[timelineRaw.length - 1];
    if (Math.abs(ultimo.end_ms - duracionMaxMs) > 2000) {
      console.log(`🔧 Extendiendo último segmento de ${formatTimeForPrompt(ultimo.end_ms)} a ${duracionFormatted}`);
      ultimo.end_ms = duracionMaxMs;
    }
  }

  // FALLBACK: Si Gemini no devolvió timeline
  if (timelineRaw.length === 0) {
    console.warn('⚠️ Gemini no devolvió timeline. Generando timeline básico.');
    timelineRaw = [
      { start_ms: 0, end_ms: 15000, type: 'intro', has_vocals: false, desc: 'Instrumental intro' },
      { start_ms: 15000, end_ms: duracionMaxMs - 15000, type: 'verse', has_vocals: true, desc: 'Main content' },
      { start_ms: duracionMaxMs - 15000, end_ms: duracionMaxMs, type: 'outro', has_vocals: false, desc: 'Instrumental outro' }
    ];
  }

  // Guardar timeline en formato DB
  const timeline: any[] = timelineRaw.map((t: any) => ({
    inicio: formatTimeForPrompt(t.start_ms),
    fin: formatTimeForPrompt(t.end_ms),
    tipo_seccion: mapTipoTimeline[t.type] || 'verso',
    has_vocals: t.has_vocals,
    descripcion: t.desc
  }));

  console.log(`✅ Timeline: ${timeline.length} segmentos (cobertura: 0:0.0 → ${duracionFormatted})`);

  // ============================================================================
  // 2. DERIVAR ESTRUCTURA del Timeline
  // ============================================================================
  const estructura: EstructuraMusical[] = timeline.map(t => ({
    tipo_seccion: t.tipo_seccion,
    inicio: t.inicio,
    fin: t.fin
  }));

  // ============================================================================
  // 3. DERIVAR VOCALES del Timeline (filtrar has_vocals === true)
  // ============================================================================
  const vocalesClave: BloqueVocal[] = timelineRaw
    .filter((t: any) => t.has_vocals === true)
    .map((t: any) => ({
      // Si es chorus o hook -> bloque_coro, si no -> bloque_verso
      tipo: (t.type === 'chorus' || t.type === 'hook') ? 'bloque_coro' : 'bloque_verso',
      inicio: formatTimeForPrompt(t.start_ms),
      fin: formatTimeForPrompt(t.end_ms)
    }));

  console.log(`✅ Vocales: ${vocalesClave.length} bloques`);

  // ============================================================================
  // 4. DERIVAR HUECOS del Timeline (filtrar has_vocals === false)
  // ============================================================================
  const huecos: HuecoInstrumental[] = timelineRaw
    .filter((t: any) => t.has_vocals === false)
    .map((t: any) => ({
      inicio: formatTimeForPrompt(t.start_ms),
      fin: formatTimeForPrompt(t.end_ms),
      tipo: 'instrumental_puro'
    }));

  // ============================================================================
  // 5. PROCESAR LOOPS (máximo 10, sin score)
  // ============================================================================
  const loopsTransicion: LoopTransicion[] = (resultado.loops || [])
    .map((item: any) => ({
      inicio_ms: Math.min(parseTimeStringToMs(item.s), duracionMaxMs),
      fin_ms: Math.min(parseTimeStringToMs(item.e), duracionMaxMs),
      texto: item.text || ''
    }))
    .filter((l: any) => l.inicio_ms < l.fin_ms)
    .slice(0, 10) // Máximo 10 loops
    .sort((a: any, b: any) => a.inicio_ms - b.inicio_ms)
    .map((l: any) => ({
      texto: l.texto,
      inicio: formatTimeForPrompt(l.inicio_ms),
      fin: formatTimeForPrompt(l.fin_ms)
    }));

  // Validación
  console.log(`✅ Análisis DJ completado:`);
  console.log(`   ✅ Estructura: ${estructura.length} secciones`);
  console.log(`   ✅ Vocales: ${vocalesClave.length} bloques`);
  console.log(`   ✅ Loops: ${loopsTransicion.length} candidatos`);
  console.log(`   ✅ Huecos: ${huecos.length} zonas instrumentales`);
  console.log(`⚡ Completado en ${(Date.now() - inicio) / 1000}s`);

  // ============================================================================
  // MAPEO A TIPOS INTERNOS
  // ============================================================================

  const resultadoFinal: CancionAnalizada = {
    id: params.hash_archivo, // ID temporal
    hash_archivo: params.hash_archivo,
    titulo: params.titulo,
    duracion_ms: duracionMaxMs,
    bpm: params.analisisTecnico.bpm,
    tonalidad_camelot: params.analisisTecnico.tonalidad_camelot,
    tonalidad_compatible: params.analisisTecnico.tonalidad_compatible,
    bailabilidad: params.analisisTecnico.bailabilidad,
    compas: params.analisisTecnico.compas,
    beats_ts_ms: params.analisisTecnico.beats_ts_ms,
    downbeats_ts_ms: params.analisisTecnico.downbeats_ts_ms,
    frases_ts_ms: params.analisisTecnico.frases_ts_ms,
    timeline: timeline, // NUEVO
    vocales_clave: vocalesClave,
    loops_transicion: loopsTransicion,
    estructura_ts: estructura,
    huecos_analizados: huecos,
    fecha_procesado: new Date()
  };

  return resultadoFinal;
}
