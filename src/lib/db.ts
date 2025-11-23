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

export type CancionAnalizada = {
  id: string;
  hash_archivo: string;
  titulo: string;
  duracion_ms: number;
  bpm: number | null;
  tonalidad_camelot: string | null;
  tonalidad_compatible: string[] | null;
  energia: number | null;
  bailabilidad: number | null;
  animo_general: string | null;
  compas: { numerador: number; denominador: number } | null;
  downbeats_ts_ms: number[] | null;
  beats_ts_ms: number[] | null;
  frases_ts_ms: number[] | null;
  cue_points: CuePoint[] | null;
  mix_in_point: number | null;
  mix_out_point: number | null;
  letras_ts: TranscripcionPalabra[] | null;
  estructura_ts: EstructuraMusical[] | null;
  analisis_contenido: AnalisisContenido | null;
  presencia_vocal_ts: PresenciaVocal[] | null;
  analisis_espectral: any | null;
  fecha_procesado: Date;
};

export type CuePoint = {
  tiempo_ms: number;
  tipo: 'intro' | 'verso' | 'estribillo' | 'drop' | 'break' | 'outro';
  descripcion: string;
  color?: string;
};

export type PresenciaVocal = {
  tiempo_ms: number;
  confianza: number; // 0-1, donde 1 = voz muy presente
  tipo: 'vocal' | 'instrumental' | 'mixto';
};

export type TranscripcionPalabra = {
  palabra: string;
  inicio_ms: number;
  fin_ms: number;
};

export type EstructuraMusical = {
  tipo_seccion: 'intro' | 'verso' | 'estribillo' | 'puente' | 'solo_instrumental' | 'outro' | 'silencio' | 'subidon_build_up';
  inicio_ms: number;
  fin_ms: number;
};

export type AnalisisContenido = {
  analisis_lirico_tematico: {
    tema_principal: string;
    palabras_clave_semanticas: string[];
    evolucion_emocional: string;
  };
  eventos_clave_dj: EventoClaveDJ[];
  diagnostico_tecnico?: {
    resumen_segmentos_voz: string;
    segmentos_fuera_vad?: number;
    perfil_energia_resumen?: string;
    energia_promedio?: number;
    energia_picos_ms?: number[];
    energia_valles_ms?: number[];
    huecos_resumen?: string;
  };
};

export type EventoClaveDJ = {
  evento: 'caida_de_bajo' | 'acapella_break' | 'cambio_ritmico_notable' | 'melodia_iconica';
  inicio_ms: number;
  fin_ms: number;
};
