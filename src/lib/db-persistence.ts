import { sql } from './db';
import { AnalisisCompleto } from './audio-analyzer-unified';
import type { CancionAnalizada, BloqueVocal, LoopTransicion, EstructuraMusical, HuecoInstrumental } from './db';

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
 */
export async function obtenerCancionPorHash(hash: string): Promise<CancionAnalizada | null> {
  if (!sql) throw new Error('SQL client no disponible');

  const resultado = await sql`
    SELECT * FROM canciones_analizadas 
    WHERE hash_archivo = ${hash} 
    LIMIT 1
  `;

  return resultado.length > 0 ? resultado[0] as CancionAnalizada : null;
}

/**
 * Guarda el análisis completo en la base de datos
 */
export async function guardarAnalisisEnDB(params: {
  hash: string;
  titulo: string;
  artista?: string; // Opcional, ya no se usa en el esquema optimizado
  analisis: AnalisisCompleto;
  gemini?: {
    vocales_clave?: BloqueVocal[];
    loops_transicion?: LoopTransicion[];
    estructura_ts?: EstructuraMusical[];
    huecos_analizados?: HuecoInstrumental[];
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
  // SERIALIZAR GEMINI
  // ===================================================================
  const vocales_clave = gemini?.vocales_clave ? JSON.stringify(gemini.vocales_clave) : JSON.stringify([]);
  const loops_transicion = gemini?.loops_transicion ? JSON.stringify(gemini.loops_transicion) : JSON.stringify([]);
  const estructura_ts = gemini?.estructura_ts ? JSON.stringify(gemini.estructura_ts) : JSON.stringify([]);

  const huecos_analizados = gemini?.huecos_analizados ? JSON.stringify(gemini.huecos_analizados) : JSON.stringify([]);

  const resultado = await sql`
    INSERT INTO canciones_analizadas (
      hash_archivo, titulo, duracion_ms,
      bpm, tonalidad_camelot, tonalidad_compatible,
      bailabilidad, compas,
      beats_ts_ms, downbeats_ts_ms, frases_ts_ms,
      vocales_clave, loops_transicion, estructura_ts,
      huecos_analizados,
      fecha_procesado
    ) VALUES (
      ${hash}, ${titulo}, ${analisis.duracion_ms},
      ${analisis.bpm}, ${analisis.tonalidad_camelot}, ${tonalidad_compatible}::jsonb,
      ${analisis.bailabilidad}, ${compas}::jsonb,
      ${beats_ts_ms}::jsonb, ${downbeats_ts_ms}::jsonb, ${frases_ts_ms}::jsonb,
      ${vocales_clave}::jsonb, ${loops_transicion}::jsonb, ${estructura_ts}::jsonb,
      ${huecos_analizados}::jsonb,
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
      vocales_clave = COALESCE(EXCLUDED.vocales_clave, canciones_analizadas.vocales_clave),
      loops_transicion = COALESCE(EXCLUDED.loops_transicion, canciones_analizadas.loops_transicion),
      estructura_ts = COALESCE(EXCLUDED.estructura_ts, canciones_analizadas.estructura_ts),
      huecos_analizados = COALESCE(EXCLUDED.huecos_analizados, canciones_analizadas.huecos_analizados),
      fecha_procesado = NOW()
    RETURNING id
  `;

  return resultado[0].id;
}

export async function actualizarDatosGemini(params: {
  hash: string;
  vocales_clave?: BloqueVocal[];
  loops_transicion?: LoopTransicion[];
  estructura_ts?: EstructuraMusical[];
  huecos_analizados?: HuecoInstrumental[];
}): Promise<void> {
  if (!sql) throw new Error('SQL client no disponible');

  const {
    hash,
    vocales_clave,
    loops_transicion,
    estructura_ts,
    huecos_analizados,
  } = params;

  const vocales_clave_json = vocales_clave ? JSON.stringify(vocales_clave) : null;
  const loops_transicion_json = loops_transicion ? JSON.stringify(loops_transicion) : null;
  const estructura_ts_json = estructura_ts ? JSON.stringify(estructura_ts) : null;
  const huecos_analizados_json = huecos_analizados ? JSON.stringify(huecos_analizados) : null;

  await sql`
    UPDATE canciones_analizadas 
    SET 
      vocales_clave = COALESCE(${vocales_clave_json}::jsonb, vocales_clave),
      loops_transicion = COALESCE(${loops_transicion_json}::jsonb, loops_transicion),
      estructura_ts = COALESCE(${estructura_ts_json}::jsonb, estructura_ts),
      huecos_analizados = COALESCE(${huecos_analizados_json}::jsonb, huecos_analizados)
    WHERE hash_archivo = ${hash}
  `;
}
