import type { CancionAnalizada, TimelineSegment } from './db';
import { derivarVocalesDeTimeline, derivarEstructuraDeTimeline, derivarHuecosDeTimeline } from './db';

function parseJson<T>(value: any, defaultValue: T): T {
  if (value === null || value === undefined) return defaultValue;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return defaultValue;
    }
  }
  return value as T;
}

/**
 * Normaliza una fila de BD a tipo CancionAnalizada
 * SIMPLIFICADO: Solo lee timeline y loops_transicion de Gemini
 * Los campos vocales_clave, estructura_ts y huecos_analizados se DERIVAN del timeline
 */
export function normalizeCancionFromDB(row: any): CancionAnalizada {
  // Parsear timeline primero
  const timeline = parseJson<TimelineSegment[]>(row.timeline, []);
  
  return {
    ...row,
    tonalidad_compatible: parseJson(row.tonalidad_compatible, [] as string[]),
    compas: parseJson(row.compas, { numerador: 4, denominador: 4 }),
    beats_ts_ms: parseJson(row.beats_ts_ms, [] as number[]),
    downbeats_ts_ms: parseJson(row.downbeats_ts_ms, [] as number[]),
    frases_ts_ms: parseJson(row.frases_ts_ms, [] as number[]),
    // Datos Gemini (solo 2 campos en BD)
    timeline: timeline,
    loops_transicion: parseJson(row.loops_transicion, []),
    // Datos DERIVADOS del timeline (no existen en BD)
    vocales_clave: derivarVocalesDeTimeline(timeline),
    estructura_ts: derivarEstructuraDeTimeline(timeline),
    huecos_analizados: derivarHuecosDeTimeline(timeline),
  };
}
