import { sql } from './db';
import { AnalisisCompleto } from './audio-analyzer-unified';
import type { CancionAnalizada, AnalisisContenido, TranscripcionPalabra, EstructuraMusical } from './db';

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
    letras_ts?: TranscripcionPalabra[];
    estructura_ts?: EstructuraMusical[];
    analisis_contenido?: AnalisisContenido;
    segmentos_voz?: Array<{ start_ms: number; end_ms: number }>;
    huecos_analizados?: Array<{
      inicio_ms: number;
      fin_ms: number;
      tipo: string;
      descripcion?: string;
      energia_relativa?: number;
    }>;
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
  const letras_ts = gemini?.letras_ts ? JSON.stringify(gemini.letras_ts) : JSON.stringify([]);
  const estructura_ts = gemini?.estructura_ts ? JSON.stringify(gemini.estructura_ts) : JSON.stringify([]);
  const analisis_contenido = gemini?.analisis_contenido ? JSON.stringify(gemini.analisis_contenido) : JSON.stringify({
    analisis_lirico_tematico: {
      tema_principal: '',
      palabras_clave_semanticas: [],
      evolucion_emocional: 'neutral'
    },
    eventos_clave_dj: []
  });
  
  // segmentos_voz ahora viene de Essentia (VAD se ejecuta en audio-analyzer-unified)
  const segmentos_voz = analisis.segmentos_voz ? JSON.stringify(analisis.segmentos_voz) : JSON.stringify([]);
  const huecos_analizados = gemini?.huecos_analizados ? JSON.stringify(gemini.huecos_analizados) : JSON.stringify([]);

  const resultado = await sql`
    INSERT INTO canciones_analizadas (
      hash_archivo, titulo, duracion_ms,
      bpm, tonalidad_camelot, tonalidad_compatible,
      energia, bailabilidad, animo_general, compas,
      beats_ts_ms, downbeats_ts_ms, frases_ts_ms,
      letras_ts, estructura_ts, analisis_contenido,
      segmentos_voz, huecos_analizados,
      fecha_procesado
    ) VALUES (
      ${hash}, ${titulo}, ${analisis.duracion_ms},
      ${analisis.bpm}, ${analisis.tonalidad_camelot}, ${tonalidad_compatible}::jsonb,
      ${analisis.energia}, ${analisis.bailabilidad}, ${analisis.animo_general}, ${compas}::jsonb,
      ${beats_ts_ms}::jsonb, ${downbeats_ts_ms}::jsonb, ${frases_ts_ms}::jsonb,
      ${letras_ts}::jsonb, ${estructura_ts}::jsonb, ${analisis_contenido}::jsonb,
      ${segmentos_voz}::jsonb, ${huecos_analizados}::jsonb,
      NOW()
    )
    ON CONFLICT (hash_archivo) 
    DO UPDATE SET
      titulo = EXCLUDED.titulo,
      duracion_ms = EXCLUDED.duracion_ms,
      bpm = EXCLUDED.bpm,
      tonalidad_camelot = EXCLUDED.tonalidad_camelot,
      tonalidad_compatible = EXCLUDED.tonalidad_compatible,
      energia = EXCLUDED.energia,
      bailabilidad = EXCLUDED.bailabilidad,
      animo_general = EXCLUDED.animo_general,
      compas = EXCLUDED.compas,
      beats_ts_ms = EXCLUDED.beats_ts_ms,
      downbeats_ts_ms = EXCLUDED.downbeats_ts_ms,
      frases_ts_ms = EXCLUDED.frases_ts_ms,
      letras_ts = COALESCE(EXCLUDED.letras_ts, canciones_analizadas.letras_ts),
      estructura_ts = COALESCE(EXCLUDED.estructura_ts, canciones_analizadas.estructura_ts),
      analisis_contenido = COALESCE(EXCLUDED.analisis_contenido, canciones_analizadas.analisis_contenido),
      segmentos_voz = COALESCE(EXCLUDED.segmentos_voz, canciones_analizadas.segmentos_voz),
      huecos_analizados = COALESCE(EXCLUDED.huecos_analizados, canciones_analizadas.huecos_analizados),
      fecha_procesado = NOW()
    RETURNING id
  `;

  return resultado[0].id;
}

export async function actualizarDatosGemini(params: {
  hash: string;
  letras_ts?: TranscripcionPalabra[];
  estructura_ts?: EstructuraMusical[];
  analisis_contenido?: AnalisisContenido;
  segmentos_voz?: Array<{ start_ms: number; end_ms: number }>;
  huecos_analizados?: Array<{
    inicio_ms: number;
    fin_ms: number;
    tipo: string;
    descripcion?: string;
    energia_relativa?: number;
    confianza?: number;
  }>;
}): Promise<void> {
  if (!sql) throw new Error('SQL client no disponible');
  
  const {
    hash,
    letras_ts,
    estructura_ts,
    analisis_contenido,
    segmentos_voz,
    huecos_analizados,
  } = params;

  const letras_ts_json = letras_ts ? JSON.stringify(letras_ts) : null;
  const estructura_ts_json = estructura_ts ? JSON.stringify(estructura_ts) : null;
  const analisis_contenido_json = analisis_contenido ? JSON.stringify(analisis_contenido) : null;
  const segmentos_voz_json = segmentos_voz ? JSON.stringify(segmentos_voz) : null;
  const huecos_analizados_json = huecos_analizados ? JSON.stringify(huecos_analizados) : null;

  await sql`
    UPDATE canciones_analizadas 
    SET 
      letras_ts = COALESCE(${letras_ts_json}::jsonb, letras_ts),
      estructura_ts = COALESCE(${estructura_ts_json}::jsonb, estructura_ts),
      analisis_contenido = COALESCE(${analisis_contenido_json}::jsonb, analisis_contenido),
      segmentos_voz = COALESCE(${segmentos_voz_json}::jsonb, segmentos_voz),
      huecos_analizados = COALESCE(${huecos_analizados_json}::jsonb, huecos_analizados)
    WHERE hash_archivo = ${hash}
  `;
}
