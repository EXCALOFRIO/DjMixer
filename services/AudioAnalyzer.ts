import Meyda from 'meyda';
import type { Beat } from '../types';
import { Essentia, EssentiaWASM } from 'essentia.js';

// Interfaz para nuestros nuevos datos de análisis
export interface AdvancedAnalysis {
    energyPerBeat: number[];
    isVocalPerBeat: boolean[];
    spectralCentroidPerBeat: number[];
    
    // Características de alto nivel (canción completa)
    mood: {
        valence: number;  // Positividad (0-1)
        arousal: number;  // Energía (0-1)
    };
    danceability: number;
    genre: string;
    
    // NUEVO: Estructura musical
    structure: {
        intro: { start: number; end: number } | null;
        outro: { start: number; end: number } | null;
        drops: number[];  // Índices de beats donde hay "drops"
        builds: number[]; // Índices de beats donde hay "builds"
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
}

/**
 * Analiza un AudioBuffer beat por beat para extraer características musicales avanzadas
 * Esto nos permite tomar decisiones más inteligentes sobre las transiciones
 */
export async function analyzeSongAdvanced(
    audioBuffer: AudioBuffer,
    beats: Beat[]
): Promise<AdvancedAnalysis> {
    const energyPerBeat: number[] = [];
    const isVocalPerBeat: boolean[] = [];
    const spectralCentroidPerBeat: number[] = [];

    // console.log(`   🔬 Analizando ${beats.length} beats para energía y características...`);

    const channelData = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;

    for (let i = 0; i < beats.length; i++) {
        const beat = beats[i];
        const startSample = Math.floor(beat.start * sampleRate);
        const endSample = Math.floor((beat.start + beat.duration) * sampleRate);

        // Extraer el segmento de audio para este beat
        const beatSegment = channelData.slice(startSample, endSample);

        // Necesitamos un tamaño de buffer que sea potencia de 2 para Meyda
        const bufferSize = Math.pow(2, Math.floor(Math.log2(beatSegment.length)));
        const processedSegment = beatSegment.slice(0, bufferSize);

        if (processedSegment.length < 512) {
            // Beat muy corto, usar valores por defecto
            energyPerBeat.push(0);
            isVocalPerBeat.push(false);
            spectralCentroidPerBeat.push(0);
            continue;
        }

        try {
            // Limitar el tamaño del segmento para evitar stack overflow en Meyda
            const maxSamples = 8192; // Tamaño seguro para Meyda
            const limitedSegment = processedSegment.length > maxSamples 
                ? processedSegment.slice(0, maxSamples)
                : processedSegment;

            // 1. Calcular Energía (RMS) manualmente para evitar problemas con Meyda
            let sumSquares = 0;
            for (let j = 0; j < limitedSegment.length; j++) {
                sumSquares += limitedSegment[j] * limitedSegment[j];
            }
            const rms = Math.sqrt(sumSquares / limitedSegment.length);
            energyPerBeat.push(rms);

            // 2. Centroide Espectral - Usar Meyda solo si el segmento es pequeño
            let centroid = 0;
            if (limitedSegment.length <= 4096) {
                try {
                    const features = Meyda.extract('spectralCentroid', limitedSegment);
                    centroid = (typeof features === 'number') ? features : 0;
                } catch {
                    centroid = 0;
                }
            }
            spectralCentroidPerBeat.push(centroid);

            // 3. MEJORA #2: Detección MEJORADA de vocales - Heurística basada en energía espectral
            // La voz humana vive principalmente en frecuencias medias (300Hz - 2500Hz)
            const VOCAL_ENERGY_THRESHOLD = 0.05; // Umbral de energía mínimo
            const VOCAL_CENTROID_MIN = 300;      // Frecuencia mínima de la voz
            const VOCAL_CENTROID_MAX = 2500;     // Frecuencia máxima (evita hi-hats y platillos)
            
            // Heurística mejorada: ¿Hay suficiente energía Y está en el rango vocal?
            const hasVocal = (
                rms > VOCAL_ENERGY_THRESHOLD && 
                centroid > VOCAL_CENTROID_MIN && 
                centroid < VOCAL_CENTROID_MAX
            );
            
            isVocalPerBeat.push(hasVocal);

        } catch (error) {
            // Silenciar errores individuales para no saturar la consola
            energyPerBeat.push(0);
            isVocalPerBeat.push(false);
            spectralCentroidPerBeat.push(0);
        }
    }

    // ========================================================================
    // ANÁLISIS DE ALTO NIVEL: Mood, Danceability, Género (Canción Completa)
    // ========================================================================
    
    // console.log(`   🧠 Analizando mood, bailabilidad y características globales...`);

    // Calcular características globales de la canción
    const avgEnergy = energyPerBeat.reduce((a, b) => a + b, 0) / energyPerBeat.length;
    const avgCentroid = spectralCentroidPerBeat.reduce((a, b) => a + b, 0) / spectralCentroidPerBeat.length;
    const vocalPercentage = isVocalPerBeat.filter(v => v).length / isVocalPerBeat.length;

    // MOOD: Estimación MEJORADA basada en características espectrales
    // Arousal (Energía): Basado en RMS promedio y varianza
    const arousal = Math.min(1, Math.max(0, avgEnergy * 4)); // Normalizar RMS a 0-1
    
    // Valence (Positividad): Basado en brillo espectral, modo mayor/menor
    // Sonidos más brillantes (centroid alto) tienden a ser más positivos
    // Energía alta también contribuye a positividad
    const normalizedCentroid = avgCentroid / sampleRate;
    const brightnessScore = Math.min(1, normalizedCentroid * 8);
    const energyContribution = Math.min(1, avgEnergy * 3);
    const valence = Math.min(1, Math.max(0, (brightnessScore * 0.6 + energyContribution * 0.4)));

    // DANCEABILITY: Estimación basada en energía y regularidad rítmica
    // Canciones bailables tienen energía alta y consistente
    const energyVariance = energyPerBeat.reduce((sum, e) => {
        return sum + Math.pow(e - avgEnergy, 2);
    }, 0) / energyPerBeat.length;
    
    const energyConsistency = 1 - Math.min(1, energyVariance * 100);
    const danceability = (avgEnergy * 3 + energyConsistency) / 4;

    // GÉNERO: Clasificación simple basada en características
    let genre = 'Unknown';
    if (avgEnergy > 0.15 && normalizedCentroid > 0.1) {
        genre = 'Electronic/Dance';
    } else if (avgEnergy > 0.12 && vocalPercentage > 0.4) {
        genre = 'Pop/Urban';
    } else if (avgEnergy < 0.08) {
        genre = 'Ambient/Chill';
    } else if (normalizedCentroid < 0.08) {
        genre = 'Hip-Hop/R&B';
    } else {
        genre = 'Pop/Rock';
    }

    // ========================================================================
    // DETECCIÓN DE ESTRUCTURA MUSICAL
    // ========================================================================
    
    // console.log(`   🏗️  Detectando estructura musical (intro, outro, drops, builds)...`);
    
    const structure = detectMusicalStructure(energyPerBeat, beats);

    // Logs deshabilitados

    return { 
        energyPerBeat, 
        isVocalPerBeat,
        spectralCentroidPerBeat,
        mood: { valence, arousal },
        danceability,
        genre,
        structure
    };
}

/**
 * Detecta la estructura musical de una canción
 * Identifica intro, outro, drops, builds y secciones de energía
 */
function detectMusicalStructure(
    energyPerBeat: number[],
    beats: Beat[]
): AdvancedAnalysis['structure'] {
    const avgEnergy = energyPerBeat.reduce((a, b) => a + b, 0) / energyPerBeat.length;
    
    // 1. DETECTAR INTRO (primeros 20-30% con energía baja)
    const introThreshold = avgEnergy * 0.7;
    const introMaxBeats = Math.floor(energyPerBeat.length * 0.3);
    let introEnd = 0;
    
    for (let i = 0; i < introMaxBeats; i++) {
        if (energyPerBeat[i] > introThreshold) {
            introEnd = i;
            break;
        }
    }
    
    const intro = introEnd > 8 ? {
        start: beats[0].start,
        end: beats[introEnd].start
    } : null;
    
    // 2. DETECTAR OUTRO (últimos 20-30% con energía decreciente)
    const outroThreshold = avgEnergy * 0.6;
    const outroMinBeats = Math.floor(energyPerBeat.length * 0.7);
    let outroStart = energyPerBeat.length;
    
    for (let i = energyPerBeat.length - 1; i >= outroMinBeats; i--) {
        if (energyPerBeat[i] > outroThreshold) {
            outroStart = i;
            break;
        }
    }
    
    const outro = outroStart < energyPerBeat.length - 8 ? {
        start: beats[outroStart].start,
        end: beats[beats.length - 1].start + beats[beats.length - 1].duration
    } : null;
    
    // 3. DETECTAR DROPS (caídas súbitas de energía)
    const drops: number[] = [];
    const dropThreshold = avgEnergy * 0.4; // Caída de al menos 40%
    
    for (let i = 4; i < energyPerBeat.length - 4; i++) {
        const prevAvg = (energyPerBeat[i-4] + energyPerBeat[i-3] + energyPerBeat[i-2] + energyPerBeat[i-1]) / 4;
        const nextAvg = (energyPerBeat[i] + energyPerBeat[i+1] + energyPerBeat[i+2] + energyPerBeat[i+3]) / 4;
        
        if (prevAvg > avgEnergy * 1.2 && nextAvg < prevAvg * 0.6) {
            drops.push(i);
            i += 8; // Evitar detectar el mismo drop múltiples veces
        }
    }
    
    // 4. DETECTAR BUILDS (aumentos graduales de energía)
    const builds: number[] = [];
    const buildWindow = 8; // Ventana de 8 beats
    
    for (let i = buildWindow; i < energyPerBeat.length - buildWindow; i++) {
        const prevAvg = energyPerBeat.slice(i - buildWindow, i).reduce((a, b) => a + b, 0) / buildWindow;
        const nextAvg = energyPerBeat.slice(i, i + buildWindow).reduce((a, b) => a + b, 0) / buildWindow;
        
        // Build: aumento gradual de al menos 50%
        if (nextAvg > prevAvg * 1.5 && prevAvg < avgEnergy) {
            builds.push(i);
            i += buildWindow; // Evitar detectar el mismo build múltiples veces
        }
    }
    
    // 5. DIVIDIR EN SECCIONES DE ENERGÍA
    const sections: AdvancedAnalysis['structure']['sections'] = [];
    const sectionSize = Math.max(16, Math.floor(energyPerBeat.length / 10)); // Secciones de ~16 beats
    
    for (let i = 0; i < energyPerBeat.length; i += sectionSize) {
        const end = Math.min(i + sectionSize, energyPerBeat.length);
        const sectionEnergy = energyPerBeat.slice(i, end);
        const sectionAvg = sectionEnergy.reduce((a, b) => a + b, 0) / sectionEnergy.length;
        
        let type: 'low' | 'medium' | 'high' = 'medium';
        if (sectionAvg < avgEnergy * 0.7) type = 'low';
        else if (sectionAvg > avgEnergy * 1.3) type = 'high';
        
        sections.push({
            start: beats[i].start,
            end: beats[end - 1].start + beats[end - 1].duration,
            type,
            avgEnergy: sectionAvg
        });
    }
    
    // 6. DETECTAR FRASES MUSICALES (4, 8, 16, 32 beats)
    const phrases: AdvancedAnalysis['structure']['phrases'] = [];
    
    // La música típicamente se estructura en frases de 4, 8, 16 o 32 beats
    // Detectamos estas estructuras para mezclar solo en inicios de frase
    const phraseLengths = [32, 16, 8, 4]; // Probar de mayor a menor
    
    for (const phraseLength of phraseLengths) {
        for (let i = 0; i < energyPerBeat.length; i += phraseLength) {
            if (i + phraseLength <= energyPerBeat.length) {
                // Verificar si este es un "downbeat" (inicio de frase)
                // Los downbeats típicamente tienen energía ligeramente mayor
                const beatEnergy = energyPerBeat[i];
                const prevEnergy = i > 0 ? energyPerBeat[i - 1] : 0;
                const isDownbeat = beatEnergy >= prevEnergy * 0.95; // Tolerancia del 5%
                
                phrases.push({
                    startBeat: i,
                    endBeat: Math.min(i + phraseLength, energyPerBeat.length) - 1,
                    length: phraseLength as 4 | 8 | 16 | 32,
                    isDownbeat
                });
            }
        }
    }
    
    // Ordenar por startBeat y eliminar duplicados
    const uniquePhrases = phrases
        .sort((a, b) => a.startBeat - b.startBeat)
        .filter((phrase, index, arr) => 
            index === 0 || phrase.startBeat !== arr[index - 1].startBeat
        );
    
    return {
        intro,
        outro,
        drops,
        builds,
        sections,
        phrases: uniquePhrases
    };
}

/**
 * Normaliza los valores de energía para que estén en el rango 0-1
 * Esto facilita la comparación entre canciones
 */
export function normalizeEnergy(energyArray: number[]): number[] {
    const max = Math.max(...energyArray);
    if (max === 0) return energyArray.map(() => 0);
    return energyArray.map(e => e / max);
}
