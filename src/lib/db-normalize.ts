import type { CancionAnalizada } from './db';

export function normalizeCancionRow(row: Record<string, unknown>): CancionAnalizada {
  const tonalidadCompatible = parseJson(row.tonalidad_compatible, [] as string[]);
  const compas = parseJson(row.compas, { numerador: 4, denominador: 4 } as CancionAnalizada['compas']);
  const beatsTs = parseJson(row.beats_ts_ms, [] as number[]);
  const downbeatsTs = parseJson(row.downbeats_ts_ms, [] as number[]);
  const frasesTs = parseJson(row.frases_ts_ms, [] as number[]);
  const letrasTs = parseJson(row.letras_ts, [] as CancionAnalizada['letras_ts']);
  const estructuraTs = parseJson(row.estructura_ts, [] as CancionAnalizada['estructura_ts']);
  const analisisContenido = parseJson(row.analisis_contenido, null as CancionAnalizada['analisis_contenido']);

  return {
    ...(row as CancionAnalizada),
    tonalidad_compatible: tonalidadCompatible,
    compas,
    beats_ts_ms: beatsTs,
    downbeats_ts_ms: downbeatsTs,
    frases_ts_ms: frasesTs,
    letras_ts: letrasTs,
    estructura_ts: estructuraTs,
    analisis_contenido: analisisContenido,
    fecha_procesado: row.fecha_procesado instanceof Date
      ? row.fecha_procesado
      : row.fecha_procesado
        ? new Date(String(row.fecha_procesado))
        : new Date(),
  };
}

export function parseJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) {
    return fallback;
  }

  if (typeof value === 'object') {
    return value as T;
  }

  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }

  return fallback;
}
