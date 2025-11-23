import type { 
  CancionAnalizada, 
  SegmentoVoz, 
  HuecoInstrumental, 
  EventoClaveDJ, 
  EstructuraMusical 
} from './db';

// Tipos de estrategias de mezcla para saber CÓMO mezclar
export type CueStrategy = 
  | 'INTRO_SIMPLE'      // Entrada limpia en intro/hueco instrumental
  | 'DROP_SWAP'         // Swap en drop/caída de bajo (con build-up)
  | 'IMPACT_ENTRY'      // Entrada directa en drop (sin build-up, corte seco)
  | 'OUTRO_FADE'        // Fade out clásico en outro
  | 'BREAKDOWN_ENTRY'   // Entrada en breakdown/melodía
  | 'LOOP_ANCHOR'       // Punto de anclaje para loops
  | 'EVENT_SYNC';       // Sincronización con evento DJ

// Tipos de curva de crossfade para el reproductor
export type CrossfadeCurve = 
  | 'LINEAR'            // Fade lineal estándar
  | 'BASS_SWAP'         // Swap de bajos (cortar bajos de A al entrar B)
  | 'CUT'               // Corte seco sin crossfade
  | 'POWER_MIX';        // Mezcla con ambos tracks a volumen alto

export interface CuePoint {
  trackId: string;
  hash: string;
  title: string;
  pointMs: number;
  type: 'IN' | 'OUT';
  strategy: CueStrategy;
  score: number;
  
  // Metadatos cruciales para la transición
  safeDurationMs: number;    // Cuánto tiempo limpio tenemos
  hasVocalOverlap: boolean;  // Si choca con voces
  alignedToPhrase: boolean;  // Si cae en un inicio de frase exacto
  alignedToBar: boolean;     // Si cae en inicio de compás (4 beats)
  alignedTo8BarGrid: boolean; // Si cae en bloque de 8 compases (32 beats)
  eventLink?: string;        // Link a evento DJ si aplica
  sectionType?: string;      // Tipo de sección musical
  suggestedCurve?: CrossfadeCurve; // Curva recomendada para esta entrada/salida
}

export interface MixPlanEntry {
  trackId: string;
  hash: string;
  title: string;
  durationMs: number;
  bestEntryPoints: CuePoint[];
  bestExitPoints: CuePoint[];
}

// Configuración de pesos
const WEIGHTS = {
  INSTRUMENTAL_PURE: 1.5,     // Multiplicador para huecos puros
  EVENT_ALIGNMENT: 2.0,       // Multiplicador si se alinea a un evento DJ
  PHRASE_ALIGNMENT: 1.2,      // Multiplicador si cae en frase exacta
  VOCAL_CLASH_PENALTY: 0.1,   // Penalización brutal si choca voz
  INTRO_BONUS: 1.3,           // Bonus para intros reales
  OUTRO_BONUS: 1.3,           // Bonus para outros reales
};

const MIN_MIX_WINDOW_MS = 4000; // Mínimo 4 segundos para mezclar
const PRE_EVENT_ROLLBACK_MS = 16000; // ~16s antes del evento para build-up (2 bloques de 8 compases)
const IMPACT_ENTRY_THRESHOLD_MS = 5000; // Si el drop está antes de esto, es IMPACT en vez de SWAP
const MAX_ENTRY_POSITION = 0.4; // 40% de la canción
const MIN_EXIT_POSITION = 0.6; // 60% de la canción

export function buildMixPlan(tracks: CancionAnalizada[]): MixPlanEntry[] {
  return tracks.map(track => {
    // Normalizar datos si vienen como strings JSON del CSV
    const huecos = normalizeArray<HuecoInstrumental>(track.huecos_analizados);
    const voces = normalizeArray<SegmentoVoz>(track.segmentos_voz);
    const eventos = normalizeEventos(track.analisis_contenido?.eventos_clave_dj);
    const estructura = normalizeEstructura(track.estructura_ts);
    const frases = normalizeNumericArray(track.frases_ts_ms);

    // Calcular puntos
    const entryPoints = findSophisticatedEntryPoints(
      track, 
      huecos, 
      voces, 
      eventos, 
      estructura, 
      frases
    );
    
    const exitPoints = findSophisticatedExitPoints(
      track, 
      huecos, 
      voces, 
      eventos, 
      estructura, 
      frases
    );

    console.log(`📊 MixPlan para "${track.titulo}":`);
    console.log(`  🎯 ${entryPoints.length} puntos de entrada (top score: ${entryPoints[0]?.score ?? 0})`);
    console.log(`  🚪 ${exitPoints.length} puntos de salida (top score: ${exitPoints[0]?.score ?? 0})`);

    return {
      trackId: track.id,
      hash: track.hash_archivo,
      title: track.titulo,
      durationMs: track.duracion_ms,
      bestEntryPoints: entryPoints.sort((a, b) => b.score - a.score).slice(0, 5),
      bestExitPoints: exitPoints.sort((a, b) => b.score - a.score).slice(0, 5),
    };
  });
}

/**
 * LÓGICA DE ENTRADA MEJORADA
 * Busca: Intros limpias, Breaks instrumentales y Alineación con Drops
 */
function findSophisticatedEntryPoints(
  track: CancionAnalizada,
  huecos: HuecoInstrumental[],
  voces: SegmentoVoz[],
  eventos: EventoClaveDJ[],
  estructura: EstructuraMusical[],
  frases: number[]
): CuePoint[] {
  const candidates: CuePoint[] = [];
  const maxEntryMs = track.duracion_ms * MAX_ENTRY_POSITION;

  // 1. ESTRATEGIA: INSTRUMENTAL GAPS (La más segura)
  huecos.forEach(hueco => {
    if (hueco.inicio_ms > maxEntryMs) return;
    
    // Alinear al inicio de frase más cercano DENTRO del hueco
    const alignedStart = findNearestPhraseStart(hueco.inicio_ms, frases, 2000);
    const effectiveStart = alignedStart ?? hueco.inicio_ms;
    const safeDuration = hueco.fin_ms - effectiveStart;

    if (safeDuration >= MIN_MIX_WINDOW_MS) {
      let score = 70; // Base score decente
      
      // Bonificaciones
      if (hueco.tipo === 'instrumental_puro') {
        score *= WEIGHTS.INSTRUMENTAL_PURE;
      }
      if (alignedStart) {
        score *= WEIGHTS.PHRASE_ALIGNMENT;
      }
      if (effectiveStart < 30000) {
        score *= WEIGHTS.INTRO_BONUS; // Bonus por ser intro real
      }

      // Detectar si está en una intro estructural
      const isInIntro = estructura.some(s => 
        s.tipo_seccion === 'intro' && 
        effectiveStart >= s.inicio_ms && 
        effectiveStart <= s.fin_ms
      );
      
      // Calcular alineación a grid de 8 compases
      const gridAlignment = snapTo8BarGrid(effectiveStart, track.bpm, track.downbeats_ts_ms || []);

      candidates.push({
        trackId: track.id,
        hash: track.hash_archivo,
        title: track.titulo,
        pointMs: effectiveStart,
        type: 'IN',
        strategy: isInIntro ? 'INTRO_SIMPLE' : 'BREAKDOWN_ENTRY',
        score: Math.min(Math.round(score), 100),
        safeDurationMs: safeDuration,
        hasVocalOverlap: false,
        alignedToPhrase: !!alignedStart,
        alignedToBar: gridAlignment.alignedToBar,
        alignedTo8BarGrid: gridAlignment.alignedTo8Bar,
        sectionType: hueco.tipo,
        suggestedCurve: 'LINEAR',
      });
    }
  });

  // 2. ESTRATEGIA: EVENT ALIGNMENT (Impacto alto)
  // Distinguir entre DROP_SWAP (con build-up) e IMPACT_ENTRY (entrada directa)
  eventos.forEach(evento => {
    // Calcular punto ideal de entrada (antes del evento para build-up)
    const targetPoint = Math.max(0, evento.inicio_ms - PRE_EVENT_ROLLBACK_MS);
    
    // CASO A: Hay espacio suficiente para build-up → DROP_SWAP
    if (targetPoint > IMPACT_ENTRY_THRESHOLD_MS && targetPoint <= maxEntryMs) {
      // Alinear a grid de 8 compases para sincronía perfecta
      const gridAlignment = snapTo8BarGrid(targetPoint, track.bpm, track.downbeats_ts_ms || []);
      const finalPoint = gridAlignment.alignedMs;

      // Verificar colisión vocal durante el build-up
      const vocalClash = checkVocalOverlap(finalPoint, evento.inicio_ms, voces);
      const safeDuration = evento.inicio_ms - finalPoint;

      if (safeDuration < MIN_MIX_WINDOW_MS) return;

      let score = 90; // Score alto para drop swaps bien planeados
      
      score *= WEIGHTS.EVENT_ALIGNMENT;
      
      if (vocalClash) {
        score *= WEIGHTS.VOCAL_CLASH_PENALTY;
      }
      if (gridAlignment.alignedTo8Bar) {
        score *= 1.15; // Bonus extra por alineación perfecta a 8 compases
      }
      
      const strategy: CueStrategy = 
        evento.evento === 'caida_de_bajo' ? 'DROP_SWAP' : 
        evento.evento === 'melodia_iconica' ? 'BREAKDOWN_ENTRY' :
        'EVENT_SYNC';

      candidates.push({
        trackId: track.id,
        hash: track.hash_archivo,
        title: track.titulo,
        pointMs: finalPoint,
        type: 'IN',
        strategy,
        score: Math.min(Math.round(score), 100),
        safeDurationMs: safeDuration,
        hasVocalOverlap: vocalClash,
        alignedToPhrase: true,
        alignedToBar: gridAlignment.alignedToBar,
        alignedTo8BarGrid: gridAlignment.alignedTo8Bar,
        eventLink: `Build-up to ${evento.evento} at ${Math.round(evento.inicio_ms / 1000)}s`,
        sectionType: evento.evento,
        suggestedCurve: strategy === 'DROP_SWAP' ? 'BASS_SWAP' : 'LINEAR',
      });
    }
    
    // CASO B: El drop está muy temprano (< 5s) → IMPACT_ENTRY
    else if (evento.inicio_ms <= IMPACT_ENTRY_THRESHOLD_MS && evento.inicio_ms >= 1000) {
      // Entrada directa en el drop (para cortes secos/hard cuts)
      const gridAlignment = snapTo8BarGrid(evento.inicio_ms, track.bpm, track.downbeats_ts_ms || []);
      const entryPoint = gridAlignment.alignedMs;
      
      const vocalCheck = checkVocalOverlap(entryPoint, entryPoint + 2000, voces);
      
      let score = 65; // Score moderado (es arriesgado pero efectivo)
      
      if (!vocalCheck) score += 15; // Bonus si no hay voz inmediata
      if (evento.evento === 'caida_de_bajo') score += 10; // Los drops funcionan bien
      
      candidates.push({
        trackId: track.id,
        hash: track.hash_archivo,
        title: track.titulo,
        pointMs: entryPoint,
        type: 'IN',
        strategy: 'IMPACT_ENTRY',
        score: Math.min(Math.round(score), 100),
        safeDurationMs: 2000, // Muy corto, es un impacto
        hasVocalOverlap: vocalCheck,
        alignedToPhrase: false,
        alignedToBar: gridAlignment.alignedToBar,
        alignedTo8BarGrid: gridAlignment.alignedTo8Bar,
        eventLink: `Direct impact at ${evento.evento}`,
        sectionType: evento.evento,
        suggestedCurve: 'CUT', // Corte seco
      });
    }
  });

  // 3. FALLBACK: Si no hay huecos ni eventos, usar estructura
  if (candidates.length === 0) {
    estructura.forEach(section => {
      if (section.inicio_ms > maxEntryMs) return;
      
      const isGoodEntry = ['intro', 'solo_instrumental'].includes(section.tipo_seccion);
      if (!isGoodEntry) return;

      const alignedPoint = findNearestPhraseStart(section.inicio_ms, frases, 2000);
      const finalPoint = alignedPoint ?? section.inicio_ms;
      const vocalClash = checkVocalOverlap(finalPoint, section.fin_ms, voces);

      let score = 50;
      if (section.tipo_seccion === 'intro') score = 60;
      if (!vocalClash) score += 20;
      if (alignedPoint) score *= WEIGHTS.PHRASE_ALIGNMENT;
      
      // Calcular alineación a grid de 8 compases
      const gridAlignment = snapTo8BarGrid(finalPoint, track.bpm, track.downbeats_ts_ms || []);

      candidates.push({
        trackId: track.id,
        hash: track.hash_archivo,
        title: track.titulo,
        pointMs: finalPoint,
        type: 'IN',
        strategy: 'INTRO_SIMPLE',
        score: Math.min(Math.round(score), 100),
        safeDurationMs: section.fin_ms - finalPoint,
        hasVocalOverlap: vocalClash,
        alignedToPhrase: !!alignedPoint,
        alignedToBar: gridAlignment.alignedToBar,
        alignedTo8BarGrid: gridAlignment.alignedTo8Bar,
        sectionType: section.tipo_seccion,
        suggestedCurve: 'LINEAR',
      });
    });
  }

  return candidates;
}

/**
 * LÓGICA DE SALIDA MEJORADA
 * Busca: Outros, Final de Coros, Antes de Drops (para hacer switch)
 */
function findSophisticatedExitPoints(
  track: CancionAnalizada,
  huecos: HuecoInstrumental[],
  voces: SegmentoVoz[],
  eventos: EventoClaveDJ[],
  estructura: EstructuraMusical[],
  frases: number[]
): CuePoint[] {
  const candidates: CuePoint[] = [];
  const minExitMs = track.duracion_ms * MIN_EXIT_POSITION;

  // 1. ESTRATEGIA: OUTROS LIMPIOS (Huecos al final)
  huecos.forEach(hueco => {
    if (hueco.inicio_ms < minExitMs) return;

    const alignedStart = findNearestPhraseStart(hueco.inicio_ms, frases, 2000);
    const effectiveStart = alignedStart ?? hueco.inicio_ms;
    const safeDuration = hueco.fin_ms - effectiveStart;

    if (safeDuration >= MIN_MIX_WINDOW_MS) {
      let score = 80;
      
      if (hueco.tipo === 'instrumental_puro') {
        score *= WEIGHTS.INSTRUMENTAL_PURE;
      }
      if (alignedStart) {
        score *= WEIGHTS.PHRASE_ALIGNMENT;
      }
      
      // Bonus si está cerca del final
      const proximityToEnd = (effectiveStart - minExitMs) / (track.duracion_ms - minExitMs);
      if (proximityToEnd > 0.7) {
        score *= WEIGHTS.OUTRO_BONUS;
      }

      // Detectar si está en outro estructural
      const isInOutro = estructura.some(s => 
        s.tipo_seccion === 'outro' && 
        effectiveStart >= s.inicio_ms && 
        effectiveStart <= s.fin_ms
      );
      
      // Calcular alineación a grid de 8 compases
      const gridAlignment = snapTo8BarGrid(effectiveStart, track.bpm, track.downbeats_ts_ms || []);
      
      candidates.push({
        trackId: track.id,
        hash: track.hash_archivo,
        title: track.titulo,
        pointMs: effectiveStart,
        type: 'OUT',
        strategy: isInOutro ? 'OUTRO_FADE' : 'BREAKDOWN_ENTRY',
        score: Math.min(Math.round(score), 100),
        safeDurationMs: safeDuration,
        hasVocalOverlap: false,
        alignedToPhrase: !!alignedStart,
        alignedToBar: gridAlignment.alignedToBar,
        alignedTo8BarGrid: gridAlignment.alignedTo8Bar,
        sectionType: hueco.tipo,
        suggestedCurve: 'LINEAR',
      });
    }
  });

  // 2. ESTRATEGIA: POST-CHORUS / PRE-DROP (Energy Switch)
  eventos.forEach(evento => {
    // Salir justo cuando empieza el evento (switch dramático)
    const exitPoint = evento.inicio_ms;
    
    if (exitPoint < minExitMs) return;
    
    const alignedExit = findNearestPhraseStart(exitPoint, frases, 2000) ?? exitPoint;

    // Mirar hacia atrás para ventana de mezcla
    const windowBefore = Math.min(PRE_EVENT_ROLLBACK_MS, exitPoint);
    const startMix = Math.max(0, alignedExit - windowBefore);
    const vocalClash = checkVocalOverlap(startMix, alignedExit, voces);

    let score = 75;
    
    if (evento.evento === 'caida_de_bajo') {
      score = 90; // Switch en drop es PRO
      score *= WEIGHTS.EVENT_ALIGNMENT;
    }
    
    if (vocalClash) {
      score *= 0.7; // Es difícil salir si están cantando
    }
    
    if (alignedExit === exitPoint) {
      score *= WEIGHTS.PHRASE_ALIGNMENT;
    }
    
    // Calcular alineación a grid de 8 compases
    const gridAlignment = snapTo8BarGrid(alignedExit, track.bpm, track.downbeats_ts_ms || []);

    candidates.push({
      trackId: track.id,
      hash: track.hash_archivo,
      title: track.titulo,
      pointMs: alignedExit,
      type: 'OUT',
      strategy: 'DROP_SWAP',
      score: Math.min(Math.round(score), 100),
      safeDurationMs: windowBefore,
      hasVocalOverlap: vocalClash,
      alignedToPhrase: alignedExit === exitPoint,
      alignedToBar: gridAlignment.alignedToBar,
      alignedTo8BarGrid: gridAlignment.alignedTo8Bar,
      eventLink: `Exit at ${evento.evento}`,
      sectionType: evento.evento,
      suggestedCurve: 'BASS_SWAP',
    });
  });

  // 3. FALLBACK: Usar estructura
  if (candidates.length === 0) {
    estructura.forEach(section => {
      if (section.fin_ms < minExitMs) return;
      
      const isGoodExit = ['outro', 'solo_instrumental'].includes(section.tipo_seccion);
      if (!isGoodExit) return;

      const targetPoint = section.tipo_seccion === 'outro' 
        ? section.inicio_ms 
        : section.fin_ms;
        
      const alignedPoint = findNearestPhraseStart(targetPoint, frases, 2000);
      const finalPoint = alignedPoint ?? targetPoint;
      
      const windowBefore = Math.min(8000, finalPoint - section.inicio_ms);
      const vocalClash = checkVocalOverlap(finalPoint - windowBefore, finalPoint, voces);

      let score = 60;
      if (section.tipo_seccion === 'outro') score = 70;
      if (!vocalClash) score += 20;
      if (alignedPoint) score *= WEIGHTS.PHRASE_ALIGNMENT;
      
      // Calcular alineación a grid de 8 compases
      const gridAlignment = snapTo8BarGrid(finalPoint, track.bpm, track.downbeats_ts_ms || []);

      candidates.push({
        trackId: track.id,
        hash: track.hash_archivo,
        title: track.titulo,
        pointMs: finalPoint,
        type: 'OUT',
        strategy: 'OUTRO_FADE',
        score: Math.min(Math.round(score), 100),
        safeDurationMs: windowBefore,
        hasVocalOverlap: vocalClash,
        alignedToPhrase: !!alignedPoint,
        alignedToBar: gridAlignment.alignedToBar,
        alignedTo8BarGrid: gridAlignment.alignedTo8Bar,
        sectionType: section.tipo_seccion,
        suggestedCurve: 'LINEAR',
      });
    });
  }

  return candidates;
}

// --- UTILIDADES ---

/**
 * Calcula la alineación a grid de 8 compases (32 beats)
 * Esta es la unidad fundamental de fraseo en música de baile electrónica
 */
function snapTo8BarGrid(
  pointMs: number, 
  bpm: number | null, 
  downbeats: number[]
): { alignedMs: number; alignedToBar: boolean; alignedTo8Bar: boolean } {
  // Valores por defecto si no hay datos
  if (!bpm || !downbeats || downbeats.length === 0) {
    return { alignedMs: pointMs, alignedToBar: false, alignedTo8Bar: false };
  }

  const msPerBeat = 60000 / bpm;
  const msPerBar = msPerBeat * 4; // 4 beats = 1 compás
  const msPer8Bars = msPerBar * 8; // 32 beats = bloque de 8 compases

  // Encontrar el primer downbeat
  const firstDownbeat = downbeats[0] || 0;

  // Calcular cuántos bloques de 8 compases han pasado
  const relativeTime = pointMs - firstDownbeat;

  const phrasesPassed = Math.round(relativeTime / msPer8Bars);
  const aligned8BarMs = firstDownbeat + (phrasesPassed * msPer8Bars);

  const barsPassed = Math.round(relativeTime / msPerBar);
  const alignedBarMs = firstDownbeat + (barsPassed * msPerBar);

  // Tolerancia: 2 beats por defecto (mejor perceptual)
  const tolerance = msPerBeat * 2;
  const distTo8Bar = Math.abs(pointMs - aligned8BarMs);
  const distToBar = Math.abs(pointMs - alignedBarMs);

  // Priorizar 8-bar si está cerca
  if (distTo8Bar < tolerance) {
    return { alignedMs: Math.max(0, aligned8BarMs), alignedToBar: true, alignedTo8Bar: true };
  }

  // Alinear al compás si está cerca
  if (distToBar < tolerance) {
    return { alignedMs: Math.max(0, alignedBarMs), alignedToBar: true, alignedTo8Bar: false };
  }

  return { alignedMs: Math.max(0, pointMs), alignedToBar: false, alignedTo8Bar: false };
}

/**
 * Busca la frase más cercana al punto objetivo (snap to grid musical)
 */
function findNearestPhraseStart(
  targetMs: number, 
  phrases: number[], 
  toleranceMs: number
): number | null {
  if (!phrases.length) return null;
  
  const closest = phrases.reduce((prev, curr) => {
    return Math.abs(curr - targetMs) < Math.abs(prev - targetMs) ? curr : prev;
  });

  return Math.abs(closest - targetMs) <= toleranceMs ? closest : null;
}

/**
 * Verifica si hay solapamiento vocal en un rango de tiempo
 */
function checkVocalOverlap(
  startMs: number, 
  endMs: number, 
  vocalSegments: SegmentoVoz[]
): boolean {
  return vocalSegments.some(seg => {
    const overlaps = 
      (seg.start_ms >= startMs && seg.start_ms < endMs) ||
      (seg.end_ms > startMs && seg.end_ms <= endMs) ||
      (seg.start_ms <= startMs && seg.end_ms >= endMs);
    
    return overlaps;
  });
}

/**
 * Normaliza arrays que pueden venir como JSON string o ya parseados
 */
function normalizeArray<T>(data: T[] | string | null | undefined): T[] {
  if (!data) return [];
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return Array.isArray(data) ? data : [];
}

function normalizeNumericArray(data: number[] | string | null | undefined): number[] {
  const arr = normalizeArray<number>(data);
  return arr.filter(v => typeof v === 'number' && Number.isFinite(v));
}

function normalizeEventos(data: EventoClaveDJ[] | string | null | undefined): EventoClaveDJ[] {
  return normalizeArray<EventoClaveDJ>(data).filter(e => 
    e && 
    typeof e.inicio_ms === 'number' && 
    typeof e.fin_ms === 'number' &&
    typeof e.evento === 'string'
  );
}

function normalizeEstructura(data: EstructuraMusical[] | string | null | undefined): EstructuraMusical[] {
  return normalizeArray<EstructuraMusical>(data)
    .filter(s => 
      s && 
      typeof s.inicio_ms === 'number' && 
      typeof s.fin_ms === 'number' &&
      typeof s.tipo_seccion === 'string'
    )
    .sort((a, b) => a.inicio_ms - b.inicio_ms);
}
