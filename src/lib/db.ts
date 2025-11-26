import { neon } from '@neondatabase/serverless';

// Función para obtener el cliente SQL (solo en servidor)
function getSqlClient() {
  if (typeof window !== 'undefined') {
    throw new Error('La base de datos solo puede ser accedida desde el servidor');
  }

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL no está definida en las variables de entorno');
  }

  return neon(process.env.DATABASE_URL);
}

export const sql = typeof window === 'undefined' ? getSqlClient() : null as any;

export type HuecoInstrumental = {
  inicio: string;
  fin: string;
  tipo: 'instrumental_puro' | 'voz_principal_residuo';
};

export type BloqueVocal = {
  tipo: 'bloque_verso' | 'bloque_coro' | 'adlib';
  inicio: string;
  fin: string;
};

export type LoopTransicion = {
  texto: string;
  inicio: string;
  fin: string;
  score: number; // 1-10, idoneidad para loop
};

export type CancionAnalizada = {
  id: string;
  hash_archivo: string;
  titulo: string;
  duracion_ms: number;
  bpm: number | null;
  tonalidad_camelot: string | null;
  tonalidad_compatible: string[] | null;
  bailabilidad: number | null;
  compas: { numerador: number; denominador: number } | null;
  downbeats_ts_ms: number[] | null;
  beats_ts_ms: number[] | null;
  frases_ts_ms: number[] | null;
  vocales_clave: BloqueVocal[] | null;
  loops_transicion: LoopTransicion[] | null;
  estructura_ts: EstructuraMusical[] | null;
  huecos_analizados: HuecoInstrumental[] | null;
  fecha_procesado: Date;
};

export type EstructuraMusical = {
  tipo_seccion: 'intro' | 'verso' | 'estribillo' | 'puente' | 'solo_instrumental' | 'outro' | 'silencio' | 'subidon_build_up';
  inicio: string;
  fin: string;
};
