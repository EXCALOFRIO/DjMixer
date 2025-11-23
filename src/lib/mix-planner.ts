import type { CancionAnalizada, EstructuraMusical, TranscripcionPalabra } from './db';

export interface CuePoint {
  trackId: string;
  hash: string;
  title: string;
  artist: string;
  type: 'IN' | 'OUT';
  pointMs: number;
  sectionType?: string;
  score: number;
  vocalMarginMs: number;
}

export interface MixPlanEntry {
  trackId: string;
  hash: string;
  title: string;
  artist: string;
  durationMs: number;
  bestEntryPoints: CuePoint[];
  bestExitPoints: CuePoint[];
}

const SECTION_WEIGHTS: Record<string, number> = {
  intro: 1.5,
  outro: 1.5,
  solo_instrumental: 1.4,
  subidon_build_up: 1.3,
  estribillo: 1.2,
  puente: 1.05,
  verso: 1.0,
  silencio: 0.8,
};

const MAX_CANDIDATES = 5;
const MIN_VOCAL_GAP_MS = 1500;
const CROSSFADE_MAX_MS = 12000;
const CROSSFADE_MIN_MS = 3000;
const MAX_ENTRY_RATIO = 0.4;
const MIN_EXIT_RATIO = 0.6;

export function buildMixPlan(tracks: CancionAnalizada[]): MixPlanEntry[] {
  return tracks.map((track) => {
    const duration = track.duracion_ms;
    const estructura = normalizeEstructura(track.estructura_ts);
    const frases = Array.isArray(track.frases_ts_ms) ? track.frases_ts_ms.filter((v): v is number => typeof v === 'number') : [];
    const letras = normalizeLetras(track.letras_ts);

    const bestEntryPoints = findBestEntryPoints(track, duration, estructura, frases, letras);
    const bestExitPoints = findBestExitPoints(track, duration, estructura, frases, letras);

    console.log(`📊 ${track.titulo}:`);
    console.log(`  ✅ ${bestEntryPoints.length} puntos de entrada (top 5)`);
    console.log(`  ✅ ${bestExitPoints.length} puntos de salida (top 5)`);

    return {
      trackId: track.id,
      hash: track.hash_archivo,
      title: track.titulo,
      artist: track.artista,
      durationMs: duration,
      bestEntryPoints,
      bestExitPoints,
    };
  });
}

function findBestEntryPoints(
  track: CancionAnalizada,
  durationMs: number,
  estructura: EstructuraMusical[],
  frases: number[],
  letras: TranscripcionPalabra[],
): CuePoint[] {
  const windowEnd = durationMs * MAX_ENTRY_RATIO;
  
  const candidates: Array<{ pointMs: number; section?: EstructuraMusical; score: number; vocalGapMs: number }> = [];

  // NUEVO: Evaluar el inicio absoluto de la canción (0ms o primera frase)
  const veryStartMs = alignToPhrase(0, undefined, frases, 'forward');
  if (veryStartMs < windowEnd) {
    const { preVocalGapMs } = computeEntryVocalWindows(veryStartMs, letras);
    
    let vocalScore = 0;
    if (preVocalGapMs >= 8000) {
      vocalScore = 100;
    } else if (preVocalGapMs >= CROSSFADE_MIN_MS) {
      vocalScore = 60 + (40 * (preVocalGapMs - CROSSFADE_MIN_MS) / (8000 - CROSSFADE_MIN_MS));
    } else if (preVocalGapMs >= MIN_VOCAL_GAP_MS) {
      vocalScore = (preVocalGapMs / MIN_VOCAL_GAP_MS) * 60;
    } else {
      vocalScore = (preVocalGapMs / MIN_VOCAL_GAP_MS) * 30;
    }
    
    // Bonus por ser el inicio natural de la canción
    const baseWeight = 150; // Alto peso para el inicio
    const finalScore = baseWeight * 0.3 + vocalScore * 0.7;
    
    candidates.push({ 
      pointMs: veryStartMs, 
      section: undefined, 
      score: finalScore, 
      vocalGapMs: Math.round(preVocalGapMs) 
    });
  }

  estructura.forEach((section) => {
    if (section.inicio_ms >= windowEnd) return;

    const pointMs = alignToPhrase(section.inicio_ms, section, frases, 'forward');
    const { preVocalGapMs } = computeEntryVocalWindows(pointMs, letras);

    const baseWeight = (SECTION_WEIGHTS[section.tipo_seccion] ?? 1.0) * 100;
    
    let vocalScore = 0;
    if (preVocalGapMs >= 8000) {
      vocalScore = 100;
    } else if (preVocalGapMs >= CROSSFADE_MIN_MS) {
      vocalScore = 60 + (40 * (preVocalGapMs - CROSSFADE_MIN_MS) / (8000 - CROSSFADE_MIN_MS));
    } else if (preVocalGapMs >= MIN_VOCAL_GAP_MS) {
      vocalScore = (preVocalGapMs / MIN_VOCAL_GAP_MS) * 60;
    } else {
      vocalScore = (preVocalGapMs / MIN_VOCAL_GAP_MS) * 30;
    }
    
    const finalScore = baseWeight * 0.3 + vocalScore * 0.7;
    
    candidates.push({ 
      pointMs, 
      section, 
      score: finalScore, 
      vocalGapMs: Math.round(preVocalGapMs) 
    });
  });

  if (candidates.length === 0) {
    const fallbackPoint = Math.min(durationMs * 0.1, 10000);
    const fallbackAligned = alignToPhrase(fallbackPoint, undefined, frases, 'forward');
    const { preVocalGapMs } = computeEntryVocalWindows(fallbackAligned, letras);
    
    candidates.push({
      pointMs: fallbackAligned,
      section: undefined,
      score: 10,
      vocalGapMs: Math.round(preVocalGapMs),
    });
  }

  const uniquePoints = new Map<number, typeof candidates[0]>();
  candidates.forEach(c => {
    const existing = uniquePoints.get(c.pointMs);
    if (!existing || c.score > existing.score) {
      uniquePoints.set(c.pointMs, c);
    }
  });

  const sorted = Array.from(uniquePoints.values()).sort((a, b) => b.score - a.score);
  const topCandidates = sorted.slice(0, MAX_CANDIDATES);

  while (topCandidates.length < MAX_CANDIDATES && topCandidates.length < sorted.length) {
    topCandidates.push(sorted[topCandidates.length]);
  }

  if (topCandidates.length < MAX_CANDIDATES) {
    for (let i = topCandidates.length; i < MAX_CANDIDATES; i++) {
      const fallbackMs = (durationMs * (0.1 + (i * 0.05)));
      const alignedMs = alignToPhrase(fallbackMs, undefined, frases, 'forward');
      const { preVocalGapMs } = computeEntryVocalWindows(alignedMs, letras);
      
      topCandidates.push({
        pointMs: alignedMs,
        section: undefined,
        score: 5 - i,
        vocalGapMs: Math.round(preVocalGapMs),
      });
    }
  }

  return topCandidates.map(c => ({
    trackId: track.id,
    hash: track.hash_archivo,
    title: track.titulo,
    artist: track.artista,
    type: 'IN' as const,
    pointMs: c.pointMs,
    sectionType: c.section?.tipo_seccion,
    score: Math.round(c.score),
    vocalMarginMs: c.vocalGapMs,
  }));
}

function findBestExitPoints(
  track: CancionAnalizada,
  durationMs: number,
  estructura: EstructuraMusical[],
  frases: number[],
  letras: TranscripcionPalabra[],
): CuePoint[] {
  const windowStart = durationMs * MIN_EXIT_RATIO;
  
  const candidates: Array<{ pointMs: number; section?: EstructuraMusical; score: number; vocalGapMs: number }> = [];

  // NUEVO: Evaluar el final absoluto de la canción (última frase o durationMs)
  const veryEndMs = alignToPhrase(durationMs, undefined, frases, 'backward');
  if (veryEndMs > windowStart) {
    const { sinceLastVocalMs } = computeExitVocalWindows(veryEndMs, durationMs, letras);
    
    let vocalScore = 0;
    if (sinceLastVocalMs >= 8000) {
      vocalScore = 100;
    } else if (sinceLastVocalMs >= MIN_VOCAL_GAP_MS) {
      vocalScore = 50 + (50 * (sinceLastVocalMs - MIN_VOCAL_GAP_MS) / (8000 - MIN_VOCAL_GAP_MS));
    } else if (sinceLastVocalMs >= 500) {
      vocalScore = (sinceLastVocalMs / MIN_VOCAL_GAP_MS) * 50;
    } else {
      vocalScore = (sinceLastVocalMs / MIN_VOCAL_GAP_MS) * 20;
    }
    
    // Bonus por ser el final natural de la canción
    const baseWeight = 150; // Alto peso para el final
    const finalScore = baseWeight * 0.3 + vocalScore * 0.7;
    
    candidates.push({ 
      pointMs: veryEndMs, 
      section: undefined, 
      score: finalScore, 
      vocalGapMs: Math.round(sinceLastVocalMs) 
    });
  }

  estructura.forEach((section) => {
    if (section.fin_ms <= windowStart) return;

    const isOutro = section.tipo_seccion === 'outro';
    const candidateTime = isOutro ? section.inicio_ms : section.fin_ms;
    const pointMs = alignToPhrase(candidateTime, section, frases, 'backward');
    
    const { sinceLastVocalMs } = computeExitVocalWindows(pointMs, durationMs, letras);

    const baseWeight = (SECTION_WEIGHTS[section.tipo_seccion] ?? 1.0) * 100;
    
    let vocalScore = 0;
    if (sinceLastVocalMs >= 8000) {
      vocalScore = 100;
    } else if (sinceLastVocalMs >= MIN_VOCAL_GAP_MS) {
      vocalScore = 50 + (50 * (sinceLastVocalMs - MIN_VOCAL_GAP_MS) / (8000 - MIN_VOCAL_GAP_MS));
    } else if (sinceLastVocalMs >= 500) {
      vocalScore = (sinceLastVocalMs / MIN_VOCAL_GAP_MS) * 50;
    } else {
      vocalScore = (sinceLastVocalMs / MIN_VOCAL_GAP_MS) * 20;
    }
    
    const finalScore = baseWeight * 0.3 + vocalScore * 0.7;
    
    candidates.push({ 
      pointMs, 
      section, 
      score: finalScore, 
      vocalGapMs: Math.round(sinceLastVocalMs) 
    });
  });

  if (candidates.length === 0) {
    const fallbackPoint = durationMs - 5000;
    const fallbackAligned = alignToPhrase(fallbackPoint, undefined, frases, 'backward');
    const { sinceLastVocalMs } = computeExitVocalWindows(fallbackAligned, durationMs, letras);
    
    candidates.push({
      pointMs: fallbackAligned,
      section: undefined,
      score: 10,
      vocalGapMs: Math.round(sinceLastVocalMs),
    });
  }

  const uniquePoints = new Map<number, typeof candidates[0]>();
  candidates.forEach(c => {
    const existing = uniquePoints.get(c.pointMs);
    if (!existing || c.score > existing.score) {
      uniquePoints.set(c.pointMs, c);
    }
  });

  const sorted = Array.from(uniquePoints.values()).sort((a, b) => b.score - a.score);
  const topCandidates = sorted.slice(0, MAX_CANDIDATES);

  while (topCandidates.length < MAX_CANDIDATES && topCandidates.length < sorted.length) {
    topCandidates.push(sorted[topCandidates.length]);
  }

  if (topCandidates.length < MAX_CANDIDATES) {
    for (let i = topCandidates.length; i < MAX_CANDIDATES; i++) {
      const fallbackMs = durationMs - (5000 + (i * 10000));
      const alignedMs = alignToPhrase(Math.max(fallbackMs, durationMs * 0.5), undefined, frases, 'backward');
      const { sinceLastVocalMs } = computeExitVocalWindows(alignedMs, durationMs, letras);
      
      topCandidates.push({
        pointMs: alignedMs,
        section: undefined,
        score: 5 - i,
        vocalGapMs: Math.round(sinceLastVocalMs),
      });
    }
  }

  return topCandidates.map(c => ({
    trackId: track.id,
    hash: track.hash_archivo,
    title: track.titulo,
    artist: track.artista,
    type: 'OUT' as const,
    pointMs: c.pointMs,
    sectionType: c.section?.tipo_seccion,
    score: Math.round(c.score),
    vocalMarginMs: c.vocalGapMs,
  }));
}

function normalizeEstructura(raw: CancionAnalizada['estructura_ts']): EstructuraMusical[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .filter((section): section is EstructuraMusical =>
      typeof section?.inicio_ms === 'number' &&
      typeof section?.fin_ms === 'number' &&
      typeof section?.tipo_seccion === 'string')
    .map((section) => ({
      ...section,
      inicio_ms: clamp(section.inicio_ms, 0),
      fin_ms: Math.max(clamp(section.fin_ms, 0), clamp(section.inicio_ms, 0)),
    }))
    .sort((a, b) => a.inicio_ms - b.inicio_ms);
}

function normalizeLetras(raw: CancionAnalizada['letras_ts']): TranscripcionPalabra[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .filter((word): word is TranscripcionPalabra =>
      typeof word?.inicio_ms === 'number' && typeof word?.fin_ms === 'number')
    .map((word) => ({
      ...word,
      inicio_ms: clamp(word.inicio_ms, 0),
      fin_ms: Math.max(clamp(word.fin_ms, 0), clamp(word.inicio_ms, 0)),
    }))
    .sort((a, b) => a.inicio_ms - b.inicio_ms);
}

function alignToPhrase(
  pointMs: number,
  section: EstructuraMusical | undefined,
  frases: number[],
  direction: 'forward' | 'backward',
): number {
  if (!Array.isArray(frases) || frases.length === 0) {
    return pointMs;
  }

  const sectionStart = section?.inicio_ms ?? pointMs;
  const sectionEnd = section?.fin_ms ?? pointMs;

  if (direction === 'forward') {
    const candidate = frases.find((fraseMs) => fraseMs >= sectionStart && fraseMs <= sectionEnd);
    if (typeof candidate === 'number') {
      return candidate;
    }
    const next = frases.find((fraseMs) => fraseMs >= pointMs);
    return typeof next === 'number' ? next : pointMs;
  }

  const reversed = [...frases].reverse();
  const candidate = reversed.find((fraseMs) => fraseMs <= sectionEnd && fraseMs >= sectionStart);
  if (typeof candidate === 'number') {
    return candidate;
  }
  const prev = reversed.find((fraseMs) => fraseMs <= pointMs);
  return typeof prev === 'number' ? prev : pointMs;
}

function computeEntryVocalWindows(pointMs: number, letras: TranscripcionPalabra[]) {
  if (letras.length === 0) {
    return {
      preRollMs: pointMs,
      preVocalGapMs: Number.POSITIVE_INFINITY,
      firstVocalMs: null,
    };
  }

  const firstWordAfter = letras.find((word) => word.inicio_ms >= pointMs);

  // Para puntos de entrada: lo importante es cuánto tiempo limpio tenemos DESPUÉS del punto
  // hasta que empiece a cantar (para hacer el crossfade sin cortar voces)
  const preVocalGapMs = firstWordAfter ? Math.max(0, firstWordAfter.inicio_ms - pointMs) : Number.POSITIVE_INFINITY;
  const firstVocalMs = firstWordAfter?.inicio_ms ?? null;
  
  // preRollMs ya no es relevante para el scoring, solo informativo
  const lastWordBefore = [...letras].reverse().find((word) => word.fin_ms <= pointMs);
  const preRollMs = Math.max(0, pointMs - (lastWordBefore?.fin_ms ?? 0));

  return { preRollMs, preVocalGapMs, firstVocalMs };
}

function computeExitVocalWindows(pointMs: number, durationMs: number, letras: TranscripcionPalabra[]) {
  if (letras.length === 0) {
    return {
      sinceLastVocalMs: pointMs,
      nextVocalGapMs: Number.POSITIVE_INFINITY,
      nextVocalMs: null,
    };
  }

  const lastWordBefore = [...letras].reverse().find((word) => word.fin_ms <= pointMs);
  const firstWordAfter = letras.find((word) => word.inicio_ms >= pointMs);

  const sinceLastVocalMs = Math.max(0, pointMs - (lastWordBefore?.fin_ms ?? 0));
  const nextVocalGapMs = firstWordAfter ? Math.max(0, firstWordAfter.inicio_ms - pointMs) : Math.max(0, durationMs - pointMs);
  const nextVocalMs = firstWordAfter ? firstWordAfter.inicio_ms : null;

  return { sinceLastVocalMs, nextVocalGapMs, nextVocalMs };
}

function clamp(value: number, min: number, max?: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  const clamped = Math.max(min, value);
  if (typeof max === 'number') {
    return Math.min(clamped, max);
  }
  return clamped;
}
