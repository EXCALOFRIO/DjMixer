import { NextRequest, NextResponse } from 'next/server';
import * as musicMetadata from 'music-metadata';
import { sql } from '@/lib/db';

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
            SELECT id, hash_archivo, titulo, artista, duracion_ms, bpm, 
                   tonalidad_camelot, energia, bailabilidad, animo_general
            FROM canciones_analizadas 
            WHERE hash_archivo = ${hash}
          `;

          if (existente.length > 0) {
            return {
              hash,
              titulo: existente[0].titulo,
              artista: existente[0].artista,
              duracion_ms: existente[0].duracion_ms,
              bpm: existente[0].bpm,
              tonalidad_camelot: existente[0].tonalidad_camelot,
              energia: existente[0].energia,
              bailabilidad: existente[0].bailabilidad,
              animo_general: existente[0].animo_general,
              analizado: true,
              id: existente[0].id
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
