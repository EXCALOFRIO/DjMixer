import { NextRequest, NextResponse } from 'next/server';
import { obtenerEstadoJob } from '@/lib/analysis-jobs';
import { obtenerCancionPorHash } from '@/lib/db-persistence';

/**
 * GET /api/analyze/status?jobId=<hash>
 * Consulta el estado de un análisis en progreso
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');

    if (!jobId) {
      return NextResponse.json(
        { error: 'Se requiere el parámetro jobId' },
        { status: 400 }
      );
    }

    // Consultar estado del job
    const job = await obtenerEstadoJob(jobId);

    if (!job) {
      return NextResponse.json(
        { error: 'Job no encontrado' },
        { status: 404 }
      );
    }

    // Si el job está completado, devolver el resultado de la BD
    if (job.status === 'completed') {
      const cancion = await obtenerCancionPorHash(job.hash);
      
      if (cancion) {
        return NextResponse.json({
          status: 'completed',
          progress: 100,
          result: cancion
        });
      }
    }

    // Devolver estado actual
    return NextResponse.json({
      status: job.status,
      progress: job.progress,
      current_step: job.current_step,
      error_message: job.error_message,
      created_at: job.created_at,
      updated_at: job.updated_at
    });

  } catch (error: any) {
    console.error('❌ Error al consultar estado del job:', error);
    return NextResponse.json(
      { 
        error: 'Error al consultar el estado', 
        details: error.message 
      },
      { status: 500 }
    );
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
