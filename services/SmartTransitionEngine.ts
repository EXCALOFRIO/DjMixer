/**
 * Smart Transition Engine V2.0
 * 
 * Sistema inteligente de transiciones que:
 * 1. Prioriza transiciones en CUALQUIER punto de la canción (no solo al final)
 * 2. Evita silencios y partes aburridas
 * 3. Usa tipos de transición simples pero efectivos
 * 4. Maximiza la variedad y minimiza la repetición
 */

import type { Song, Beat } from '../types';

export interface SmartTransitionPoint {
    songIndex: number;
    beatIndex: number;
    time: number;
    score: number;
    reason: string;
    position: 'early' | 'middle' | 'late';  // Posición en la canción
    quality: 'excellent' | 'good' | 'fair';
    transitionType: 'crossfade' | 'cut' | 'beatmatch';
}

export interface TransitionCandidate {
    from: SmartTransitionPoint;
    to: SmartTransitionPoint;
    totalScore: number;
    breakdown: {
        pointQuality: number;  // Calidad de los puntos (lo más importante)
        structure: number;     // Downbeats, fraseo
        harmony: number;       // Compatibilidad de clave
        energy: number;        // Energía similar
        mood: number;          // Mood compatible
        variety: number;       // Bonus por variedad
        gemini: number;        // Puntos de transición sugeridos
    };
    playbackRate: number;
    crossfadeDuration: number;
}

export class SmartTransitionEngine {
    private songs: Song[];
    private usedSegments: Map<string, Set<number>> = new Map(); // songId -> Set<beatIndex>

    constructor(songs: Song[]) {
        this.songs = songs;
    }

    /**
     * 🎧 ESTRATEGIA DE DJ REAL V3.0
     * Encontrar puntos de transición SOLO en límites entre secciones musicales
     * Un DJ nunca corta en medio de un verso o coro, solo entre ellos
     */
    findAllTransitionPoints(song: Song, songIndex: number): SmartTransitionPoint[] {
        const points: SmartTransitionPoint[] = [];
        const beats = song.analysis.beats;
        const duration = song.analysis.track.duration;
        const gemini = song.analysis.advanced?.gemini;

        // Dividir la canción en tercios
        const earlyEnd = duration * 0.33;
        const middleEnd = duration * 0.67;

        if (gemini && gemini.lyricSections && gemini.lyricSections.length > 0) {
            // ✅ CON GEMINI: Buscar transiciones SOLO en límites de secciones
            console.log(`   🎵 ${song.name}: Buscando transiciones en límites de secciones`);
            
            const sections = gemini.lyricSections;
            
            // Para cada sección, buscar el beat más cercano al FINAL de la sección
            // Esto permite salir después de completar un verso, coro, etc.
            for (let s = 0; s < sections.length; s++) {
                const section = sections[s];
                const nextSection = sections[s + 1];
                
                // Buscar el beat más cercano al final de esta sección
                const sectionEndBeat = beats.findIndex(b => b.start >= section.endTime);
                if (sectionEndBeat === -1) continue;
                
                // Determinar posición
                let position: 'early' | 'middle' | 'late';
                if (section.endTime < earlyEnd) position = 'early';
                else if (section.endTime < middleEnd) position = 'middle';
                else position = 'late';
                
                // Calcular score basado en el tipo de sección
                const pointScore = this.scoreSectionBoundary(song, section, nextSection, sectionEndBeat, position);
                
                points.push({
                    songIndex,
                    beatIndex: sectionEndBeat,
                    time: section.endTime,
                    score: pointScore.score,
                    reason: `Después de ${section.type} | ${pointScore.reason}`,
                    position,
                    quality: pointScore.quality,
                    transitionType: pointScore.transitionType
                });
                
                console.log(`      ✓ Límite: ${section.type} → ${nextSection?.type || 'fin'} (${section.endTime.toFixed(1)}s, score: ${pointScore.score})`);
            }
            
            // También agregar el inicio de la canción como punto de entrada
            points.push({
                songIndex,
                beatIndex: 0,
                time: 0,
                score: 150,
                reason: 'Inicio de canción',
                position: 'early',
                quality: 'excellent',
                transitionType: 'crossfade'
            });
            
        } else {
            // ❌ SIN GEMINI: Usar lógica antigua (buscar en downbeats)
            console.log(`   ⚠️  ${song.name}: Sin Gemini, usando downbeats`);
            
            for (let i = 0; i < beats.length; i++) {
                const beat = beats[i];
                
                // Solo considerar downbeats (beats fuertes)
                if (!beat.isDownbeat) continue;
                
                // Determinar posición
                let position: 'early' | 'middle' | 'late';
                if (beat.start < earlyEnd) position = 'early';
                else if (beat.start < middleEnd) position = 'middle';
                else position = 'late';
                
                // Calcular score base del punto
                const pointScore = this.scoreTransitionPoint(song, i, position, gemini);
                
                if (pointScore.score > 50) { // Solo puntos decentes
                    points.push({
                        songIndex,
                        beatIndex: i,
                        time: beat.start,
                        score: pointScore.score,
                        reason: pointScore.reason,
                        position,
                        quality: pointScore.quality,
                        transitionType: pointScore.transitionType
                    });
                }
            }
        }

        // Ordenar por score (mejores primero)
        return points.sort((a, b) => b.score - a.score);
    }
    
    /**
     * 🎯 Evaluar la calidad de un límite entre secciones como punto de transición
     */
    private scoreSectionBoundary(
        song: Song,
        section: any,
        nextSection: any | undefined,
        beatIndex: number,
        position: 'early' | 'middle' | 'late'
    ): { score: number; reason: string; quality: 'excellent' | 'good' | 'fair'; transitionType: 'crossfade' | 'cut' | 'beatmatch' } {
        let score = 100; // Base score para cualquier límite de sección
        let reason = '';
        let quality: 'excellent' | 'good' | 'fair' = 'fair';
        let transitionType: 'crossfade' | 'cut' | 'beatmatch' = 'crossfade';
        
        // Evaluar según el tipo de sección que TERMINA
        if (section.type === 'chorus') {
            score += 200; // Salir después de un coro es EXCELENTE
            reason += 'Post-coro ⭐⭐⭐';
            quality = 'excellent';
            transitionType = 'beatmatch';
        } else if (section.type === 'instrumental') {
            score += 180; // Salir de instrumental es muy bueno
            reason += 'Post-instrumental ⭐⭐';
            quality = 'excellent';
            transitionType = 'crossfade';
        } else if (section.type === 'bridge') {
            score += 150; // Puente es buen momento
            reason += 'Post-puente ⭐';
            quality = 'good';
        } else if (section.type === 'verse') {
            score += 120; // Verso es aceptable
            reason += 'Post-verso';
            quality = 'good';
        } else if (section.type === 'outro') {
            score += 100; // Outro es natural pero menos interesante
            reason += 'Post-outro';
            quality = 'fair';
        } else if (section.type === 'intro') {
            score += 80; // Intro es menos ideal
            reason += 'Post-intro';
            quality = 'fair';
        }
        
        // Bonus si el siguiente es un coro (entrar a un coro es genial)
        if (nextSection && nextSection.type === 'chorus') {
            score += 50;
            reason += ' → Pre-coro';
        }
        
        // Bonus por posición (preferir middle/late)
        if (position === 'middle') {
            score += 30;
        } else if (position === 'late') {
            score += 20;
        }
        
        // Bonus si es downbeat
        const beat = song.analysis.beats[beatIndex];
        if (beat && beat.isDownbeat) {
            score += 30;
            reason += ' | Downbeat';
        }
        
        return { score, reason, quality, transitionType };
    }

    /**
     * Evaluar qué tan bueno es un punto para hacer una transición
     * BASADO EN CALIDAD, NO EN POSICIÓN
     */
    private scoreTransitionPoint(
        song: Song,
        beatIndex: number,
        position: 'early' | 'middle' | 'late',
        gemini: any
    ): { score: number; reason: string; quality: 'excellent' | 'good' | 'fair'; transitionType: 'crossfade' | 'cut' | 'beatmatch' } {
        let score = 0; // Empezamos en 0, solo sumamos por calidad
        let reason = '';
        let quality: 'excellent' | 'good' | 'fair' = 'fair';
        let transitionType: 'crossfade' | 'cut' | 'beatmatch' = 'crossfade';

        const beat = song.analysis.beats[beatIndex];
        const beatTime = beat.start;
        const advanced = song.analysis.advanced;

        // 1. SECCIÓN MUSICAL (de Gemini) - LO MÁS IMPORTANTE
        if (gemini) {
            const section = gemini.lyricSections.find((s: any) =>
                beatTime >= s.startTime && beatTime <= s.endTime
            );

            if (section) {
                // Priorizar ciertos tipos de secciones por su calidad musical (V2.1 - Mejorado)
                if (section.type === 'chorus') {
                    score += 250; // MÁXIMA PRIORIDAD (estribillos son lo mejor)
                    reason += 'Estribillo ⭐⭐⭐ | ';
                    quality = 'excellent';
                    transitionType = 'beatmatch';
                } else if (section.type === 'instrumental') {
                    score += 200; // Muy bueno (sin vocales, fácil de mezclar)
                    reason += 'Instrumental ⭐⭐ | ';
                    quality = 'excellent';
                    transitionType = 'crossfade';
                } else if (section.type === 'bridge') {
                    score += 150; // Bueno (momento de tensión/cambio)
                    reason += 'Puente ⭐ | ';
                    quality = 'good';
                    transitionType = 'crossfade';
                } else if (section.type === 'pre-chorus') {
                    score += 130; // Bueno (build-up hacia el estribillo)
                    reason += 'Pre-estribillo | ';
                    quality = 'good';
                } else if (section.type === 'outro') {
                    score += 100; // Aceptable (final natural)
                    reason += 'Outro | ';
                    quality = 'fair';
                    transitionType = 'cut';
                } else if (section.type === 'intro') {
                    score += 80; // Aceptable (inicio limpio)
                    reason += 'Intro | ';
                    quality = 'fair';
                } else if (section.type === 'verse') {
                    score += 50; // Menos ideal (narrativa, más difícil de mezclar)
                    reason += 'Verso | ';
                    quality = 'fair';
                }
            }
        }

        // 2. PUNTO DE TRANSICIÓN SUGERIDO POR GEMINI - MUY IMPORTANTE
        if (gemini) {
            const nearPoint = gemini.transitionPoints.find((p: any) =>
                Math.abs(p.beatTime - beatTime) < 2.0
            );

            if (nearPoint) {
                if (nearPoint.quality === 'excellent') {
                    score += 200; // MÁXIMO (Gemini dice que es perfecto)
                    reason += 'Gemini: Excelente ⭐⭐⭐ | ';
                    quality = 'excellent';
                } else if (nearPoint.quality === 'good') {
                    score += 150; // Muy bueno
                    reason += 'Gemini: Bueno ⭐⭐ | ';
                    if (quality !== 'excellent') quality = 'good';
                } else {
                    score += 100; // Bueno
                    reason += 'Gemini: Aceptable ⭐ | ';
                }
            }
        }

        // 3. ENERGÍA (evitar partes muy bajas de energía) - V2.1 Mejorado + Validación de contexto
        if (advanced) {
            const energy = advanced.energyPerBeat[beatIndex] || 0;
            
            // VALIDACIÓN ADICIONAL: Verificar energía en beats cercanos (contexto)
            const contextRange = 4; // Verificar 4 beats antes y después
            let avgContextEnergy = energy;
            let contextCount = 1;
            
            for (let offset = -contextRange; offset <= contextRange; offset++) {
                const checkIndex = beatIndex + offset;
                if (checkIndex >= 0 && checkIndex < advanced.energyPerBeat.length && offset !== 0) {
                    avgContextEnergy += advanced.energyPerBeat[checkIndex] || 0;
                    contextCount++;
                }
            }
            avgContextEnergy /= contextCount;

            // Si el contexto también es bajo, penalizar MÁS
            const isLowEnergyContext = avgContextEnergy < 0.2;

            if (energy < 0.05) {
                score -= isLowEnergyContext ? 500 : 300; // RECHAZAR EXTREMO si contexto también es bajo
                reason += '❌ Silencio total | ';
            } else if (energy < 0.15) {
                score -= isLowEnergyContext ? 300 : 150; // RECHAZAR FUERTE
                reason += '❌ Energía muy baja | ';
            } else if (energy < 0.25) {
                score -= isLowEnergyContext ? 100 : 50; // Penalización
                reason += '⚠️ Energía baja | ';
            } else if (energy > 0.7) {
                score += 150; // BONUS GRANDE (muy alta energía)
                reason += '🔥🔥 Energía máxima | ';
            } else if (energy > 0.5) {
                score += 100; // BONUS (alta energía)
                reason += '🔥 Alta energía | ';
            } else if (energy > 0.35) {
                score += 60; // Bonus moderado
                reason += 'Energía media-alta | ';
            }

            // Evitar vocales (mejor mezclar en instrumentales) - V2.1 Mejorado
            const hasVocal = advanced.isVocalPerBeat[beatIndex];
            if (!hasVocal) {
                score += 120; // BONUS MÁS GRANDE (muy importante para mezclas)
                reason += '🎵 Sin vocales | ';
            } else {
                score -= 30; // Penalización mayor
                reason += '🎤 Con vocales | ';
            }
        }

        // 4. PENALIZAR SI YA SE USÓ ESTE SEGMENTO - V2.1 Más fuerte
        const usedBeats = this.usedSegments.get(song.id);
        if (usedBeats?.has(beatIndex)) {
            score -= 500; // PENALIZACIÓN EXTREMA (evitar repetición)
            reason += '🔁 YA USADO | ';
        }

        // 5. BONUS POR DOWNBEAT - V2.4 (antes era obligatorio, ahora es bonus)
        if (beat.isDownbeat) {
            score += 100; // BONUS GRANDE por estar en el "1" del compás
            reason += '🎯 Downbeat | ';
        } else {
            reason += '⚪ Off-beat | ';
        }

        // 6. BONUS ADICIONAL: Variedad de posiciones
        // Priorizar medio y final sobre inicio (más interesante musicalmente)
        if (position === 'middle' && score > 200) {
            score += 50; // Bonus medio (parte más interesante)
            reason += '📍 Medio | ';
        } else if (position === 'late' && score > 150) {
            score += 40; // Bonus final (clímax musical)
            reason += '📍 Final | ';
        } else if (position === 'early' && score > 100) {
            score += 20; // Bonus pequeño inicio
            reason += '📍 Inicio | ';
        }

        return { score, reason, quality, transitionType };
    }

    // Historial de transiciones estructurales (para variedad)
    private structuralHistory: Array<{ from: string; to: string }> = [];

    /**
     * Calcular score de una transición completa (from -> to)
     * BASADO EN CALIDAD DE LOS PUNTOS, NO EN POSICIÓN
     * V2.2 - MEJORAS: Armonía prioritaria, tempo moderado, variedad estructural
     */
    calculateTransitionScore(
        from: SmartTransitionPoint,
        to: SmartTransitionPoint
    ): TransitionCandidate {
        const fromSong = this.songs[from.songIndex];
        const toSong = this.songs[to.songIndex];

        const breakdown = {
            pointQuality: 0,   // Calidad de los puntos (lo más importante)
            structure: 0,      // Downbeats, fraseo
            harmony: 0,        // Compatibilidad de clave
            energy: 0,         // Energía similar
            mood: 0,           // Mood compatible
            variety: 0,        // Bonus por variedad
            gemini: 0          // Puntos de transición sugeridos
        };

        // 1. CALIDAD DE LOS PUNTOS (x2.0 de peso) - LO MÁS IMPORTANTE
        // Suma directa de los scores de cada punto
        breakdown.pointQuality = (from.score + to.score) * 2.0;

        // 2. ESTRUCTURA (Downbeats)
        if (from.beatIndex >= 0 && to.beatIndex >= 0) {
            const fromBeat = fromSong.analysis.beats[from.beatIndex];
            const toBeat = toSong.analysis.beats[to.beatIndex];

            if (fromBeat?.isDownbeat && toBeat?.isDownbeat) {
                breakdown.structure = 300; // Fraseo perfecto
            } else if (fromBeat?.isDownbeat || toBeat?.isDownbeat) {
                breakdown.structure = 100; // Aceptable
            } else {
                breakdown.structure = 20; // Malo
            }
        }

        // 3. ARMONÍA (Compatibilidad de clave) - MEJORADO V2.2
        breakdown.harmony = this.calculateHarmonyScore(fromSong, toSong);

        // 4. ENERGÍA
        breakdown.energy = this.calculateEnergyScore(fromSong, from.beatIndex, toSong, to.beatIndex);

        // 5. MOOD (de Gemini)
        breakdown.mood = this.calculateMoodScore(fromSong, toSong);

        // 6. VARIEDAD (evitar repetir canciones)
        breakdown.variety = this.calculateVarietyScore(from.songIndex, to.songIndex);

        // 7. GEMINI (puntos sugeridos)
        breakdown.gemini = (from.quality === 'excellent' ? 100 : from.quality === 'good' ? 70 : 40) +
            (to.quality === 'excellent' ? 100 : to.quality === 'good' ? 70 : 40);

        // 8. VARIEDAD ESTRUCTURAL - NUEVO V2.2
        const structuralVarietyBonus = this.calculateStructuralVarietyBonus(from, to);
        breakdown.variety += structuralVarietyBonus;

        // Calcular score base
        let totalScore = Object.values(breakdown).reduce((a, b) => a + b, 0);

        // ⚠️ PENALIZACIÓN ARMÓNICA MULTIPLICATIVA - NUEVO V2.2
        // Si la armonía es incompatible (0 puntos), reducir el score total en 40%
        if (breakdown.harmony === 0) {
            totalScore *= 0.6; // Reducción del 40%
            // Log deshabilitado para no llenar la consola
        }

        // Calcular playback rate para ajustar tempo
        const tempoRatio = toSong.analysis.track.tempo / fromSong.analysis.track.tempo;
        const playbackRate = Math.max(0.9, Math.min(1.1, tempoRatio));

        // ⚠️ PENALIZACIÓN POR SALTOS DE TEMPO EXTREMOS - NUEVO V2.2
        // Incluso con playbackRate, saltos muy grandes suenan mal
        const tempoDiff = Math.abs(fromSong.analysis.track.tempo - toSong.analysis.track.tempo);
        const tempoDiffPercent = tempoDiff / fromSong.analysis.track.tempo;

        if (tempoDiffPercent > 0.5) {
            // Más del 50% de diferencia (ej: 100 BPM → 200 BPM)
            totalScore *= 0.5; // Reducción del 50%
            // Log deshabilitado para no llenar la consola
        } else if (tempoDiffPercent > 0.25) {
            // Más del 25% de diferencia
            totalScore *= 0.75; // Reducción del 25%
        }

        // Duración del crossfade basada en el tipo de transición
        const crossfadeDuration = from.transitionType === 'beatmatch' ? 4.0 :
            from.transitionType === 'crossfade' ? 2.0 : 0.5;

        return {
            from,
            to,
            totalScore,
            breakdown,
            playbackRate,
            crossfadeDuration
        };
    }

    /**
     * NUEVO V2.2: Calcular bonus por variedad estructural
     * Evitar patrones repetitivos como chorus → chorus → chorus
     */
    private calculateStructuralVarietyBonus(from: SmartTransitionPoint, to: SmartTransitionPoint): number {
        const fromSong = this.songs[from.songIndex];
        const toSong = this.songs[to.songIndex];

        // Obtener tipo de sección de cada punto
        const fromSection = this.getSectionType(fromSong, from.time);
        const toSection = this.getSectionType(toSong, to.time);

        // Verificar las últimas 2 transiciones
        const recentPattern = this.structuralHistory.slice(-2);
        
        let bonus = 0;

        // Si las últimas 2 transiciones fueron del mismo tipo, penalizar
        if (recentPattern.length >= 2) {
            const allSamePattern = recentPattern.every(p => 
                p.from === fromSection && p.to === toSection
            );

            if (allSamePattern) {
                bonus -= 150; // Penalización por repetición
            }
        }

        // Bonus por transiciones interesantes
        if (fromSection === 'outro' && toSection === 'intro') {
            bonus += 100; // Transición natural
        } else if (fromSection === 'instrumental' && toSection === 'verse') {
            bonus += 80; // Buena variedad
        } else if (fromSection === 'bridge' && toSection === 'chorus') {
            bonus += 60; // Build-up natural
        } else if (fromSection === 'chorus' && toSection === 'chorus') {
            // Chorus → Chorus es común pero puede ser repetitivo
            const chorusCount = recentPattern.filter(p => p.to === 'chorus').length;
            if (chorusCount >= 2) {
                bonus -= 100; // Penalización si ya hay muchos chorus
            }
        }

        return bonus;
    }

    /**
     * NUEVO V2.2: Obtener tipo de sección en un tiempo dado
     */
    private getSectionType(song: Song, time: number): string {
        const gemini = song.analysis.advanced?.gemini;
        if (!gemini) return 'unknown';

        const section = gemini.lyricSections.find((s: any) =>
            time >= s.startTime && time <= s.endTime
        );

        return section?.type || 'unknown';
    }

    /**
     * NUEVO V2.2: Obtener nombre de clave musical
     */
    private getKeyName(song: Song): string {
        const keyNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const key = song.analysis.track.key;
        const mode = song.analysis.track.mode === 1 ? 'Mayor' : 'menor';
        return `${keyNames[key]} ${mode}`;
    }

    /**
     * NUEVO V2.2: Registrar transición en el historial estructural
     */
    recordStructuralTransition(from: SmartTransitionPoint, to: SmartTransitionPoint): void {
        const fromSong = this.songs[from.songIndex];
        const toSong = this.songs[to.songIndex];
        
        const fromSection = this.getSectionType(fromSong, from.time);
        const toSection = this.getSectionType(toSong, to.time);

        this.structuralHistory.push({ from: fromSection, to: toSection });

        // Mantener solo las últimas 5 transiciones
        if (this.structuralHistory.length > 5) {
            this.structuralHistory.shift();
        }
    }

    /**
     * MEJORADO V2.2: Score de armonía más estricto
     * Considera también el modo (mayor/menor) para mejor compatibilidad
     */
    private calculateHarmonyScore(fromSong: Song, toSong: Song): number {
        const fromKey = fromSong.analysis.track.key;
        const toKey = toSong.analysis.track.key;
        const fromMode = fromSong.analysis.track.mode; // 0 = menor, 1 = mayor
        const toMode = toSong.analysis.track.mode;
        
        const diff = Math.abs(fromKey - toKey);
        const sameMode = fromMode === toMode;

        // Clave idéntica + mismo modo = PERFECTO
        if (diff === 0 && sameMode) return 250;
        
        // Clave idéntica pero diferente modo = Bueno
        if (diff === 0) return 180;

        // Clave relativa (3 semitonos) - Muy compatible
        if ((diff === 3 || diff === 9) && sameMode) return 200;
        if (diff === 3 || diff === 9) return 160;

        // Círculo de quintas (5 o 7 semitonos) - Compatible
        if ((diff === 5 || diff === 7) && sameMode) return 170;
        if (diff === 5 || diff === 7) return 130;

        // Claves cercanas (1-2 semitonos) - Aceptable
        if ((diff <= 2 || diff >= 10) && sameMode) return 100;
        if (diff <= 2 || diff >= 10) return 60;

        // Incompatible - PENALIZACIÓN DURA
        return 0;
    }

    private calculateEnergyScore(fromSong: Song, fromBeat: number, toSong: Song, toBeat: number): number {
        const fromEnergy = fromSong.analysis.advanced?.energyPerBeat[fromBeat] || 0.5;
        const toEnergy = toSong.analysis.advanced?.energyPerBeat[toBeat] || 0.5;

        const diff = Math.abs(fromEnergy - toEnergy);
        return Math.max(0, 100 * (1 - diff * 3));
    }

    private calculateMoodScore(fromSong: Song, toSong: Song): number {
        const fromGemini = fromSong.analysis.advanced?.gemini;
        const toGemini = toSong.analysis.advanced?.gemini;

        if (!fromGemini || !toGemini) return 0;

        let score = 0;

        // Temas compartidos
        const sharedThemes = fromGemini.themes.filter((t: string) => toGemini.themes.includes(t));
        score += sharedThemes.length * 30;

        // Mood compatible
        if (fromGemini.mood.energy === toGemini.mood.energy) score += 50;
        if (fromGemini.mood.emotion === toGemini.mood.emotion) score += 50;

        return Math.min(150, score);
    }

    private calculateVarietyScore(fromSongIndex: number, toSongIndex: number): number {
        // Penalizar si ya se usó mucho esta canción
        const toSong = this.songs[toSongIndex];
        const usedCount = this.usedSegments.get(toSong.id)?.size || 0;

        if (usedCount === 0) return 100; // Primera vez
        if (usedCount === 1) return 50;  // Segunda vez
        if (usedCount === 2) return 20;  // Tercera vez
        return -50; // Más de 3 veces (penalización)
    }

    /**
     * Marcar un segmento como usado
     */
    markSegmentAsUsed(songIndex: number, beatIndex: number, duration: number = 30) {
        const song = this.songs[songIndex];
        const songId = song.id;

        if (!this.usedSegments.has(songId)) {
            this.usedSegments.set(songId, new Set());
        }

        const beats = song.analysis.beats;
        const startTime = beats[beatIndex]?.start || 0;

        // Marcar todos los beats en un rango de 'duration' segundos como usados
        for (let i = 0; i < beats.length; i++) {
            const beatTime = beats[i].start;
            if (Math.abs(beatTime - startTime) < duration) {
                this.usedSegments.get(songId)!.add(i);
            }
        }
    }

    /**
     * Resetear segmentos usados
     */
    reset() {
        this.usedSegments.clear();
        this.structuralHistory = []; // V2.2: Limpiar historial estructural
    }
}
