import { NextRequest, NextResponse } from 'next/server';
import * as musicMetadata from 'music-metadata';
import { sql } from '@/lib/db';
import { normalizeCancionRow } from '@/lib/db-normalize';

// Calcular hash SHA-256
async function calcularHashArchivo(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Endpoint rápido para extraer solo metadatos básicos (sin análisis completo)
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

    const resultados = await Promise.all(
      files.map(async (file) => {
        try {
          // 1. Calcular hash
          const arrayBuffer = await file.arrayBuffer();
          const hash = await calcularHashArchivo(arrayBuffer);

          // 2. Verificar si ya existe en BD
          const existente = await sql`
            SELECT *
            FROM canciones_analizadas 
            WHERE hash_archivo = ${hash}
          `;

          if (existente.length > 0) {
            const cancion = normalizeCancionRow(existente[0] as Record<string, unknown>);

            // Verificar si el análisis de Gemini está incompleto
            let geminiIncompleto = !cancion.analisis_contenido ||
              (cancion.analisis_contenido as any).analisis_lirico_tematico?.tema_principal === 'Pendiente';

            // Verificar también la tabla de jobs
            if (!geminiIncompleto) {
              const ultimoJob = await import('@/lib/analysis-jobs').then(m => m.obtenerUltimoJobPorHash(hash));
              if (ultimoJob && ultimoJob.status !== 'completed') {
                geminiIncompleto = true;
              }
            }

            return {
              hash,
              analizado: true,
              geminiPending: geminiIncompleto,
              ...cancion,
            };
          }

          // 3. Extraer solo metadatos básicos (rápido)
          const buffer = Buffer.from(arrayBuffer);
          const metadata = await musicMetadata.parseBuffer(buffer);
          const { common, format } = metadata;

          const duracionMs = Math.round((format.duration || 180) * 1000);
          const titulo = common.title || file.name.replace(/\.[^/.]+$/, '');
          const artista = common.artist || 'Artista Desconocido';

          return {
            hash,
            titulo,
            artista,
            duracion_ms: duracionMs,
            analizado: false
          };
        } catch (error: any) {
          console.error(`Error procesando ${file.name}:`, error);
          return {
            hash: '',
            titulo: file.name,
            artista: 'Error',
            duracion_ms: 0,
            analizado: false,
            error: error.message
          };
        }
      })
    );

    return NextResponse.json({ canciones: resultados });

  } catch (error: any) {
    console.error('❌ Error en API metadata:', error);
    return NextResponse.json(
      {
        error: 'Error al extraer metadatos',
        details: error.message || 'Error desconocido'
      },
      { status: 500 }
    );
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
