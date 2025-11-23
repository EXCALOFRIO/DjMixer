/**
 * Optimizador de peticiones a Gemini
 * UNA SOLA PETICIÓN para transcripción + análisis completo
 */

import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({
  apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY,
});

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
 * 2. DIVISIÓN EN DOS PASOS
 * Paso 1: Solo transcripción (audio → texto) - LA PARTE LENTA
 */
export interface TranscripcionSchema {
  palabras: Array<{
    palabra: string;
    tiempo_ms: number;
    fin_verso?: boolean;
  }>;
}

export async function transcribirAudio(
  fileUri: string,
  fileMimeType: string,
  duracionMs: number
): Promise<TranscripcionSchema> {
  console.log('🎤 PASO 1: Transcribiendo audio (esto puede tardar)...');
  
  const duracionSegundos = Math.floor(duracionMs / 1000);
  
  const transcriptionSchema = {
    type: 'object',
    properties: {
      palabras: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            palabra: { type: 'string', description: 'Palabra individual' },
            tiempo_ms: { type: 'number', description: 'Tiempo en milisegundos' },
            fin_verso: { type: 'boolean', description: 'true si termina un verso/línea' }
          },
          required: ['palabra', 'tiempo_ms']
        }
      }
    },
    required: ['palabras']
  };

  const prompt = `Transcribe todas las palabras cantadas con timestamps en milisegundos. Duración: ${duracionSegundos}s. Marca fin_verso:true al final de cada línea. Si es instrumental, devuelve array vacío.`;

  const response = await ai.models.generateContent({
    model: 'models/gemini-flash-lite-latest',
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
      temperature: 1,
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 65536,
      responseMimeType: 'application/json',
      responseJsonSchema: transcriptionSchema,
    }
  });

  const transcripcion = JSON.parse(response.text || '{"palabras":[]}');
  console.log(`✅ PASO 1 completado: ${transcripcion.palabras?.length || 0} palabras transcritas`);
  
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
  }
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
    .map(p => `[${p.tiempo_ms}ms] ${p.palabra}${p.fin_verso ? '\n' : ''}`)
    .join(' ');

  const prompt = `Analiza esta canción.

TÉCNICO: BPM ${analisisTecnico.bpm}, ${analisisTecnico.duracion_ms}ms, energía ${(analisisTecnico.energia * 100).toFixed(0)}%, ánimo ${analisisTecnico.animo_general}

LETRA CON TIMESTAMPS:
${letra || '[Instrumental]'}

Identifica: 1) estructura (intro/verso/estribillo/puente/outro/instrumental/build_up), 2) tema (resumen corto, palabras clave, emoción), 3) eventos DJ importantes. Usa milisegundos.`;

  const response = await ai.models.generateContent({
    model: 'models/gemini-flash-lite-latest',
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }]
      }
    ],
    config: {
      temperature: 1,
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 65536,
      responseMimeType: 'application/json',
      responseJsonSchema: analysisSchema,
    }
  });

  const analisis = JSON.parse(response.text || '{}');
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
      tiempo_ms: number;
      fin_verso?: boolean;
    }>;
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
}

export async function analizarConGeminiOptimizado(params: {
  fileUri?: string;
  fileMimeType: string;
  fileBuffer?: ArrayBuffer;
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
  };
}): Promise<{
  transcripcion: TranscripcionSchema;
  analisis: AnalisisAvanzadoSchema;
  tiempos: {
    total_ms: number;
  };
}> {
  const inicio = Date.now();
  console.log('🚀 Análisis completo en UNA sola petición a Gemini...');
  
  const duracionSegundos = Math.floor(params.analisisTecnico.duracion_ms / 1000);
  
  // Schema combinado
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
                tiempo_ms: { type: 'number' },
                fin_verso: { type: 'boolean' }
              },
              required: ['palabra', 'tiempo_ms']
            }
          }
        },
        required: ['palabras']
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
    required: ['transcripcion', 'estructura', 'tema', 'eventos_dj']
  };

  const prompt = `Analiza este audio de ${duracionSegundos}s completamente:

DATOS TÉCNICOS: BPM ${params.analisisTecnico.bpm}, energía ${(params.analisisTecnico.energia * 100).toFixed(0)}%, ${params.analisisTecnico.animo_general}

TAREAS:
1. transcripcion.palabras: Transcribe todas las palabras con tiempo_ms y marca fin_verso:true al final de líneas. Si es instrumental devuelve array vacío.
2. estructura: Identifica secciones (intro/verso/estribillo/puente/outro/instrumental/build_up) con inicio_ms y fin_ms
3. tema: Resumen corto, palabras clave, emoción
4. eventos_dj: Marca drops, breaks, build-ups, cambios de ritmo, hooks con tiempo_ms

Usa milisegundos en todos los timestamps.`;

  const modelos = [
    { id: 'models/gemini-flash-lite-latest', label: 'Gemini Flash Lite' },
    { id: 'models/gemini-flash-latest', label: 'Gemini Flash' },
  ];

  const maxIntentosPorModelo = 3;
  let response: any;
  const errores: any[] = [];

  for (const modelo of modelos) {
    let intentos = 0;
    while (intentos < maxIntentosPorModelo) {
      try {
        console.log(`   Intento ${intentos + 1}/${maxIntentosPorModelo} con ${modelo.label} (${modelo.id})...`);
        const parts: any[] = [];
        if (params.fileUri) {
          parts.push({ fileData: { fileUri: params.fileUri, mimeType: params.fileMimeType } });
        } else if (params.fileBuffer) {
          const buffer = Buffer.from(params.fileBuffer instanceof ArrayBuffer ? new Uint8Array(params.fileBuffer) : params.fileBuffer);
          parts.push({ inlineData: { data: buffer.toString('base64'), mimeType: params.fileMimeType } });
        } else {
          throw new Error('No se proporcionó fileUri ni fileBuffer para Gemini');
        }
        parts.push({ text: prompt });

        response = await ai.models.generateContent({
          model: modelo.id,
          contents: [
            {
              role: 'user',
              parts,
            }
          ],
          config: {
            temperature: 1,
            topP: 0.95,
            topK: 40,
            maxOutputTokens: 65536,
            responseMimeType: 'application/json',
            responseJsonSchema: completeSchema,
          }
        });
        break; // éxito
      } catch (error: any) {
        intentos++;
        errores.push(error);

        if (isRetryableGeminiError(error) && intentos < maxIntentosPorModelo) {
          const esperaMs = Math.min(1000 * Math.pow(2, intentos - 1), 30000);
          console.warn(`   ⚠️ ${modelo.label} sobrecargado (${error?.status || 'sin status'}). Reintentando en ${(esperaMs / 1000).toFixed(1)}s...`);
          await new Promise(resolve => setTimeout(resolve, esperaMs));
          continue;
        }

        console.error(`   ❌ ${modelo.label} falló definitivamente: ${error?.message || error}`);
        break;
      }
    }

    if (response) {
      if (modelo.id === 'models/gemini-flash-lite-latest' && intentos > 1) {
        console.log(`   ✅ ${modelo.label} respondió tras ${intentos} intentos.`);
      }
      break;
    } else {
      console.warn(`   ⚠️ ${modelo.label} no respondió después de ${maxIntentosPorModelo} intentos. Probando siguiente modelo...`);
    }
  }

  if (!response) {
    const ultimoError = errores[errores.length - 1];
    throw new Error(`No se pudo obtener respuesta de Gemini tras probar ${modelos.length} modelos. Último error: ${ultimoError?.message || ultimoError}`);
  }

  const resultado: Partial<AnalisisCompletoSchema> = JSON.parse(response.text || '{}');

  const palabrasSanitizadas: TranscripcionSchema['palabras'] = Array.isArray(resultado.transcripcion?.palabras)
    ? resultado.transcripcion!.palabras
        .filter((item: any) =>
          item && typeof item.palabra === 'string' && item.palabra.trim().length > 0 && typeof item.tiempo_ms === 'number'
        )
        .map(item => ({
          palabra: String(item.palabra),
          tiempo_ms: Number(item.tiempo_ms),
          fin_verso: Boolean(item.fin_verso),
        }))
    : [];

  const estructuraSanitizada: AnalisisAvanzadoSchema['estructura'] = Array.isArray(resultado.estructura)
    ? resultado.estructura
        .filter((item: any) =>
          item && typeof item.seccion === 'string' && typeof item.inicio_ms === 'number' && typeof item.fin_ms === 'number'
        )
        .map(item => ({
          seccion: item.seccion as AnalisisAvanzadoSchema['estructura'][number]['seccion'],
          inicio_ms: Number(item.inicio_ms),
          fin_ms: Number(item.fin_ms),
        }))
    : [];

  const temaSanitizado: AnalisisAvanzadoSchema['tema'] = {
    resumen: resultado.tema?.resumen?.toString() || 'Sin información',
    palabras_clave: Array.isArray(resultado.tema?.palabras_clave)
      ? resultado.tema!.palabras_clave.filter((p: any) => typeof p === 'string' && p.trim().length > 0).map((p: string) => p.trim())
      : [],
    emocion: (resultado.tema?.emocion as AnalisisAvanzadoSchema['tema']['emocion']) || 'reflexivo',
  };

  const eventosSanitizados: AnalisisAvanzadoSchema['eventos_dj'] = Array.isArray(resultado.eventos_dj)
    ? resultado.eventos_dj
        .filter((item: any) => item && typeof item.tipo === 'string' && typeof item.tiempo_ms === 'number')
        .map(item => ({
          tipo: item.tipo as AnalisisAvanzadoSchema['eventos_dj'][number]['tipo'],
          tiempo_ms: Number(item.tiempo_ms),
          descripcion: item.descripcion ? String(item.descripcion) : undefined,
        }))
    : [];

  const tiempoTotal = Date.now() - inicio;

  if (palabrasSanitizadas.length === 0) {
    console.warn('⚠️ Gemini no devolvió transcripción válida; se usará array vacío.');
  }
  if (estructuraSanitizada.length === 0) {
    console.warn('⚠️ Gemini no devolvió estructura válida; se usará array vacío.');
  }

  console.log(`✅ Análisis completo:
  - ${palabrasSanitizadas.length} palabras transcritas
  - ${estructuraSanitizada.length} secciones identificadas
  - ${eventosSanitizados.length} eventos DJ
  - Tiempo total: ${(tiempoTotal / 1000).toFixed(1)}s`);

  return {
    transcripcion: { palabras: palabrasSanitizadas },
    analisis: {
      estructura: estructuraSanitizada,
      tema: temaSanitizado,
      eventos_dj: eventosSanitizados,
    },
    tiempos: {
      total_ms: tiempoTotal,
    },
  };
}
