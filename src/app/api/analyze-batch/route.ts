// ============================================================================
// ENDPOINT DE ANÁLISIS MASIVO V2 - SISTEMA DE 2 FASES CON RATE LIMITING
// ============================================================================
// FASE 1: Análisis Essentia instantáneo (guarda 55 campos en DB)
// FASE 2: Análisis Gemini diferido (rate limited, 50 peticiones/min)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { existeCancionPorHash, obtenerCancionPorHash } from '@/lib/db-persistence';
import { analizarAudioCompleto } from '@/lib/audio-analyzer-unified';
import { guardarAnalisisEnDB } from '@/lib/db-persistence';
import { obtenerRateLimiter } from '@/lib/gemini-rate-limiter';
import { createHash } from 'crypto';

const rateLimiter = obtenerRateLimiter();

// Calcular hash SHA-256
function calcularHashBuffer(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

interface ResultadoProcesamiento {
  nombre: string;
  titulo: string;
  artista: string;
  bpm: number;
  tonalidad_camelot: string;
  bailabilidad: number;
  hash: string;
  fase: 'cache' | 'essentia' | 'error';
  geminiPendiente: boolean;
  error?: boolean;
  mensaje?: string;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: 'No se proporcionaron archivos' },
        { status: 400 }
      );
    }

    console.log(`\n🚀 IMPORTACIÓN MASIVA V2: ${files.length} archivos`);
    console.log(`   📊 Sistema de 2 fases activado`);
    console.log(`   🔑 API Keys disponibles: ${rateLimiter.obtenerEstadisticas().totalApiKeys}\n`);

    const resultados: ResultadoProcesamiento[] = [];
    const tareasGemini: Array<{ hash: string; buffer: Buffer; analisis: any }> = [];

    let cache = 0;
    let analizados = 0;
    let fallidos = 0;

    // ========================================================================
    // FASE 1: ANÁLISIS INSTANTÁNEO CON ESSENTIA (TODOS LOS ARCHIVOS)
    // ========================================================================

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      console.log(`[${i + 1}/${files.length}] 🎵 ${file.name}`);

      try {
        const buffer = await file.arrayBuffer();
        const fileBuffer = Buffer.from(buffer);
        const hash = calcularHashBuffer(fileBuffer);

        // 1. Verificar si ya existe en DB
        const existente = await obtenerCancionPorHash(hash);

        if (existente) {
          cache++;
          resultados.push({
            nombre: file.name,
            titulo: existente.titulo || file.name,
            artista: 'Desconocido',
            bpm: existente.bpm || 0,
            tonalidad_camelot: existente.tonalidad_camelot || '',
            bailabilidad: existente.bailabilidad || 0,
            hash,
            fase: 'cache',
            geminiPendiente: false
          });
        } else {
          // 2. Análisis Essentia (FASE 1)
          // OPTIMIZACIÓN: Desactivamos VAD, Spectral y Loudness detallado para acelerar.
          const analisis = await analizarAudioCompleto(fileBuffer, {
            disable: { vocal: true, spectral: true, loudness_detailed: true }
          });

          // 3. Guardar en DB
          await guardarAnalisisEnDB({
            hash,
            titulo: file.name.replace(/\.[^/.]+$/, ''),
            analisis
          });

          analizados++;

          resultados.push({
            nombre: file.name,
            titulo: file.name,
            artista: 'Desconocido',
            bpm: analisis.bpm,
            tonalidad_camelot: analisis.tonalidad_camelot,
            bailabilidad: analisis.bailabilidad,
            hash,
            fase: 'essentia',
            geminiPendiente: true
          });

          // 4. Encolar para Gemini (FASE 2)
          tareasGemini.push({
            hash,
            buffer: fileBuffer,
            analisis
          });
        }
      } catch (error: any) {
        console.error(`   ❌ Error:`, error.message);

        resultados.push({
          nombre: file.name,
          titulo: file.name.replace(/\.[^/.]+$/, ''),
          artista: 'Error',
          bpm: 0,
          tonalidad_camelot: '',
          bailabilidad: 0,
          hash: '',
          fase: 'error',
          geminiPendiente: false,
          error: true,
          mensaje: error.message
        });

        fallidos++;
      }
    }

    // ========================================================================
    // RESPUESTA INMEDIATA (Fase 1 completada)
    // ========================================================================

    console.log(`\n📊 FASE 1 COMPLETADA:`);
    console.log(`   ✅ Analizados: ${analizados}`);
    console.log(`   💾 Desde caché: ${cache}`);
    console.log(`   ❌ Fallidos: ${fallidos}`);
    console.log(`   ⏳ Pendientes Gemini: ${tareasGemini.length}\n`);

    // ========================================================================
    // FASE 2: GEMINI EN SEGUNDO PLANO (no bloqueante)
    // ========================================================================

    if (tareasGemini.length > 0) {
      console.log(`🔄 Iniciando Fase 2 (Gemini) en segundo plano...`);
      console.log(`   🔑 ${rateLimiter.obtenerEstadisticas().totalApiKeys} API keys disponibles`);
      console.log(`   ⚡ Rate limit: 50 peticiones/minuto total\n`);

      // Procesar en segundo plano (no await)
      procesarGeminiBackground(tareasGemini).catch(err => {
        console.error('❌ Error en procesamiento Gemini:', err);
      });
    }

    // Retornar inmediatamente
    return NextResponse.json({
      success: true,
      fase1Completada: true,
      geminiEnProceso: tareasGemini.length > 0,
      resumen: {
        total: files.length,
        cache,
        analizados,
        exitosos: analizados + cache,
        fallidos,
        geminiPendiente: tareasGemini.length
      },
      resultados,
      mensaje: tareasGemini.length > 0
        ? `${analizados} canciones listas. ${tareasGemini.length} análisis de Gemini en segundo plano.`
        : `${analizados} canciones completadas.`
    });

  } catch (error: any) {
    console.error('❌ Error en importación masiva:', error);
    return NextResponse.json(
      {
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}

/**
 * Procesa análisis de Gemini en segundo plano (rate limited automáticamente)
 */
async function procesarGeminiBackground(
  tareas: Array<{ hash: string; buffer: Buffer; analisis: any }>
) {
  console.log(`\n🤖 FASE 2 GEMINI: Procesando ${tareas.length} canciones en segundo plano`);

  const rateLimiter = obtenerRateLimiter();
  const promesas = tareas.map((tarea, index) =>
    procesarCancionConGemini(tarea, index + 1, tareas.length)
  );

  const resultados = await Promise.allSettled(promesas);

  const exitosos = resultados.filter(r => r.status === 'fulfilled').length;
  const fallidos = resultados.filter(r => r.status === 'rejected').length;

  console.log(`\n✅ FASE 2 COMPLETADA:`);
  console.log(`   ✅ Exitosos: ${exitosos}`);
  console.log(`   ❌ Fallidos: ${fallidos}`);
  console.log(`   📊 Estadísticas rate limiter:`, rateLimiter.obtenerEstadisticas());
}

/**
 * Procesa una canción individual con Gemini (con rate limiting)
 */
async function procesarCancionConGemini(
  tarea: { hash: string; buffer: Buffer; analisis: any },
  index: number,
  total: number
) {
  try {
    console.log(`[Gemini ${index}/${total}] 🤖 Hash: ${tarea.hash.substring(0, 8)}...`);

    const rateLimiter = obtenerRateLimiter();

    // El rate limiter gestiona automáticamente la cola y rotación
    const datosGemini = await rateLimiter.analizarConGemini(
      tarea.hash,
      '', // path no necesario, ya tenemos el buffer
      tarea.analisis,
      0 // prioridad normal
    );

    console.log(`   ✅ Análisis Gemini completado`);

    // Actualizar base de datos (solo timeline y loops)
    const { actualizarDatosGemini } = await import('@/lib/db-persistence');
    await actualizarDatosGemini({
      hash: tarea.hash,
      timeline: datosGemini.timeline,
      loops_transicion: datosGemini.loops_transicion,
    });

    console.log(`   💾 Datos Gemini guardados (timeline unificado)\n`);

  } catch (error: any) {
    console.error(`   ❌ Error Gemini:`, error.message);
    // No es crítico - la canción ya está en DB con Essentia
  }
}
