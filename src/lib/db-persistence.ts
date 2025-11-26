import { sql, enriquecerCancionConDatosDerivados } from './db';
import { AnalisisCompleto } from './audio-analyzer-unified';
import type { CancionAnalizada, LoopTransicion, TimelineSegment } from './db';

/**
 * Verifica si una canción ya existe en la base de datos por su hash
 */
export async function existeCancionPorHash(hash: string): Promise<boolean> {
  if (!sql) throw new Error('SQL client no disponible');

  const resultado = await sql`
    SELECT 1 FROM canciones_analizadas 
    WHERE hash_archivo = ${hash} 
    LIMIT 1
  `;

  return resultado.length > 0;
}

/**
 * Obtiene una canción completa por su hash
 * NOTA: Enriquece automáticamente con datos derivados del timeline
 */
export async function obtenerCancionPorHash(hash: string): Promise<CancionAnalizada | null> {
  if (!sql) throw new Error('SQL client no disponible');

  const resultado = await sql`
    SELECT * FROM canciones_analizadas 
    WHERE hash_archivo = ${hash} 
    LIMIT 1
  `;

  if (resultado.length === 0) return null;
  
  // Enriquecer con datos derivados del timeline para compatibilidad
  return enriquecerCancionConDatosDerivados(resultado[0] as CancionAnalizada);
}

/**
 * Guarda el análisis completo en la base de datos
 * SIMPLIFICADO: Solo guarda timeline y loops_transicion de Gemini
 */
export async function guardarAnalisisEnDB(params: {
  hash: string;
  titulo: string;
  artista?: string; // Opcional, ya no se usa en el esquema optimizado
  analisis: AnalisisCompleto;
  gemini?: {
    timeline?: TimelineSegment[];
    loops_transicion?: LoopTransicion[];
  };
}): Promise<string> {
  if (!sql) throw new Error('SQL client no disponible');

  const { hash, titulo, analisis, gemini } = params;

  // ===================================================================
  // SERIALIZAR CAMPOS BÁSICOS - ESQUEMA OPTIMIZADO
  // ===================================================================
  const tonalidad_compatible = JSON.stringify(analisis.tonalidad_compatible || []);
  const compas = JSON.stringify(analisis.compas || { numerador: 4, denominador: 4 });
  const beats_ts_ms = JSON.stringify(analisis.beats_ts_ms || []);
  const downbeats_ts_ms = JSON.stringify(analisis.downbeats_ts_ms || []);
  const frases_ts_ms = JSON.stringify(analisis.frases_ts_ms || []);

  // ===================================================================
  // SERIALIZAR GEMINI (SIMPLIFICADO - SOLO TIMELINE Y LOOPS)
  // ===================================================================
  const timeline = gemini?.timeline ? JSON.stringify(gemini.timeline) : JSON.stringify([]);
  const loops_transicion = gemini?.loops_transicion ? JSON.stringify(gemini.loops_transicion) : JSON.stringify([]);

  const resultado = await sql`
    INSERT INTO canciones_analizadas (
      hash_archivo, titulo, duracion_ms,
      bpm, tonalidad_camelot, tonalidad_compatible,
      bailabilidad, compas,
      beats_ts_ms, downbeats_ts_ms, frases_ts_ms,
      timeline, loops_transicion,
      fecha_procesado
    ) VALUES (
      ${hash}, ${titulo}, ${analisis.duracion_ms},
      ${analisis.bpm}, ${analisis.tonalidad_camelot}, ${tonalidad_compatible}::jsonb,
      ${analisis.bailabilidad}, ${compas}::jsonb,
      ${beats_ts_ms}::jsonb, ${downbeats_ts_ms}::jsonb, ${frases_ts_ms}::jsonb,
      ${timeline}::jsonb, ${loops_transicion}::jsonb,
      NOW()
    )
    ON CONFLICT (hash_archivo) 
    DO UPDATE SET
      titulo = EXCLUDED.titulo,
      duracion_ms = EXCLUDED.duracion_ms,
      bpm = EXCLUDED.bpm,
      tonalidad_camelot = EXCLUDED.tonalidad_camelot,
      tonalidad_compatible = EXCLUDED.tonalidad_compatible,
      bailabilidad = EXCLUDED.bailabilidad,
      compas = EXCLUDED.compas,
      beats_ts_ms = EXCLUDED.beats_ts_ms,
      downbeats_ts_ms = EXCLUDED.downbeats_ts_ms,
      frases_ts_ms = EXCLUDED.frases_ts_ms,
      timeline = COALESCE(EXCLUDED.timeline, canciones_analizadas.timeline),
      loops_transicion = COALESCE(EXCLUDED.loops_transicion, canciones_analizadas.loops_transicion),
      fecha_procesado = NOW()
    RETURNING id
  `;

  return resultado[0].id;
}

/**
 * Actualiza datos de Gemini para una canción existente
 * SIMPLIFICADO: Solo actualiza timeline y loops_transicion
 */
export async function actualizarDatosGemini(params: {
  hash: string;
  timeline?: TimelineSegment[];
  loops_transicion?: LoopTransicion[];
}): Promise<void> {
  if (!sql) throw new Error('SQL client no disponible');

  const { hash, timeline, loops_transicion } = params;

  const timeline_json = timeline ? JSON.stringify(timeline) : null;
  const loops_transicion_json = loops_transicion ? JSON.stringify(loops_transicion) : null;

  await sql`
    UPDATE canciones_analizadas 
    SET 
      timeline = COALESCE(${timeline_json}::jsonb, timeline),
      loops_transicion = COALESCE(${loops_transicion_json}::jsonb, loops_transicion)
    WHERE hash_archivo = ${hash}
  `;
}
