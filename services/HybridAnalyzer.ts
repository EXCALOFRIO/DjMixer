/**
 * Hybrid Analyzer - Sincronización inteligente
 * 
 * Combina:
 * - Análisis semántico de Gemini (QUÉ y PORQUÉ)
 * - Análisis rítmico de Essentia (CUÁNDO exacto)
 * 
 * Resultado: Transiciones perfectas musical y técnicamente
 */

import type { Beat } from '../types';
import type { GeminiAnalysisResult } from './GeminiAnalyzer';

export interface SyncedTransitionPoint {
    beatIndex: number;          // Índice del beat sincronizado
    beatTime: number;           // Tiempo exacto del beat
    isDownbeat: boolean;        // Si es el "1" del compás
    geminiTime: number;         // Tiempo original de Gemini
    geminiReason: string;       // Por qué Gemini lo sugirió
    geminiQuality: 'excellent' | 'good' | 'fair';
    sectionType: string;        // Tipo de sección (chorus, outro, etc.)
}

export interface SyncedSection {
    type: 'intro' | 'verse' | 'pre-chorus' | 'chorus' | 'bridge' | 'outro' | 'instrumental';
    text: string;
    startBeatIndex: number;     // Beat más cercano al inicio
    endBeatIndex: number;       // Beat más cercano al final
    startTime: number;          // Tiempo original de Gemini
    endTime: number;            // Tiempo original de Gemini
}

/**
 * Sincronizar timestamps de Gemini con beat grid de Essentia
 */
export function syncGeminiWithBeats(
    geminiAnalysis: GeminiAnalysisResult,
    beats: Beat[]
): {
    syncedSections: SyncedSection[];
    syncedTransitionPoints: SyncedTransitionPoint[];
} {
    const syncedSections: SyncedSection[] = geminiAnalysis.structure.sections.map(section => {
        const startBeatIndex = findNearestDownbeat(section.startTime, beats);
        const endBeatIndex = findNearestDownbeat(section.endTime, beats);

        return {
            type: section.type,
            text: section.text,
            startBeatIndex,
            endBeatIndex,
            startTime: section.startTime,
            endTime: section.endTime
        };
    });

    const syncedTransitionPoints: SyncedTransitionPoint[] = geminiAnalysis.structure.transitionPoints.map(point => {
        const beatIndex = findNearestDownbeat(point.time, beats);
        const beat = beats[beatIndex];
        
        const section = syncedSections.find(s => 
            beatIndex >= s.startBeatIndex && beatIndex <= s.endBeatIndex
        );

        return {
            beatIndex,
            beatTime: beat.start,
            isDownbeat: beat.isDownbeat,
            geminiTime: point.time,
            geminiReason: point.reason,
            geminiQuality: point.quality,
            sectionType: section?.type || 'unknown'
        };
    });

    // console.log(`   ✅ ${syncedSections.length} secciones | ${syncedTransitionPoints.length} puntos`);
    // console.log(`   🎯 Precisión: ${calculateSyncAccuracy(syncedTransitionPoints)}s`);

    return {
        syncedSections,
        syncedTransitionPoints
    };
}

/**
 * VERSIÓN CORREGIDA Y PRECISA: Busca el beat más cercano dentro de una ventana de tolerancia.
 * Prioriza los downbeats, pero no se aleja del tiempo original sugerido por Gemini.
 */
function findNearestDownbeat(targetTime: number, beats: Beat[], tolerance: number = 2.0): number {
    let bestBeatIndex = -1;
    let minDistance = tolerance; // Solo considera beats dentro de la ventana de tolerancia

    for (let i = 0; i < beats.length; i++) {
        const beat = beats[i];
        const distance = Math.abs(beat.start - targetTime);

        if (distance < tolerance) {
            // Este beat está dentro de la ventana de tolerancia
            // Le damos un "bonus" si es un downbeat para priorizarlo
            const priorityDistance = beat.isDownbeat ? distance - 0.1 : distance;

            if (bestBeatIndex === -1 || priorityDistance < minDistance) {
                minDistance = priorityDistance;
                bestBeatIndex = i;
            }
        }
    }

    // Si no se encontró ningún beat dentro de la tolerancia, busca el más cercano sin importar la distancia
    // (esto es un fallback de seguridad)
    if (bestBeatIndex === -1) {
        let absoluteMinDistance = Infinity;
        for (let i = 0; i < beats.length; i++) {
            const distance = Math.abs(beats[i].start - targetTime);
            if (distance < absoluteMinDistance) {
                absoluteMinDistance = distance;
                bestBeatIndex = i;
            }
        }
    }

    return bestBeatIndex;
}

function calculateSyncAccuracy(points: SyncedTransitionPoint[]): string {
    if (points.length === 0) return '0.0';
    const totalDiff = points.reduce((sum, point) => 
        sum + Math.abs(point.beatTime - point.geminiTime), 0);
    return (totalDiff / points.length).toFixed(2);
}

export function findSectionForBeat(
    syncedSections: SyncedSection[],
    beatIndex: number
): SyncedSection | null {
    return syncedSections.find(section =>
        beatIndex >= section.startBeatIndex && beatIndex <= section.endBeatIndex
    ) || null;
}

export function isNearSuggestedPoint(
    beatIndex: number,
    syncedPoints: SyncedTransitionPoint[],
    tolerance: number = 8
): SyncedTransitionPoint | null {
    return syncedPoints.find(point =>
        Math.abs(point.beatIndex - beatIndex) <= tolerance
    ) || null;
}

export function calculateStructuralCompatibility(
    fromSection: SyncedSection | null,
    toSection: SyncedSection | null
): { score: number; reason: string } {
    if (!fromSection || !toSection) {
        return { score: 50, reason: 'Sección desconocida' };
    }

    const compatibility: Record<string, Record<string, { score: number; reason: string }>> = {
        'outro': {
            'intro': { score: 300, reason: 'Transición natural outro → intro' },
            'verse': { score: 200, reason: 'Outro → verso funciona bien' },
            'instrumental': { score: 250, reason: 'Outro → instrumental es limpio' }
        },
        'chorus': {
            'chorus': { score: 250, reason: 'Estribillo → estribillo mantiene energía' },
            'verse': { score: 150, reason: 'Estribillo → verso reduce energía gradualmente' },
            'bridge': { score: 180, reason: 'Estribillo → puente crea tensión' }
        },
        'instrumental': {
            'intro': { score: 280, reason: 'Instrumental → intro es muy limpio' },
            'verse': { score: 220, reason: 'Instrumental → verso permite entrada suave' },
            'chorus': { score: 200, reason: 'Instrumental → estribillo crea impacto' }
        },
        'verse': {
            'verse': { score: 150, reason: 'Verso → verso mantiene narrativa' },
            'chorus': { score: 180, reason: 'Verso → estribillo aumenta energía' }
        },
        'bridge': {
            'chorus': { score: 220, reason: 'Puente → estribillo es clásico' },
            'outro': { score: 180, reason: 'Puente → outro cierra bien' }
        }
    };

    const match = compatibility[fromSection.type]?.[toSection.type];
    return match || { score: 100, reason: `${fromSection.type} → ${toSection.type}` };
}

export function calculateThematicConnection(
    fromThemes: string[],
    toThemes: string[]
): { sharedThemes: string[]; connectionStrength: number; score: number } {
    const sharedThemes = fromThemes.filter(theme => toThemes.includes(theme));
    const connectionStrength = sharedThemes.length / Math.max(fromThemes.length, toThemes.length, 1);
    const score = Math.round(connectionStrength * 200);

    return { sharedThemes, connectionStrength, score };
}

export function calculateMoodCompatibility(
    fromMood: { energy: string; emotion: string },
    toMood: { energy: string; emotion: string }
): { score: number; reason: string } {
    const energyLevels = { 'low': 1, 'medium': 2, 'high': 3 };
    const fromEnergy = energyLevels[fromMood.energy as keyof typeof energyLevels] || 2;
    const toEnergy = energyLevels[toMood.energy as keyof typeof energyLevels] || 2;
    const energyDiff = Math.abs(fromEnergy - toEnergy);

    const emotionCompatibility: Record<string, string[]> = {
        'happy': ['happy', 'excited', 'romantic'],
        'excited': ['excited', 'happy', 'angry'],
        'romantic': ['romantic', 'happy', 'calm'],
        'calm': ['calm', 'romantic', 'sad'],
        'sad': ['sad', 'calm', 'romantic'],
        'angry': ['angry', 'excited']
    };

    const compatibleEmotions = emotionCompatibility[fromMood.emotion] || [];
    const emotionMatch = compatibleEmotions.includes(toMood.emotion);

    let score = 100 - (energyDiff * 20);
    score += emotionMatch ? 50 : -30;

    const reason = `Energía: ${fromMood.energy} → ${toMood.energy} | ${emotionMatch ? 'Compatible' : 'Cambio'}: ${fromMood.emotion} → ${toMood.emotion}`;

    return { score: Math.max(0, Math.min(200, score)), reason };
}

export function logHybridAnalysis(
    songName: string,
    syncedSections: SyncedSection[],
    syncedPoints: SyncedTransitionPoint[]
): void {
    // Logs deshabilitados para no llenar la consola
    // Solo mostrar resumen
    // console.log(`\n📊 "${songName}"`);
    // console.log('═'.repeat(80));
    // console.log('\n🎵 Secciones:');
    // ... resto de logs comentados
}
