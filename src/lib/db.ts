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

// ===================================================================
// TIPOS SIMPLIFICADOS - TIMELINE UNIFICADO
// ===================================================================

// Segmento de Timeline Unificado (FUENTE ÚNICA DE VERDAD)
export type TimelineSegment = {
  inicio: string;  // MM:SS.d format
  fin: string;
  tipo_seccion: 'intro' | 'verso' | 'estribillo' | 'puente' | 'outro' | 'solo_instrumental' | 'subidon_build_up';
  has_vocals: boolean;
  descripcion?: string;  // Lyrics snippet or instrument description
};

// Loop para DJ (se mantiene separado)
export type LoopTransicion = {
  texto: string;
  inicio: string;
  fin: string;
};

// ===================================================================
// TIPOS DERIVADOS (Se calculan en código desde timeline)
// ===================================================================

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

export type EstructuraMusical = {
  tipo_seccion: 'intro' | 'verso' | 'estribillo' | 'puente' | 'solo_instrumental' | 'outro' | 'silencio' | 'subidon_build_up';
  inicio: string;
  fin: string;
};

// ===================================================================
// TIPO PRINCIPAL - CANCIÓN ANALIZADA
// ===================================================================

export type CancionAnalizada = {
  id: string;
  hash_archivo: string;
  titulo: string;
  duracion_ms: number;
  
  // Métricas DJ
  bpm: number | null;
  tonalidad_camelot: string | null;
  tonalidad_compatible: string[] | null;
  bailabilidad: number | null;
  compas: { numerador: number; denominador: number } | null;
  
  // Timing
  downbeats_ts_ms: number[] | null;
  beats_ts_ms: number[] | null;
  frases_ts_ms: number[] | null;
  
  // Datos Gemini (SIMPLIFICADO)
  timeline: TimelineSegment[] | null;       // FUENTE ÚNICA DE VERDAD
  loops_transicion: LoopTransicion[] | null;
  
  // Derivados (calculados en código, NO en BD)
  vocales_clave?: BloqueVocal[] | null;
  estructura_ts?: EstructuraMusical[] | null;
  huecos_analizados?: HuecoInstrumental[] | null;
  
  // Metadatos
  fecha_procesado: Date;
};

// ===================================================================
// FUNCIONES HELPER - DERIVAR DATOS DESDE TIMELINE
// ===================================================================

/**
 * Deriva vocales_clave desde el timeline (segmentos con has_vocals=true)
 */
export function derivarVocalesDeTimeline(timeline: TimelineSegment[] | null): BloqueVocal[] {
  if (!timeline) return [];
  
  return timeline
    .filter(t => t.has_vocals === true)
    .map(t => ({
      tipo: (t.tipo_seccion === 'estribillo') ? 'bloque_coro' : 'bloque_verso' as const,
      inicio: t.inicio,
      fin: t.fin
    }));
}

/**
 * Deriva estructura_ts desde el timeline (todos los segmentos)
 */
export function derivarEstructuraDeTimeline(timeline: TimelineSegment[] | null): EstructuraMusical[] {
  if (!timeline) return [];
  
  return timeline.map(t => ({
    tipo_seccion: t.tipo_seccion,
    inicio: t.inicio,
    fin: t.fin
  }));
}

/**
 * Deriva huecos_analizados desde el timeline (segmentos con has_vocals=false)
 */
export function derivarHuecosDeTimeline(timeline: TimelineSegment[] | null): HuecoInstrumental[] {
  if (!timeline) return [];
  
  return timeline
    .filter(t => t.has_vocals === false)
    .map(t => ({
      inicio: t.inicio,
      fin: t.fin,
      tipo: 'instrumental_puro' as const
    }));
}

/**
 * Enriquece una canción con datos derivados del timeline
 * Usar al leer de BD para tener compatibilidad con código existente
 */
export function enriquecerCancionConDatosDerivados(cancion: CancionAnalizada): CancionAnalizada {
  return {
    ...cancion,
    vocales_clave: derivarVocalesDeTimeline(cancion.timeline),
    estructura_ts: derivarEstructuraDeTimeline(cancion.timeline),
    huecos_analizados: derivarHuecosDeTimeline(cancion.timeline)
  };
}
