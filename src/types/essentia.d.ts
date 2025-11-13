declare module 'essentia.js' {
  export class Essentia {
    constructor(module: any);
    
    // Windowing
    Windowing(frame: Float32Array, normalize: boolean, size: number, type: string): Float32Array;
    
    // Spectrum
    Spectrum(frame: Float32Array): Float32Array;
    
    // Spectral Peaks
    SpectralPeaks(spectrum: Float32Array): { frequencies: Float32Array; magnitudes: Float32Array };
    
    // HPCP
    HPCP(frequencies: Float32Array, magnitudes: Float32Array): Float32Array;
    
    // Key Extractor
    KeyExtractor(signal: Float32Array, ...args: any[]): { key: string; scale: string; strength: number };
    
    // Mel Bands
    MelBands(spectrum: Float32Array, ...args: any[]): Float32Array;
    
    // Pitch Melodia
    PitchMelodia(signal: Float32Array, ...args: any[]): { pitch: Float32Array; pitchConfidence: Float32Array };
    
    // RMS
    RMS(frame: Float32Array): { rms: number };
    
    // Spectral Centroid
    SpectralCentroidTime(frame: Float32Array, sampleRate: number): number;
    
    // Roll Off
    RollOff(spectrum: Float32Array, cutoff: number, sampleRate: number): number;
    
    // Zero Crossing Rate
    ZeroCrossingRate(frame: Float32Array): number;
  }
  
  export function EssentiaWASM(): Promise<any>;
}
