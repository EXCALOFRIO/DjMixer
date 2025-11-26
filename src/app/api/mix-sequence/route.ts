import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { normalizeCancionFromDB } from '@/lib/db-normalize';
import { buildMixPlan } from '@/lib/mix-planner';
import { findOptimalSequence } from '@/lib/mix-sequencer';
import type { CancionAnalizada } from '@/lib/db';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      hashes,
      sessionLength,
      startTrackHash
    }: {
      hashes: string[];
      sessionLength?: number;
      startTrackHash?: string;
    } = body;

    if (!Array.isArray(hashes) || hashes.length === 0) {
      return NextResponse.json(
        { error: 'Se requiere un array de hashes' },
        { status: 400 }
      );
    }

    // Obtener canciones de la base de datos
    const rows = await sql`
      SELECT * FROM canciones_analizadas 
      WHERE hash_archivo = ANY(${hashes})
    `;

    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'No se encontraron canciones' },
        { status: 404 }
      );
    }

    // Normalizar datos de BD
    const tracks = rows.map(normalizeCancionFromDB);

    // 1. Generar plan de mix (puntos de entrada/salida para cada canción)
    console.log('📊 Generando plan de mix...');
    const mixPlanArray = buildMixPlan(tracks);

    // Convertir a Map para acceso rápido por ID
    const mixPlans = new Map(mixPlanArray.map(entry => [entry.trackId, entry]));

    // 2. Determinar longitud de sesión
    const targetLength = sessionLength && sessionLength > 0 && sessionLength <= tracks.length
      ? sessionLength
      : Math.min(tracks.length, 10); // Por defecto, máximo 10 canciones

    // 3. Determinar track inicial
    let startTrackId: string | undefined;
    if (startTrackHash) {
      const startTrack = tracks.find((t: CancionAnalizada) => t.hash_archivo === startTrackHash);
      startTrackId = startTrack?.id;
    }

    // 4. Ejecutar algoritmo A* para encontrar la mejor secuencia
    console.log(`🎯 Buscando secuencia óptima de ${targetLength} canciones...`);
    const session = findOptimalSequence(tracks, mixPlans, targetLength, startTrackId);

    // Verificar si la sesión tiene warnings o está vacía
    if (session.tracks.length === 0) {
      return NextResponse.json(
        {
          error: 'No se pudo generar ninguna secuencia',
          warnings: session.warnings || []
        },
        { status: 500 }
      );
    }

    console.log(`✅ Secuencia generada con ${session.tracks.length} tracks, score: ${session.totalScore.toFixed(2)}`);
    if (session.warnings && session.warnings.length > 0) {
      console.warn('⚠️ Warnings:', session.warnings);
    }

    // 5. Retornar resultado
    return NextResponse.json({
      session: {
        tracks: session.tracks.map((st, index) => {
          // For the first track, we need to extract the exit point from the NEXT track's transition
          // because the transition object represents "transition FROM previous TO current"
          let transition = null;

          if (st.transition) {
            // Normal case: track has a transition (from previous track)
            transition = {
              type: st.transition.type,
              exitPointMs: st.transition.exitPoint.pointMs,
              entryPointMs: st.transition.entryPoint.pointMs,
              score: st.transition.score,
              description: st.transition.description,
            };
          } else if (index === 0 && session.tracks.length > 1 && session.tracks[1].transition) {
            // Special case: first track doesn't have a transition object,
            // but we can extract the exit point from the second track's transition
            const nextTrackTransition = session.tracks[1].transition!;
            transition = {
              type: nextTrackTransition.type,
              exitPointMs: nextTrackTransition.exitPoint.pointMs,
              entryPointMs: 0, // First track starts from beginning
              score: nextTrackTransition.score,
              description: `START ➔ ${nextTrackTransition.description.split('➔')[1]?.trim() || 'NEXT'}`,
            };
          }

          return {
            position: st.position,
            track: {
              id: st.track.id,
              hash: st.track.hash_archivo,
              title: st.track.titulo,
              bpm: st.track.bpm,
              key: st.track.tonalidad_camelot,
              durationMs: st.track.duracion_ms,
            },
            transition,
            transitionScore: st.transitionScore,
          };
        }),
        totalScore: session.totalScore,
        avgTransitionScore: session.avgTransitionScore,
        warnings: session.warnings || [],
      },
    });

  } catch (error) {
    console.error('❌ Error en /api/mix-sequence:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor', details: String(error) },
      { status: 500 }
    );
  }
}
