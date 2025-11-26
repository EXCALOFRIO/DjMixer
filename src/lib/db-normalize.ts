import type { CancionAnalizada } from './db';

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

export function normalizeCancionFromDB(row: any): CancionAnalizada {
  return {
    ...row,
    tonalidad_compatible: parseJson(row.tonalidad_compatible, [] as string[]),
    compas: parseJson(row.compas, { numerador: 4, denominador: 4 }),
    beats_ts_ms: parseJson(row.beats_ts_ms, [] as number[]),
    downbeats_ts_ms: parseJson(row.downbeats_ts_ms, [] as number[]),
    frases_ts_ms: parseJson(row.frases_ts_ms, [] as number[]),
    vocales_clave: parseJson(row.vocales_clave, []),
    loops_transicion: parseJson(row.loops_transicion, []),
    estructura_ts: parseJson(row.estructura_ts, []),
    huecos_analizados: parseJson(row.huecos_analizados, []),
  };
}
