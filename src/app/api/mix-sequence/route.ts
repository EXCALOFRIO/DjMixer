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
    // IMPORTANTE: Cada track necesita saber:
    // - startPointMs: donde ESTA canción empieza a sonar (entry point de la transición anterior)
    // - exitPointMs: donde ESTA canción termina (exit point de la transición a la siguiente)
    // - nextEntryPointMs: donde la SIGUIENTE canción empezará (para el crossfade)
    return NextResponse.json({
      session: {
        tracks: session.tracks.map((st, index) => {
          const nextTrack = session.tracks[index + 1];
          
          // startPointMs: donde empieza ESTA canción
          // - Para la primera: 0 o el bestEntryPoint más alto
          // - Para las demás: el entryPoint de la transición que nos trajo aquí
          let startPointMs = 0;
          if (st.transition) {
            // Esta canción empieza donde la transición anterior dijo
            startPointMs = st.transition.entryPoint.pointMs;
          }
          
          // exitPointMs: donde termina ESTA canción
          // - Si hay transición a la siguiente: el exitPoint de esa transición
          // - Si no: fin de la canción
          let exitPointMs = st.track.duracion_ms;
          let nextEntryPointMs = 0;
          let transitionType = 'CUT';
          let transitionDescription = '';
          let transitionScore = 0;
          
          if (nextTrack?.transition) {
            // La transición del SIGUIENTE track contiene:
            // - exitPoint: donde ESTA canción sale
            // - entryPoint: donde la SIGUIENTE canción entra
            exitPointMs = nextTrack.transition.exitPoint.pointMs;
            nextEntryPointMs = nextTrack.transition.entryPoint.pointMs;
            transitionType = nextTrack.transition.type;
            transitionDescription = nextTrack.transition.description;
            transitionScore = nextTrack.transition.score;
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
            transition: {
              type: transitionType,
              startPointMs,     // Donde ESTA canción empieza
              exitPointMs,      // Donde ESTA canción sale
              entryPointMs: nextEntryPointMs, // Donde la SIGUIENTE canción entra
              score: transitionScore,
              description: transitionDescription,
            },
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
