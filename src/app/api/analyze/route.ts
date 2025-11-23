// ============================================================================
// ENDPOINT DE ANÁLISIS ESSENTIA (INDIVIDUAL POR CANCIÓN)
// ============================================================================
// GET /api/analyze?hash=xxx → Obtiene análisis ya calculado
// POST /api/analyze → Analiza UNA canción con Essentia y guarda en DB
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { analizarAudioCompleto } from '@/lib/audio-analyzer-unified';
import { obtenerCancionPorHash, guardarAnalisisEnDB } from '@/lib/db-persistence';
import { 
  crearJobAnalisis, 
  marcarJobEnProceso, 
  actualizarProgresoJob, 
  marcarJobCompletado, 
  marcarJobFallido 
} from '@/lib/analysis-jobs';
import { createHash } from 'crypto';

function calcularHashBuffer(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const hash = searchParams.get('hash');

    if (!hash) {
      return NextResponse.json(
        { error: 'Se requiere el parámetro hash' },
        { status: 400 }
      );
    }

    const cancion = await obtenerCancionPorHash(hash);

    if (!cancion) {
      return NextResponse.json(
        { error: 'Canción no encontrada' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      cancion
    });

  } catch (error: any) {
    console.error('❌ Error al obtener análisis:', error);
    return NextResponse.json(
      { error: error.message || 'Error al obtener análisis' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  let jobId: string | null = null;
  
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No se proporcionó archivo' },
        { status: 400 }
      );
    }

    console.log(`\n🎵 ANALIZANDO: ${file.name}`);

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const hash = calcularHashBuffer(buffer);

    // Crear job de análisis
    jobId = await crearJobAnalisis(hash);
    console.log(`   📝 Job creado: ${jobId}`);

    const existente = await obtenerCancionPorHash(hash);
    if (existente) {
      console.log(`   💾 Ya existe en caché\n`);
      await marcarJobCompletado(jobId, { fromCache: true });
      return NextResponse.json({
        success: true,
        fromCache: true,
        hash,
        jobId,
        cancion: existente
      });
    }

    // Marcar como en proceso
    await marcarJobEnProceso(jobId);
    await actualizarProgresoJob(jobId, 10, 'Extrayendo audio...');

    const inicioAnalisis = Date.now();
    
    await actualizarProgresoJob(jobId, 30, 'Analizando con Essentia...');
    // ⚡ MODO ULTRA RÁPIDO: Deshabilitar análisis lentos no críticos
    const analisisEssentia = await analizarAudioCompleto(buffer, {
      normalize: { targetLUFS: -14 },
      disable: {
        djCues: true,     // Los cue points se calculan después si se necesitan
        vocal: false      // VAD es necesario pero optimizado
      },
      fast: true          // NUEVO: Modo rápido (omite MFCC y análisis espectrales detallados)
    });
    
    const tiempoAnalisis = ((Date.now() - inicioAnalisis) / 1000).toFixed(2);

    console.log(`   ✅ Essentia: ${tiempoAnalisis}s`);
    console.log(`      BPM: ${analisisEssentia.bpm.toFixed(1)} | ${analisisEssentia.tonalidad_camelot}`);

    const nombreSinExt = file.name.replace(/\.[^/.]+$/, '');
    let titulo = nombreSinExt;
    let artista = 'Desconocido';

    if (nombreSinExt.includes(' - ')) {
      const [art, tit] = nombreSinExt.split(' - ').map(s => s.trim());
      artista = art;
      titulo = tit;
    }

    await actualizarProgresoJob(jobId, 70, 'Guardando en base de datos...');
    const idDB = await guardarAnalisisEnDB({
      hash,
      titulo,
      artista,
      analisis: analisisEssentia
    });

    console.log(`   💾 Guardado en DB (ID: ${idDB})\n`);

    // Marcar progreso al 80% - Essentia completado, pendiente enriquecimiento Gemini
    await actualizarProgresoJob(jobId, 80, 'Análisis Essentia completado. Pendiente: enriquecimiento Gemini');

    // NO marcar como completado aquí - lo hará /api/enrich-gemini al 100%
    // await marcarJobCompletado(jobId, { ... });

    // Devolver TODO el análisis completo de Essentia sin filtrar
    return NextResponse.json({
      success: true,
      fromCache: false,
      hash,
      idDB,
      jobId,
      // Metadata adicional
      metadata: {
        id: idDB,
        hash_archivo: hash,
        titulo,
        artista
      },
      // ANÁLISIS COMPLETO DE ESSENTIA (TODOS LOS CAMPOS)
      analisis: analisisEssentia
    });

  } catch (error: any) {
    console.error('❌ Error en análisis:', error);
    
    if (jobId) {
      await marcarJobFallido(jobId, error.message || 'Error desconocido');
    }
    
    return NextResponse.json(
      { error: error.message || 'Error en análisis', jobId },
      { status: 500 }
    );
  }
}

export const maxDuration = 300;
