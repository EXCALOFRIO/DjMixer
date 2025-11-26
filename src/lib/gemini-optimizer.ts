/**
 * DJ-CENTRIC GEMINI OPTIMIZER
 * Optimized for speed and DJ-specific analysis
 * NO word-by-word transcription - focuses on structure, vocal blocks, and loops
 */

import { GoogleGenAI } from '@google/genai';
import { actualizarProgresoJob } from './analysis-jobs';
import { getGeminiApiKeys } from './gemini-keys';
import type {
  AnalisisContenido,
  EstructuraMusical,
  EventoClaveDJ,
  BloqueVocal,
  LoopTransicion,
  CancionAnalizada,
  SegmentoVoz,
} from './db';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/** Convierte ms a MM:SS para el prompt (Gemini entiende mejor este formato) */
function formatTimeForPrompt(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/** Convierte ms a segundos con 2 decimales (1500ms -> 1.5s) */
function msToSec(ms: number): number {
  return Math.round(ms / 10) / 100;
}

/** Convierte segundos a ms enteros (1.5s -> 1500ms) */
function secToMs(sec: number): number {
  return Math.round(sec * 1000);
}

/**
 * GROUND TRUTH VALIDATION
 * Valida si un intervalo temporal tiene voz real según el VAD
 * Esto previene alucinaciones de Gemini marcando versos donde no hay voz
 */
function validarPresenciaVocal(inicio: number, fin: number, vad: SegmentoVoz[]): boolean {
  // Margen de error de 1 segundo
  const margen = 1000;
  // Buscamos si hay algún solapamiento significativo
  return vad.some(v =>
    (inicio < v.end_ms + margen) && (fin > v.start_ms - margen)
  );
}

/** Mapea sección de Gemini a tipo interno */
function mapSeccionToTipo(seccion: string): EstructuraMusical['tipo_seccion'] {
  const map: Record<string, EstructuraMusical['tipo_seccion']> = {
    'intro': 'intro',
    'verso': 'verso',
    'estribillo': 'estribillo',
    'puente': 'puente',
    'instrumental': 'solo_instrumental',
    'outro': 'outro',
    'build_up': 'subidon_build_up',
    'drop': 'subidon_build_up'
  };
  return map[seccion.toLowerCase()] || 'verso';
}

/** Mapea evento DJ de Gemini a tipo interno */
function mapEventoDJ(tipo: string): EventoClaveDJ['evento'] | null {
  const map: Record<string, EventoClaveDJ['evento']> = {
    'drop': 'caida_de_bajo',
    'break': 'acapella_break',
    'build_up': 'cambio_ritmico_notable',
    'cambio_ritmo': 'cambio_ritmico_notable',
    'hook': 'melodia_iconica'
  };
  return map[tipo.toLowerCase()] || null;
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
  segmentosVoz: SegmentoVoz[];
  nombreCancion?: string;
  analisisTecnico: {
    duracion_ms: number;
    bpm: number;
    energia: number;
    tonalidad_camelot: string;
    tonalidad_compatible: string[];
    bailabilidad: number;
    animo_general: string;
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

  console.log('\n🎧 ANÁLISIS DJ-CENTRIC CON GEMINI (ULTRA-RÁPIDO)');
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

  // Preparar contexto VAD en formato MM:SS
  const segmentosContexto = params.segmentosVoz && params.segmentosVoz.length > 0
    ? params.segmentosVoz.map(s => `[${formatTimeForPrompt(s.start_ms)}-${formatTimeForPrompt(s.end_ms)}]`).join(', ')
    : 'No disponible (analizar audio para detectar voz)';

  console.log(`⏱️  Duración: ${duracionFormatted} (${durationSec}s)`);
  console.log(`🎤 Zonas VAD: ${segmentosContexto}`);

  // ============================================================================
  // DJ-CENTRIC SCHEMA
  // ============================================================================

  // ============================================================================
  // SCHEMA ULTRA-OPTIMIZADO - Solo datos para algoritmo A* de mezcla
  // ============================================================================
  const djSchema = {
    type: 'object',
    properties: {
      estructura: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            seccion: {
              type: 'string',
              enum: ['intro', 'verso', 'estribillo', 'puente', 'instrumental', 'outro', 'drop', 'build_up']
            },
            inicio_segundos: { type: 'number' },
            fin_segundos: { type: 'number' }
          },
          required: ['seccion', 'inicio_segundos', 'fin_segundos']
        }
      },
      vocales_principales: {
        type: 'array',
        description: 'Solo bloques de voz PRINCIPAL (versos/coros). NO adlibs ni gritos cortos',
        items: {
          type: 'object',
          properties: {
            tipo: {
              type: 'string',
              enum: ['bloque_verso', 'bloque_coro']
            },
            inicio_segundos: { type: 'number' },
            fin_segundos: { type: 'number' }
          },
          required: ['tipo', 'inicio_segundos', 'fin_segundos']
        }
      },
      loops: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            frase: { type: 'string' },
            inicio_segundos: { type: 'number' },
            fin_segundos: { type: 'number' },
            score: { type: 'number', minimum: 1, maximum: 10 }
          },
          required: ['frase', 'inicio_segundos', 'fin_segundos', 'score']
        }
      },
      eventos_dj: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            tipo: { type: 'string', enum: ['drop', 'break', 'build_up'] },
            tiempo_segundos: { type: 'number' }
          },
          required: ['tipo', 'tiempo_segundos']
        }
      }
    },
    required: ['estructura', 'vocales_principales', 'loops', 'eventos_dj']
  };

  // ============================================================================
  // PROMPT ULTRA-OPTIMIZADO - Solo datos de mezcla
  // ============================================================================

  // ============================================================================
  // PROMPT ANTI-ALUCINACIONES CON GROUND TRUTH
  // ============================================================================
  const prompt = `ACTÚA COMO INGENIERO DE AUDIO. ANALIZA ESTE ARCHIVO ESPECÍFICO.

⚠️ ADVERTENCIA DE SEGURIDAD:
Este audio puede ser un REMIX, RADIO EDIT o EXTENDED MIX.
NO USES TU MEMORIA sobre la "canción original".
SOLO ANALIZA LO QUE ESCUCHAS Y LOS DATOS TÉCNICOS PROVISTOS.

DATOS TÉCNICOS (VERDAD ABSOLUTA):
- Duración Total: ${durationSec} segundos.
- Zonas con VOZ HUMANA (VAD): ${segmentosContexto || "NINGUNA DETECTADA"}
- BPM: ${params.analisisTecnico.bpm}

REGLAS ESTRICTAS DE ESTRUCTURA:
1. Si un segmento de tiempo NO está en la lista de "Zonas con VOZ HUMANA", es IMPOSIBLE que sea "verso" o "estribillo". Debe ser "intro", "instrumental", "puente", "drop" u "outro".
2. NO inventes letra en zonas instrumentales.
3. El "Outro" debe terminar exactamente en el segundo ${durationSec}.

TAREAS (JSON en SEGUNDOS):
1. "estructura": Segmentación completa.
2. "vocales_principales": Bloques grandes de voz (Versos/Coros). IGNORA voces cortas (adlibs).
3. "loops": Frases repetitivas al final de bloques para mezclar (ej: "tú sabes... tú sabes...").
4. "eventos_dj": Drops y cambios de energía.

Responde solo con el JSON.`;

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
          temperature: 0.2,
          topP: 0.95,
          topK: 40,
          maxOutputTokens: 8192,
          responseMimeType: 'application/json',
          responseJsonSchema: djSchema,
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
      let waitTime = 2000 * (intento + 1); // Default backoff
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

  let resultado: any;
  try {
    resultado = JSON.parse(response.text || '{}');
  } catch (e) {
    throw new Error('Respuesta JSON inválida de Gemini');
  }

  console.log('\n📊 Procesando respuesta DJ-céntrica...');

  // ============================================================================
  // POST-PROCESAMIENTO CON VALIDACIÓN VAD (GROUND TRUTH)
  // ============================================================================

  // 1. Convertir estructura (segundos → ms) y CORREGIR ALUCINACIONES
  const estructura = Array.isArray(resultado.estructura)
    ? resultado.estructura.map((s: any) => {
      const inicioMs = Math.min(secToMs(s.inicio_segundos), duracionMaxMs);
      const finMs = Math.min(secToMs(s.fin_segundos), duracionMaxMs);

      let seccion = s.seccion;

      // VALIDACIÓN DE REALIDAD:
      // Si Gemini dice "verso" o "estribillo", pero el VAD dice que hay silencio...
      // ...lo cambiamos a "instrumental" o "puente" forzosamente.
      const esVocal = ['verso', 'estribillo'].includes(seccion.toLowerCase());
      const hayVozReal = validarPresenciaVocal(inicioMs, finMs, params.segmentosVoz);

      if (esVocal && !hayVozReal) {
        console.warn(`👻 Alucinación corregida: "${seccion}" en ${s.inicio_segundos}s cambiado a "puente" por falta de VAD.`);
        seccion = 'puente'; // O 'instrumental'
      }

      return {
        seccion,
        inicio_ms: inicioMs,
        fin_ms: finMs
      };
    }).filter((s: any) => s.inicio_ms < s.fin_ms)
    : [];

  // Fix: El último segmento debe terminar exactamente en duracionMaxMs
  if (estructura.length > 0) {
    estructura[estructura.length - 1].fin_ms = duracionMaxMs;
  }

  // 2. Convertir vocales_principales (con filtro de segmentos cortos Y validación VAD)
  const vocalesClave: BloqueVocal[] = Array.isArray(resultado.vocales_principales)
    ? resultado.vocales_principales.map((v: any) => ({
      tipo: v.tipo as BloqueVocal['tipo'],
      inicio_ms: Math.min(secToMs(v.inicio_segundos), duracionMaxMs),
      fin_ms: Math.min(secToMs(v.fin_segundos), duracionMaxMs)
    }))
      // Filtro 1: Duración mínima (evita ruiditos)
      .filter((v: any) => (v.fin_ms - v.inicio_ms) > 1500)
      // Filtro 2: GROUND TRUTH - Validación contra VAD real
      .filter((v: any) => {
        const hayVoz = validarPresenciaVocal(v.inicio_ms, v.fin_ms, params.segmentosVoz);
        if (!hayVoz) {
          console.warn(`👻 Vocal alucinado eliminado: ${v.tipo} en ${msToSec(v.inicio_ms)}s (sin VAD)`);
        }
        return hayVoz;
      })
    : [];

  // 3. Convertir loops
  const loopsTransicion: LoopTransicion[] = Array.isArray(resultado.loops)
    ? resultado.loops.map((l: any) => ({
      texto: String(l.frase || ''),
      inicio_ms: Math.min(secToMs(l.inicio_segundos), duracionMaxMs),
      fin_ms: Math.min(secToMs(l.fin_segundos), duracionMaxMs),
      score: Math.max(1, Math.min(10, Number(l.score) || 5))
    })).filter((l: any) => l.inicio_ms < l.fin_ms)
    : [];


  const eventosDj = Array.isArray(resultado.eventos_dj)
    ? resultado.eventos_dj.map((e: any) => ({
      tipo: e.tipo,
      tiempo_ms: Math.min(secToMs(e.tiempo_segundos), duracionMaxMs)
    }))
    : [];

  // 5. Recalcular huecos instrumentales basándonos en vocales_clave
  const huecos: any[] = [];

  if (vocalesClave.length > 0) {
    const vocalesOrdenadas = [...vocalesClave].sort((a, b) => a.inicio_ms - b.inicio_ms);

    // Hueco antes del primer bloque vocal
    if (vocalesOrdenadas[0].inicio_ms > 4000) {
      huecos.push({
        inicio_ms: 0,
        fin_ms: vocalesOrdenadas[0].inicio_ms,
        tipo: 'instrumental_puro'
      });
    }

    // Huecos entre bloques vocales
    for (let i = 0; i < vocalesOrdenadas.length - 1; i++) {
      const gap = vocalesOrdenadas[i + 1].inicio_ms - vocalesOrdenadas[i].fin_ms;
      if (gap > 3000) {
        huecos.push({
          inicio_ms: vocalesOrdenadas[i].fin_ms,
          fin_ms: vocalesOrdenadas[i + 1].inicio_ms,
          tipo: 'instrumental_puro'
        });
      }
    }

    // Hueco después del último bloque vocal
    const ultimoVocal = vocalesOrdenadas[vocalesOrdenadas.length - 1];
    if (duracionMaxMs - ultimoVocal.fin_ms > 4000) {
      huecos.push({
        inicio_ms: ultimoVocal.fin_ms,
        fin_ms: duracionMaxMs,
        tipo: 'instrumental_puro'
      });
    }
  } else {
    // Si no hay vocales, toda la canción es instrumental
    huecos.push({
      inicio_ms: 0,
      fin_ms: duracionMaxMs,
      tipo: 'instrumental_puro'
    });
  }

  // Validación
  console.log(`✅ Análisis DJ completado:`);
  console.log(`   ✅ Estructura: ${estructura.length} secciones`);
  console.log(`   ✅ Vocales: ${vocalesClave.length} bloques`);
  console.log(`   ✅ Loops: ${loopsTransicion.length} candidatos`);
  console.log(`   ✅ Huecos: ${huecos.length} zonas instrumentales`);
  console.log(`   ✅ Eventos DJ: ${eventosDj.length}`);
  console.log(`⚡ Completado en ${(Date.now() - inicio) / 1000}s`);

  // ============================================================================
  // MAPEO A TIPOS INTERNOS
  // ============================================================================

  const estructuraTs: EstructuraMusical[] = estructura.map((item: any) => ({
    tipo_seccion: mapSeccionToTipo(item.seccion),
    inicio_ms: item.inicio_ms,
    fin_ms: item.fin_ms,
  }));

  const eventosClaveDj: EventoClaveDJ[] = eventosDj
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

  // Agregar loops como eventos "melodia_iconica"
  const loopsComoEventos: EventoClaveDJ[] = loopsTransicion
    .filter(l => l.score >= 7) // Solo loops con score alto
    .map(l => ({
      evento: 'melodia_iconica' as const,
      inicio_ms: l.inicio_ms,
      fin_ms: l.fin_ms,
    }));

  const analisisContenido: AnalisisContenido = {
    analisis_lirico_tematico: {
      tema_principal: '',
      palabras_clave_semanticas: [],
      evolucion_emocional: 'neutral',
    },
    eventos_clave_dj: [...eventosClaveDj, ...loopsComoEventos],
    diagnostico_tecnico: {
      resumen_segmentos_voz: `${vocalesClave.length} bloques vocales detectados`,
      huecos_resumen: `${huecos.length} zonas instrumentales`
    },
  };

  // ============================================================================
  // RETURN COMPLETO
  // ============================================================================

  return {
    id: '',
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
    cue_points: [],
    mix_in_point: null,
    mix_out_point: null,
    vocales_clave: vocalesClave,
    loops_transicion: loopsTransicion,
    estructura_ts: estructuraTs,
    analisis_contenido: analisisContenido,
    presencia_vocal_ts: [],
    analisis_espectral: null,
    segmentos_voz: params.segmentosVoz,
    huecos_analizados: huecos,
    fecha_procesado: new Date(),
  } as CancionAnalizada;
}
