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
const ENABLE_DEBUG_LOGGING = true;
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
  // DJ-CENTRIC COMPACT SCHEMA
  // ============================================================================
  const djCompactSchema = {
    type: 'object',
    properties: {
      // Estructura: { s: start, e: end, c: code, ly: lyrics snippet }
      s: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            s: { type: 'string', description: "MM:SS.d" },
            e: { type: 'string', description: "MM:SS.d" },
            c: { type: 'string', enum: ['i', 'v', 'c', 'p', 's', 'o', 'b'] },
            ly: { type: 'string', description: "Snippet de letra o 'instrumental'" }
          },
          required: ['s', 'e', 'c']
        }
      },
      // Vocales: { s: start, e: end, c: code }
      v: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            s: { type: 'string', description: "MM:SS.d" },
            e: { type: 'string', description: "MM:SS.d" },
            c: { type: 'string', enum: ['v', 'c'] }
          },
          required: ['s', 'e', 'c']
        }
      },
      // Loops: { s: start, e: end, t: text, sc: score }
      l: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            s: { type: 'string', description: "MM:SS.d" },
            e: { type: 'string', description: "MM:SS.d" },
            t: { type: 'string' },
            sc: { type: 'number' }
          },
          required: ['s', 'e', 't', 'sc']
        }
      },
      // Eventos DJ: { t: time, c: code }
      e: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            t: { type: 'string', description: "MM:SS.d" },
            c: { type: 'string', enum: ['d', 'b', 'r', 'h'] }
          },
          required: ['t', 'c']
        }
      }
    },
    required: ['s', 'v', 'l', 'e']
  };

  // ============================================================================
  // PROMPT ULTRA-OPTIMIZADO - REMIX FRIENDLY
  // ============================================================================
  const prompt = `ERES UN EXPERTO EN TEORÍA MUSICAL Y DJ PROFESIONAL.
Analiza esta canción (Duración: ${durationSec}s, BPM: ${params.analisisTecnico.bpm}).

TU OBJETIVO: Definir la MACRO-ESTRUCTURA musical y los puntos de mezcla.

IMPORTANTE SOBRE LA ESTRUCTURA ("s"):
1. NO FRAGMENTES SECCIONES: Un "Verso" o un "Coro" son bloques largos (16-64 compases).
2. IGNORA SILENCIOS CORTOS (< 4s) dentro de una misma sección. Si el cantante respira, la sección CONTINÚA.
3. DETECTA EL CORO (ESTRIBILLO): Es la parte más energética, repetitiva y suele contener el título de la canción.
4. DIFERENCIA: "Pre-Coro" (preparación) vs "Coro" (explosión).

FORMATO JSON REQUERIDO:

"s" (Estructura MACRO): Bloques musicales COMPLETOS.
   - Códigos: "i"(intro), "v"(verso), "p"(pre-coro/puente), "c"(coro/estribillo), "s"(solo/inst), "o"(outro).
   - "ly": Escribe 3-4 palabras de la letra que suenen ahí para identificar la sección.

"v" (Voz Real): Aquí SÍ sé preciso con los silencios.
   - Marca exactamente cuándo hay voz y cuándo hay hueco instrumental.

"l" (Loops de Mezcla): Frases pegadizas de 1 a 4 compases (aprox 2-8 seg).
   - Ideal para hacer loops antes de un drop o cambio.

"e" (Eventos): Cambios bruscos de energía.
   - "d"(drop), "b"(breakdown/bajón).

RESPONDE SOLO JSON. USA FORMATO "MM:SS.d".`;

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
          responseJsonSchema: djCompactSchema,
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

  console.log('\n📊 Procesando respuesta DJ-céntrica...');

  // Diccionarios para traducir los códigos cortos a tus tipos DB
  const mapTipoEst: Record<string, EstructuraMusical['tipo_seccion']> = { i: 'intro', v: 'verso', c: 'estribillo', p: 'puente', s: 'solo_instrumental', o: 'outro', b: 'subidon_build_up' };
  const mapTipoVoc: Record<string, BloqueVocal['tipo']> = { v: 'bloque_verso', c: 'bloque_coro' };

  // 1. Convertir estructura (segundos → ms) y CORREGIR ALUCINACIONES
  let estructuraTemp = (resultado.s || []).map((item: any) => {
    const inicioMs = Math.min(parseTimeStringToMs(item.s), duracionMaxMs);
    const finMs = Math.min(parseTimeStringToMs(item.e), duracionMaxMs);
    let seccion = mapTipoEst[item.c] || 'verso';

    // Sin validación VAD - confiamos 100% en Gemini
    return {
      tipo_seccion: seccion,
      inicio_ms: inicioMs,
      fin_ms: finMs
    };
  }).filter((s: any) => s.inicio_ms < s.fin_ms)
    .sort((a: any, b: any) => a.inicio_ms - b.inicio_ms);

  // ============================================================================
  // FUSIÓN INTELIGENTE (INTELLIGENT MERGING)
  // ============================================================================
  // Si hay dos secciones del mismo tipo separadas por menos de 6 segundos,
  // son probablemente la misma sección fragmentada por Gemini.
  // Esto resuelve el problema de "5 versos de 10s" → "1 verso de 50s"

  const estructuraMerged: any[] = [];
  let fusionesRealizadas = 0;

  if (estructuraTemp.length > 0) {
    let actual = { ...estructuraTemp[0] };

    for (let i = 1; i < estructuraTemp.length; i++) {
      const siguiente = estructuraTemp[i];
      const gap = siguiente.inicio_ms - actual.fin_ms;

      // Reglas para fusionar:
      // 1. Mismo tipo de sección
      // 2. El hueco entre ellas es pequeño (< 6 segundos, aproximadamente 2-3 compases)
      if (actual.tipo_seccion === siguiente.tipo_seccion && gap < 6000) {
        // FUSIONAR: Extendemos el final del bloque actual
        console.log(`🔗 Fusionando "${actual.tipo_seccion}": ${formatTimeForPrompt(actual.inicio_ms)}-${formatTimeForPrompt(actual.fin_ms)} + ${formatTimeForPrompt(siguiente.inicio_ms)}-${formatTimeForPrompt(siguiente.fin_ms)} (gap: ${(gap / 1000).toFixed(1)}s)`);
        actual.fin_ms = siguiente.fin_ms;
        fusionesRealizadas++;
      } else {
        // NO FUSIONAR: Guardar el bloque actual y empezar uno nuevo
        estructuraMerged.push(actual);
        actual = { ...siguiente };
      }
    }
    estructuraMerged.push(actual); // Guardar el último bloque
  }

  // Reemplazar estructuraTemp con la versión fusionada
  if (fusionesRealizadas > 0) {
    console.log(`✨ Fusión inteligente completada: ${fusionesRealizadas} fusiones realizadas`);
    console.log(`   Secciones antes: ${estructuraTemp.length} → después: ${estructuraMerged.length}`);
    estructuraTemp = estructuraMerged;
  }

  // FALLBACK ESTRUCTURA: Si Gemini falló y el array está vacío
  if (estructuraTemp.length === 0) {
    console.warn('⚠️ Gemini no devolvió estructura. Generando estructura básica.');
    estructuraTemp = [
      { tipo_seccion: 'intro', inicio_ms: 0, fin_ms: 15000 },
      { tipo_seccion: 'verso', inicio_ms: 15000, fin_ms: duracionMaxMs - 15000 },
      { tipo_seccion: 'outro', inicio_ms: duracionMaxMs - 15000, fin_ms: duracionMaxMs }
    ];
  }

  // Fix: El último segmento debe terminar exactamente en duracionMaxMs
  if (estructuraTemp.length > 0) {
    estructuraTemp[estructuraTemp.length - 1].fin_ms = duracionMaxMs;
  }

  // Map to final string format
  const estructura: EstructuraMusical[] = estructuraTemp.map((s: any) => ({
    tipo_seccion: s.tipo_seccion,
    inicio: formatTimeForPrompt(s.inicio_ms),
    fin: formatTimeForPrompt(s.fin_ms)
  }));

  // 2. Convertir vocales (timestamps directos de Gemini)
  let vocalesTemp = (resultado.v || []).map((item: any) => {
    const rawStart = parseTimeStringToMs(item.s);
    const rawEnd = parseTimeStringToMs(item.e);

    return {
      tipo: mapTipoVoc[item.c] || 'bloque_verso',
      inicio_ms: Math.min(rawStart, duracionMaxMs),
      fin_ms: Math.min(rawEnd, duracionMaxMs),
    };
  })
    // Filtro: Rechazar bloques muy cortos (< 2s) excepto si son muy largos (safety)
    .filter((v: any) => (v.fin_ms - v.inicio_ms) >= 2000);

  // Sin fallback VAD - confiamos 100% en lo que Gemini detectó
  // Si Gemini no detectó vocales, respetamos esa decisión

  const vocalesClave: BloqueVocal[] = vocalesTemp.map((v: any) => ({
    tipo: v.tipo,
    inicio: formatTimeForPrompt(v.inicio_ms),
    fin: formatTimeForPrompt(v.fin_ms)
  }));

  console.log(`✅ Vocales detectadas: ${vocalesClave.length} bloques`);
  if (vocalesClave.length > 0) {
    console.log(`   Primer bloque: ${vocalesClave[0].inicio} - ${vocalesClave[0].fin} (${vocalesClave[0].tipo})`);
  }

  // 3. Convertir loops
  let loopsTemp = (resultado.l || []).map((item: any) => ({
    inicio_ms: Math.min(parseTimeStringToMs(item.s), duracionMaxMs),
    fin_ms: Math.min(parseTimeStringToMs(item.e), duracionMaxMs),
    texto: item.t || '',
    score: Math.max(1, Math.min(10, Number(item.sc) || 5))
  })).filter((l: any) => l.inicio_ms < l.fin_ms);

  // 4. Eventos DJ eliminados (campo eventos_clave_dj ya no se usa)

  // 5. Recalcular huecos instrumentales basándonos en vocales_clave (Usando vocalesTemp que tiene MS)
  const huecos: HuecoInstrumental[] = [];
  if (vocalesTemp.length > 0) {
    const sorted = [...vocalesTemp].sort((a: any, b: any) => a.inicio_ms - b.inicio_ms);
    // Inicio
    if (sorted[0].inicio_ms > 4000) {
      huecos.push({
        inicio: formatTimeForPrompt(0),
        fin: formatTimeForPrompt(sorted[0].inicio_ms),
        tipo: 'instrumental_puro'
      });
    }
    // Medio
    for (let i = 0; i < sorted.length - 1; i++) {
      const gap = sorted[i + 1].inicio_ms - sorted[i].fin_ms;
      if (gap > 3000) {
        huecos.push({
          inicio: formatTimeForPrompt(sorted[i].fin_ms),
          fin: formatTimeForPrompt(sorted[i + 1].inicio_ms),
          tipo: 'instrumental_puro'
        });
      }
    }
    // Final
    if (duracionMaxMs - sorted[sorted.length - 1].fin_ms > 4000) {
      huecos.push({
        inicio: formatTimeForPrompt(sorted[sorted.length - 1].fin_ms),
        fin: formatTimeForPrompt(duracionMaxMs),
        tipo: 'instrumental_puro'
      });
    }
  } else {
    huecos.push({
      inicio: formatTimeForPrompt(0),
      fin: formatTimeForPrompt(duracionMaxMs),
      tipo: 'instrumental_puro'
    });
  }

  // FALLBACK: Si Gemini no encontró loops, o encontró muy pocos,
  // creamos loops instrumentales "seguros" basados en los huecos detectados.
  if (loopsTemp.length < 2) {
    huecos.forEach(hueco => {
      const inicioMs = parseTimeStringToMs(hueco.inicio);
      const finMs = parseTimeStringToMs(hueco.fin);
      const duracion = finMs - inicioMs;

      // Si el hueco dura más de 8 segundos (aprox 4 compases a 120bpm)
      if (duracion >= 8000) {
        // Crear un loop al final del hueco (ideal para mezclar salida)
        loopsTemp.push({
          texto: "Loop Instrumental (Safety)", // Marcador especial
          inicio_ms: finMs - 4000, // Últimos 4 seg
          fin_ms: finMs,
          score: 8 // Score alto porque es instrumental puro = fácil de mezclar
        });
      }
    });
  }

  // Ordenar loops por tiempo
  loopsTemp.sort((a: any, b: any) => a.inicio_ms - b.inicio_ms);

  const loopsTransicion: LoopTransicion[] = loopsTemp.map((l: any) => ({
    texto: l.texto,
    inicio: formatTimeForPrompt(l.inicio_ms),
    fin: formatTimeForPrompt(l.fin_ms),
    score: l.score
  }));

  // Validación
  console.log(`✅ Análisis DJ completado:`);
  console.log(`   ✅ Estructura: ${estructura.length} secciones`);

  // Mostrar resumen de estructura para verificar que no hay fragmentación excesiva
  if (estructura.length > 0) {
    console.log(`   📊 Desglose de estructura:`);
    estructura.forEach((sec, idx) => {
      const duracionMs = parseTimeStringToMs(sec.fin) - parseTimeStringToMs(sec.inicio);
      const duracionSeg = (duracionMs / 1000).toFixed(1);
      console.log(`      ${idx + 1}. ${sec.tipo_seccion.padEnd(20)} ${sec.inicio} → ${sec.fin} (${duracionSeg}s)`);
    });
  }

  console.log(`   ✅ Vocales: ${vocalesClave.length} bloques`);
  console.log(`   ✅ Loops: ${loopsTransicion.length} candidatos`);
  console.log(`   ✅ Huecos: ${huecos.length} zonas instrumentales`);
  console.log(`⚡ Completado en ${(Date.now() - inicio) / 1000}s`);

  // ============================================================================
  // MAPEO A TIPOS INTERNOS
  // ============================================================================

  const estructuraTs: EstructuraMusical[] = estructura;

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
    vocales_clave: vocalesClave,
    loops_transicion: loopsTransicion,
    estructura_ts: estructuraTs,
    huecos_analizados: huecos,
    fecha_procesado: new Date()
  };

  return resultadoFinal;
}
