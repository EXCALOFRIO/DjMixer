import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { sql } from '@/lib/db';
import * as musicMetadata from 'music-metadata';
import { analizarAudioCompleto } from '@/lib/audio-analyzer-unified';
import { analizarConGeminiOptimizado } from '@/lib/gemini-optimizer';
import {
  crearJobAnalisis,
  marcarJobEnProceso,
  actualizarProgresoJob,
  marcarJobCompletado,
  marcarJobFallido
} from '@/lib/analysis-jobs';
import { existeCancionPorHash, guardarAnalisisEnDB } from '@/lib/db-persistence';

const ai = new GoogleGenAI({
  apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY,
});

const RETRYABLE_GEMINI_CODES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

function isRetryableGeminiError(error: any): boolean {
  if (!error) return false;
  const message = typeof error.message === 'string' ? error.message.toLowerCase() : '';
  const errorString = String(error).toLowerCase();
  const status = Number(error?.status ?? error?.code ?? error?.error?.code);
  const statusLabel = String(error?.error?.status ?? '').toLowerCase();
  return (
    RETRYABLE_GEMINI_CODES.has(status) ||
    statusLabel === 'unavailable' ||
    statusLabel === 'resource_exhausted' ||
    message.includes('overloaded') ||
    message.includes('temporarily unavailable') ||
    message.includes('quota') ||
    message.includes('try again later') ||
    message.includes('fetch failed') ||
    message.includes('econnreset') ||
    message.includes('etimedout') ||
    message.includes('network') ||
    errorString.includes('fetch failed') ||
    errorString.includes('network')
  );
}

function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function executeWithRetries<T>(task: () => Promise<T>, options?: {
  maxAttempts?: number;
  initialDelayMs?: number;
  backoffFactor?: number;
  label?: string;
}): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelayMs = 3000,
    backoffFactor = 2,
    label = 'Operación'
  } = options || {};

  let attempt = 0;
  let lastError: any;

  while (attempt < maxAttempts) {
    try {
      return await task();
    } catch (error: any) {
      lastError = error;
      attempt += 1;

      if (!isRetryableGeminiError(error) || attempt >= maxAttempts) {
        throw error;
      }

      const delay = initialDelayMs * Math.pow(backoffFactor, attempt - 1);
      console.warn(`⚠️ ${label} intento ${attempt} fallido (${error?.message || 'Error desconocido'}). Reintentando en ${delay}ms...`);
      await wait(delay);
    }
  }

  throw lastError;
}

// Calcular hash SHA-256
async function calcularHashArchivo(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const async = formData.get('async') === 'true'; // Modo asíncrono opcional
    
    if (!file) {
      return NextResponse.json(
        { error: 'No se proporcionó ningún archivo' },
        { status: 400 }
      );
    }

    // 1. Calcular hash
    const arrayBuffer = await file.arrayBuffer();
    const hash = await calcularHashArchivo(arrayBuffer);

    // 2. Verificar caché en BD
    if (await existeCancionPorHash(hash)) {
      console.log('✅ Canción recuperada de caché');
      const existente = await sql`
        SELECT * FROM canciones_analizadas WHERE hash_archivo = ${hash}
      `;
      return NextResponse.json(existente[0]);
    }

    // 3. Crear job de análisis
    await crearJobAnalisis(hash);

    // 4. Si es modo asíncrono, devolver jobId inmediatamente
    if (async) {
      console.log('⚡ Modo asíncrono: iniciando análisis en segundo plano');
      
      // Iniciar proceso en segundo plano (sin await)
      procesarAnalisisAsync(hash, file, arrayBuffer).catch(error => {
        console.error('❌ Error en procesamiento asíncrono:', error);
        marcarJobFallido(hash, error.message).catch(console.error);
      });

      return NextResponse.json({
        status: 'processing',
        jobId: hash,
        message: 'Análisis iniciado. Consulta /api/analyze/status?jobId=' + hash
      }, { status: 202 });
    }

    // 5. Modo síncrono: procesar ahora y esperar resultado
    console.log('⏳ Modo síncrono: procesando análisis...');
    const resultado = await procesarAnalisisSync(hash, file, arrayBuffer);
    
    return NextResponse.json(resultado);

  } catch (error: any) {
    console.error('❌ Error en API:', error);
    
    // Manejo específico de errores de Gemini
    if (error.message?.includes('503') || error.message?.includes('overloaded')) {
      return NextResponse.json(
        { error: 'El servicio de Gemini está temporalmente sobrecargado. Intenta de nuevo en unos segundos.' },
        { status: 503 }
      );
    }
    
    if (error.message?.includes('429') || error.message?.includes('quota')) {
      return NextResponse.json(
        { error: 'Límite de cuota alcanzado. Espera un momento antes de intentar de nuevo.' },
        { status: 429 }
      );
    }
    
    return NextResponse.json(
      { 
        error: 'Error al analizar la canción', 
        details: error.message || 'Error desconocido' 
      },
      { status: 500 }
    );
  }
}

/**
 * Procesa el análisis de forma síncrona (espera el resultado)
 */
async function procesarAnalisisSync(hash: string, file: File, arrayBuffer: ArrayBuffer) {
  await marcarJobEnProceso(hash);
  
  try {
    const resultado = await realizarAnalisisCompleto(hash, file, arrayBuffer);
    await marcarJobCompletado(hash, { success: true });
    return resultado;
  } catch (error: any) {
    await marcarJobFallido(hash, error.message);
    throw error;
  }
}

/**
 * Procesa el análisis de forma asíncrona (sin bloquear)
 */
async function procesarAnalisisAsync(hash: string, file: File, arrayBuffer: ArrayBuffer) {
  await marcarJobEnProceso(hash);
  
  try {
    await realizarAnalisisCompleto(hash, file, arrayBuffer);
    await marcarJobCompletado(hash, { success: true });
  } catch (error: any) {
    await marcarJobFallido(hash, error.message);
    throw error;
  }
}

/**
 * Lógica principal de análisis (usada tanto en modo sync como async)
 */
async function realizarAnalisisCompleto(hash: string, file: File, arrayBuffer: ArrayBuffer) {
  // 1. Extraer metadatos (10%)
  await actualizarProgresoJob(hash, 10, 'Extrayendo metadatos...');
  const buffer = Buffer.from(arrayBuffer);
  const metadata = await musicMetadata.parseBuffer(buffer);
  const { common, format } = metadata;

  const duracionMs = Math.round((format.duration || 180) * 1000);
  const titulo = common.title || file.name.replace(/\.[^/.]+$/, '');
  const artista = common.artist || 'Artista Desconocido';

  // 2 y 3 EN PARALELO: Análisis técnico + Subida a Gemini (40%)
  await actualizarProgresoJob(hash, 20, 'Analizando audio y subiendo a Gemini en paralelo...');
  console.log('⚡ Ejecutando análisis técnico y subida a Gemini EN PARALELO...');
  
  const [analisisTecnico, myfile] = await Promise.all([
    // Análisis técnico con Essentia
    (async () => {
      console.log('🎵 [Paralelo 1/2] Analizando con Essentia.js...');
      const resultado = await analizarAudioCompleto(buffer);
      console.log(`✅ Análisis técnico completado: BPM ${resultado.bpm}, Tonalidad ${resultado.tonalidad_camelot}`);
      return resultado;
    })(),
    
    // Subida a Gemini
    (async () => {
      console.log('📤 [Paralelo 2/2] Subiendo a Gemini...');
      const file_upload = await executeWithRetries(
        async () => {
          return await ai.files.upload({
            file: new Blob([arrayBuffer], { type: file.type }),
            config: { 
              mimeType: file.type === 'audio/mpeg' ? 'audio/mp3' : file.type,
              displayName: file.name 
            },
          });
        },
        {
          maxAttempts: 3,
          initialDelayMs: 2000,
          backoffFactor: 2,
          label: 'Subida de archivo'
        }
      );
      console.log(`✅ Archivo subido a Gemini: ${file_upload.name}`);
      return file_upload;
    })()
  ]);

  // 4. Análisis completo con Gemini en UNA SOLA petición (80%)
  await actualizarProgresoJob(hash, 50, 'Analizando con Gemini (transcripción + análisis)...');
  console.log('🚀 Ejecutando análisis completo en UNA petición a Gemini...');
  
  const fileUriForGemini = (myfile as any)?.file?.uri || (myfile as any)?.uri || '';
  const fileMimeTypeForGemini = (myfile as any)?.file?.mimeType || (myfile as any)?.mimeType || (file.type === 'audio/mpeg' ? 'audio/mp3' : file.type);

  if (!fileUriForGemini) {
    console.warn('⚠️ Gemini upload no devolvió uri; se usará el archivo en memoria.');
  }

  const { transcripcion, analisis, tiempos } = await analizarConGeminiOptimizado({
    fileUri: fileUriForGemini,
    fileMimeType: fileMimeTypeForGemini,
    fileBuffer: fileUriForGemini ? undefined : arrayBuffer,
    analisisTecnico: {
      bpm: analisisTecnico.bpm,
      compas: analisisTecnico.compas || { numerador: 4, denominador: 4 },
      energia: analisisTecnico.energia,
      bailabilidad: analisisTecnico.bailabilidad,
      animo_general: analisisTecnico.animo_general,
      tonalidad_camelot: analisisTecnico.tonalidad_camelot,
      duracion_ms: duracionMs,
      downbeats_ts_ms: analisisTecnico.downbeats_ts_ms,
      frases_ts_ms: analisisTecnico.frases_ts_ms
    }
  });

  console.log(`⏱️ Tiempo total de Gemini: ${(tiempos.total_ms/1000).toFixed(1)}s (transcripción + análisis en una sola petición)`);

  // 5. Guardar en BD (95%)
  await actualizarProgresoJob(hash, 95, 'Guardando en base de datos...');
  console.log('💾 Guardando en base de datos...');
  
  // Convertir formato de transcripción para compatibilidad con BD
  const letras_ts = transcripcion.palabras.map(p => ({
    palabra: p.palabra,
    inicio_ms: p.tiempo_ms,
    fin_ms: p.tiempo_ms + 500 // Aproximado
  }));

  // Convertir formato de estructura - mapear nombres de secciones
  const mapearSeccion = (seccion: string): 'intro' | 'verso' | 'estribillo' | 'puente' | 'solo_instrumental' | 'outro' | 'silencio' | 'subidon_build_up' => {
    const mapa: Record<string, 'intro' | 'verso' | 'estribillo' | 'puente' | 'solo_instrumental' | 'outro' | 'silencio' | 'subidon_build_up'> = {
      'intro': 'intro',
      'verso': 'verso',
      'estribillo': 'estribillo',
      'puente': 'puente',
      'instrumental': 'solo_instrumental',
      'outro': 'outro',
      'build_up': 'subidon_build_up'
    };
    return mapa[seccion] || 'verso';
  };

  const estructura_ts = analisis.estructura.map(e => ({
    tipo_seccion: mapearSeccion(e.seccion),
    inicio_ms: e.inicio_ms,
    fin_ms: e.fin_ms
  }));

  // Convertir eventos DJ al formato esperado
  const eventos_clave_dj = analisis.eventos_dj.map(e => {
    const mapaTipoEvento: Record<string, 'caida_de_bajo' | 'acapella_break' | 'cambio_ritmico_notable' | 'melodia_iconica'> = {
      'drop': 'caida_de_bajo',
      'break': 'acapella_break',
      'build_up': 'cambio_ritmico_notable',
      'cambio_ritmo': 'cambio_ritmico_notable',
      'hook': 'melodia_iconica'
    };
    return {
      evento: mapaTipoEvento[e.tipo] || 'cambio_ritmico_notable',
      inicio_ms: e.tiempo_ms,
      fin_ms: e.tiempo_ms + 4000 // Aproximado: 4 segundos de duración
    };
  });

  await guardarAnalisisEnDB({
    hash,
    titulo,
    artista,
    analisis: analisisTecnico,
    gemini: {
      letras_ts,
      estructura_ts,
      analisis_contenido: {
        analisis_lirico_tematico: {
          tema_principal: analisis.tema.resumen,
          palabras_clave_semanticas: analisis.tema.palabras_clave,
          evolucion_emocional: analisis.tema.emocion
        },
        eventos_clave_dj
      }
    }
  });

  // 7. Obtener resultado final
  const resultado = await sql`
    SELECT * FROM canciones_analizadas WHERE hash_archivo = ${hash}
  `;

  console.log('✅ Análisis completado y guardado');
  return resultado[0];
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
