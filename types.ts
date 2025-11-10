export interface LoadedSongData {
  id: string;
  name: string;
  artist: string;
  albumArtUrl: string;
  color: string;
  audioFile: File;
}

export interface Song extends Omit<LoadedSongData, 'audioFile' | 'id'> {
  id: string; // Keep id for map keys
  audioUrl: string;
  duration: number;
  analysis: SpotifyAudioAnalysis; // Keep this name for consistency, but it's now generated client-side
}

export interface AdvancedAnalysisData {
  // Características beat a beat
  energyPerBeat: number[];
  isVocalPerBeat: boolean[];
  spectralCentroidPerBeat: number[];
  
  // Características de la canción completa (con Essentia.js)
  mood: {
    valence: number;  // Positividad/Tristeza (0 a 1)
    arousal: number;  // Energía/Calma (0 a 1)
  };
  danceability: number;  // Bailabilidad (0 a 1)
  genre: string;         // Género musical detectado
  
  // Estructura musical
  structure: {
    intro: { start: number; end: number } | null;
    outro: { start: number; end: number } | null;
    drops: number[];
    builds: number[];
    sections: Array<{
      start: number;
      end: number;
      type: 'low' | 'medium' | 'high';
      avgEnergy: number;
    }>;
    phrases: Array<{
      startBeat: number;
      endBeat: number;
      length: 4 | 8 | 16 | 32;
      isDownbeat: boolean;
    }>;
  };
  
  // NUEVO: Análisis con Gemini (opcional)
  gemini?: {
    transcription: string;
    lyricSections: Array<{
      text: string;
      startTime: number;
      endTime: number;
      type: 'intro' | 'verse' | 'pre-chorus' | 'chorus' | 'bridge' | 'outro' | 'instrumental';
    }>;
    themes: string[];
    mood: {
      energy: 'low' | 'medium' | 'high';
      emotion: 'happy' | 'sad' | 'angry' | 'calm' | 'excited' | 'romantic';
    };
    transitionPoints: Array<{
      beatIndex: number;
      beatTime: number;
      isDownbeat: boolean;
      reason: string;
      quality: 'excellent' | 'good' | 'fair';
    }>;
  };
}

export interface SpotifyAudioAnalysis {
  beats: Beat[];
  segments: Segment[];
  track: {
    duration: number;
    tempo: number;
    key: number;
    mode: number;
  };
  // Análisis avanzado con Meyda/Essentia
  advanced?: AdvancedAnalysisData | null;
}

export interface Beat {
  start: number;
  duration: number;
  confidence: number;
  isDownbeat: boolean; // Marca si este beat es el "1" de un compás (downbeat) - DETECTADO CON ESSENTIA
}

export interface Segment {
  start: number;
  duration: number;
  confidence: number;
  loudness_start: number;
  loudness_max: number;
  loudness_max_time: number;
  pitches: number[];
  timbre: number[];
}

export interface Point {
    x: number;
    y: number;
}

export interface Jump {
    from: { songIndex: number; beatIndex: number; point: Point; };
    to: { songIndex: number; beatIndex: number; point: Point; };
}

export interface TransitionNode {
    beatIndex: number;
    distance: number;
}

export interface InternalTransitionMap {
  [songId: string]: TransitionNode[][];
}

export interface CrossSongTransition {
  from: { songIndex: number; beatIndex: number };
  to: { songIndex: number; beatIndex: number };
  distance: number;
}

export interface PlaybackState {
    currentSongIndex: number;
    currentBeatIndex: number;
    currentBeat: Beat;
}

export type AppState = 'loading' | 'analyzing' | 'ready' | 'preparing' | 'playing' | 'paused';
