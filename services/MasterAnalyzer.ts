/**
 * Master Analyzer - Sistema de análisis completo
 * 
 * Integra:
 * 1. Análisis técnico (Essentia + Meyda): Beats, energía, vocales, espectro
 * 2. Análisis semántico (Gemini 2.5 Flash): Letras, estructura, temas, mood
 * 3. Sincronización híbrida: Combina ambos análisis de forma inteligente
 */

import type { Song, Beat } from '../types';
import { analyzeSongAdvanced } from './AudioAnalyzer';
import { geminiAnalyzer } from './GeminiAnalyzer';
import { syncGeminiWithBeats, logHybridAnalysis } from './HybridAnalyzer';

export interface MasterAnalysisResult {
    technical: {
        beats: Beat[];
        energyPerBeat: number[];
        isVocalPerBeat: boolean[];
        spectralCentroidPerBeat: number[];
        tempo: number;
        key: number;
        mode: number;
        duration: number;
    };

    semantic?: {
        transcription: string;
        sections: Array<{
            type: 'intro' | 'verse' | 'pre-chorus' | 'chorus' | 'bridge' | 'outro' | 'instrumental';
            text: string;
            startBeatIndex: number;
            endBeatIndex: number;
            startTime: number;
            endTime: number;
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

    hasGeminiAnalysis: boolean;
    analysisTime: number;
}

/**
 * Análisis completo de una canción
 */
export async function analyzeSongComplete(
    audioFile: File,
    audioBuffer: AudioBuffer,
    beats: Beat[],
    useGemini: boolean = true
): Promise<MasterAnalysisResult> {
    const startTime = Date.now();

    // Logs deshabilitados

    // Fase 1: Análisis técnico
    // console.log('⚡ Análisis técnico (Essentia + Meyda)...');
    const technicalAnalysis = await analyzeSongAdvanced(audioBuffer, beats);

    const result: MasterAnalysisResult = {
        technical: {
            beats,
            energyPerBeat: technicalAnalysis.energyPerBeat,
            isVocalPerBeat: technicalAnalysis.isVocalPerBeat,
            spectralCentroidPerBeat: technicalAnalysis.spectralCentroidPerBeat,
            tempo: 0, // Se llenará después
            key: 0,
            mode: 0,
            duration: audioBuffer.duration
        },
        hasGeminiAnalysis: false,
        analysisTime: 0
    };

    // Fase 2: Análisis semántico con Gemini
    if (useGemini) {
        try {
            // console.log('🧠 Análisis semántico (Gemini 2.5 Flash)...');
            // console.log('   ⏳ Esto puede tardar 10-30 segundos...');

            const geminiResult = await geminiAnalyzer.analyzeSong(audioFile, audioBuffer.duration);

            // Fase 3: Sincronización híbrida
            // console.log('🔄 Sincronización híbrida...');
            const synced = syncGeminiWithBeats(geminiResult, beats);

            result.semantic = {
                transcription: geminiResult.transcription,
                sections: synced.syncedSections.map(s => ({
                    type: s.type,
                    text: s.text,
                    startBeatIndex: s.startBeatIndex,
                    endBeatIndex: s.endBeatIndex,
                    startTime: s.startTime,
                    endTime: s.endTime
                })),
                themes: geminiResult.structure.themes,
                mood: {
                    energy: geminiResult.structure.mood.energy,
                    emotion: geminiResult.structure.mood.emotion
                },
                transitionPoints: synced.syncedTransitionPoints.map(p => ({
                    beatIndex: p.beatIndex,
                    beatTime: p.beatTime,
                    isDownbeat: p.isDownbeat,
                    reason: p.geminiReason,
                    quality: p.geminiQuality
                }))
            };

            result.hasGeminiAnalysis = true;

            logHybridAnalysis(
                audioFile.name,
                synced.syncedSections,
                synced.syncedTransitionPoints
            );

        } catch (error) {
            // Silencioso - usar caché si está disponible
            // console.warn('⚠️ Análisis Gemini falló:', error);
            result.hasGeminiAnalysis = false;
        }
    } else {
        // console.log('⏭️  Análisis Gemini desactivado');
    }

    result.analysisTime = Date.now() - startTime;

    // console.log('═'.repeat(80));
    // console.log(`✅ Completo en ${(result.analysisTime / 1000).toFixed(1)}s`);
    // console.log(`   Técnico: ✅ | Gemini: ${result.hasGeminiAnalysis ? '✅' : '❌'}`);
    // console.log('═'.repeat(80));

    return result;
}

/**
 * Integrar análisis en el objeto Song
 * CORREGIDO: Ahora crea la estructura 'advanced' si no existe
 */
export function integrateAnalysisIntoSong(
    song: Song,
    masterAnalysis: MasterAnalysisResult
): void {
    // CRÍTICO: Crear la estructura 'advanced' si no existe
    if (!song.analysis.advanced) {
        song.analysis.advanced = {} as any;
    }

    // CRÍTICO: Actualizar los beats con la información de downbeats
    // Los beats del worker tienen isDownbeat, debemos preservarlos

    // DEBUG: Verificar si los beats tienen isDownbeat ANTES de actualizar
    const downbeatsBeforeUpdate = masterAnalysis.technical.beats.filter(b => b.isDownbeat).length;
    // console.log(`   🔍 DEBUG: Beats recibidos: ${masterAnalysis.technical.beats.length}, Downbeats: ${downbeatsBeforeUpdate}`);

    song.analysis.beats = masterAnalysis.technical.beats;

    // Integrar datos técnicos avanzados
    song.analysis.advanced.energyPerBeat = masterAnalysis.technical.energyPerBeat;
    song.analysis.advanced.isVocalPerBeat = masterAnalysis.technical.isVocalPerBeat;
    song.analysis.advanced.spectralCentroidPerBeat = masterAnalysis.technical.spectralCentroidPerBeat;

    // Integrar datos semánticos de Gemini si existen
    if (masterAnalysis.hasGeminiAnalysis && masterAnalysis.semantic) {
        song.analysis.advanced.gemini = {
            transcription: masterAnalysis.semantic.transcription,
            lyricSections: masterAnalysis.semantic.sections,
            themes: masterAnalysis.semantic.themes,
            mood: masterAnalysis.semantic.mood,
            transitionPoints: masterAnalysis.semantic.transitionPoints
        };
        console.log(`✅ Datos de Gemini integrados para "${song.name}"`);

        // Verificar downbeats DESPUÉS de actualizar
        const downbeatCount = song.analysis.beats.filter(b => b.isDownbeat).length;
        console.log(`   🎯 ${downbeatCount} downbeats preservados de ${song.analysis.beats.length} beats`);

        if (downbeatCount === 0) {
            console.error(`   ❌ ERROR: ¡No hay downbeats! Verificar worker.`);
        }
    } else {
        console.log(`⚠️ Sin datos de Gemini para "${song.name}"`);

        // Verificar downbeats incluso sin Gemini
        const downbeatCount = song.analysis.beats.filter(b => b.isDownbeat).length;
        console.log(`   🎯 ${downbeatCount} downbeats de ${song.analysis.beats.length} beats`);
    }
}
