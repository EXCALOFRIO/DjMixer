/**
 * AudioPlayer - Sistema de reproducción profesional con scoring híbrido
 * 
 * Integra:
 * - Análisis técnico (Essentia + Meyda)
 * - Análisis semántico (Gemini 2.5 Flash)
 * - Sistema de scoring híbrido que valora el criterio de Gemini
 * - Transiciones profesionales con efectos
 */

import type { Song, InternalTransitionMap, CrossSongTransition, PlaybackState, Jump, Beat } from '../types';

interface PlannedJump {
    atBeatIndex: number;
    fromSong: number;
    fromBeat: number;
    toSong: number;
    toBeat: number;
    transition: CrossSongTransition;
    transitionType: 'crossfade' | 'cut' | 'beatmatch';
    playbackRate: number;
    score: number; // Score total del salto
}

interface FxChain {
    input: GainNode;
    lowShelf: BiquadFilterNode;
    midPeak: BiquadFilterNode;
    highShelf: BiquadFilterNode;
    output: GainNode;
    gain: GainNode;
    delay?: DelayNode;
    feedback?: GainNode;
}

class AudioPlayer {
    protected songs: Song[];
    protected transitions: { internal: InternalTransitionMap, cross: CrossSongTransition[] };
    protected onStateUpdate: (state: PlaybackState, jump: Jump | null) => void;

    protected audioContext: AudioContext;
    protected audioBuffers: { [songId: string]: AudioBuffer } = {};
    protected normalizedVolumes: { [songId: string]: number } = {};

    protected masterGain: GainNode;
    protected crossfadeDuration = 8; // 8 segundos para transiciones suaves como DJ real

    protected currentSongIndex = 0;
    protected currentBeatIndex = 0;
    protected isPlaying = false;

    protected plannedRoute: PlannedJump[] = [];
    protected currentRouteIndex = 0;

    protected preRenderedBuffer: AudioBuffer | null = null;
    protected timeMap: Array<{
        time: number;
        songIndex: number;
        beatIndex: number;
        isTransition: boolean;
    }> = [];

    protected playbackStartTime = 0;
    protected pausedAtTime = 0;
    protected currentSource: AudioBufferSourceNode | null = null;

    protected transitionLog: string[] = [];
    protected totalJumps = 0;
    protected songsVisited = new Set<number>();

    constructor(
        songs: Song[],
        transitions: { internal: InternalTransitionMap, cross: CrossSongTransition[] },
        onStateUpdate: (state: PlaybackState, jump: Jump | null) => void
    ) {
        this.songs = songs;
        this.transitions = transitions;
        this.onStateUpdate = onStateUpdate;
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

        this.masterGain = this.audioContext.createGain();
        this.masterGain.connect(this.audioContext.destination);
        this.masterGain.gain.value = 1.0;
    }

    /**
     * Cargar y analizar todas las canciones con Gemini (en paralelo)
     */
    async load(useGeminiAnalysis: boolean = true) {
        // console.log('🎵 Cargando y analizando canciones...');
        // console.log(`🧠 Análisis Gemini: ${useGeminiAnalysis ? 'ACTIVADO ✅' : 'DESACTIVADO ⏭️'}`);
        // console.log(`⚡ Análisis en paralelo: 5 canciones a la vez`);

        const { analyzeSongComplete, integrateAnalysisIntoSong } = await import('./MasterAnalyzer');

        // Función para procesar una canción
        const processSong = async (song: Song, index: number) => {
            console.log(`\n📥 [${index + 1}/${this.songs.length}] ${song.name}`);

            try {
                const response = await fetch(song.audioUrl);
                const arrayBuffer = await response.arrayBuffer();

                // Guardar una copia del arrayBuffer para Gemini ANTES de decodificar
                const arrayBufferCopy = arrayBuffer.slice(0);

                const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

                this.audioBuffers[song.id] = audioBuffer;
                this.normalizedVolumes[song.id] = await this.calculateNormalizedVolume(audioBuffer);

                console.log(`✅ Audio: ${audioBuffer.duration.toFixed(1)}s | Vol: ${this.normalizedVolumes[song.id].toFixed(2)}x`);

                // Análisis maestro completo
                if (song.analysis && song.analysis.beats.length > 0) {
                    try {
                        // Usar la copia del arrayBuffer para crear el File
                        const audioBlob = new Blob([arrayBufferCopy], { type: 'audio/mpeg' });
                        const audioFile = new File([audioBlob], song.name, { type: 'audio/mpeg' });

                        const masterAnalysis = await analyzeSongComplete(
                            audioFile,
                            audioBuffer,
                            song.analysis.beats,
                            useGeminiAnalysis
                        );

                        integrateAnalysisIntoSong(song, masterAnalysis);

                        if (masterAnalysis.hasGeminiAnalysis) {
                            console.log(`   🧠 Gemini: ${masterAnalysis.semantic!.sections.length} secciones | ${masterAnalysis.semantic!.transitionPoints.length} puntos`);
                        }
                    } catch (error) {
                        console.warn(`   ⚠️ Análisis falló, usando solo técnico`);
                        const { analyzeSongAdvanced } = await import('./AudioAnalyzer');
                        song.analysis.advanced = await analyzeSongAdvanced(audioBuffer, song.analysis.beats);
                    }
                }
            } catch (error) {
                console.error(`❌ Error: ${song.name}`, error);
                throw error;
            }
        };

        // Procesar en lotes de 5 canciones en paralelo
        const BATCH_SIZE = 5;
        for (let i = 0; i < this.songs.length; i += BATCH_SIZE) {
            const batch = this.songs.slice(i, i + BATCH_SIZE);
            const batchPromises = batch.map((song, batchIndex) =>
                processSong(song, i + batchIndex)
            );

            console.log(`\n🔄 Procesando lote ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} canciones en paralelo)...`);
            await Promise.all(batchPromises);
            console.log(`✅ Lote ${Math.floor(i / BATCH_SIZE) + 1} completado`);
        }

        const songsWithGemini = this.songs.filter(s => s.analysis.advanced?.gemini).length;
        console.log(`\n✅ Listo: ${this.songs.length} canciones | ${songsWithGemini} con Gemini`);
    }

    /**
     * Normalización LUFS profesional
     */
    protected async calculateNormalizedVolume(audioBuffer: AudioBuffer): Promise<number> {
        const targetLoudness = -14.0; // LUFS estándar

        try {
            const { Essentia, EssentiaWASM } = await import('essentia.js');
            const essentia = new Essentia(EssentiaWASM);
            const audioVector = essentia.arrayToVector(audioBuffer.getChannelData(0));

            const loudness = essentia.LoudnessEBUR128(audioVector);
            const gainDb = targetLoudness - loudness.integratedLoudness;
            const linearGain = Math.pow(10, gainDb / 20);

            return Math.min(linearGain, 2.0);
        } catch (error) {
            // Fallback: Peak normalization (sin spread operator para evitar stack overflow)
            const channelData = audioBuffer.getChannelData(0);
            let maxPeak = 0;
            for (let i = 0; i < channelData.length; i++) {
                const absSample = Math.abs(channelData[i]);
                if (absSample > maxPeak) {
                    maxPeak = absSample;
                }
            }
            return maxPeak > 0 ? Math.min(0.5 / maxPeak, 1.2) : 1.0;
        }
    }

    /**
     * COMPATIBILIDAD ESTRUCTURAL (0-300 puntos) - CRÍTICO
     * Recompensa transiciones musicalmente lógicas (outro->intro, instrumental->verse, etc.)
     * Penaliza mezclas en puntos no-downbeat
     */
    protected calculateStructuralScore(
        fromSong: Song,
        fromBeat: number,
        toSong: Song,
        toBeat: number
    ): { score: number; reason: string } {
        const fromBeatInfo = fromSong.analysis.beats[fromBeat];
        const toBeatInfo = toSong.analysis.beats[toBeat];

        // Si no tenemos info de los beats, no podemos juzgar
        if (!fromBeatInfo || !toBeatInfo) {
            return { score: 50, reason: 'Datos de beat incompletos' };
        }

        let structuralScore = 0;
        let reason = '';

        // Puntuación base por respetar el ritmo
        if (fromBeatInfo.isDownbeat && toBeatInfo.isDownbeat) {
            structuralScore = 300; // Máxima puntuación por fraseo perfecto
            reason = '🎯 Downbeat → Downbeat (Fraseo perfecto)';
        } else if (fromBeatInfo.isDownbeat || toBeatInfo.isDownbeat) {
            structuralScore = 100; // Aceptable, al menos uno está en el "1"
            reason = '⚠️ Fraseo aceptable (un solo downbeat)';
        } else {
            structuralScore = 20; // Muy baja puntuación, pero no cero. Es un último recurso.
            reason = '❌ No respeta el downbeat';
        }

        // Ahora, añadimos la lógica de secciones de Gemini
        const fromGemini = fromSong.analysis.advanced?.gemini;
        const toGemini = toSong.analysis.advanced?.gemini;

        if (fromGemini && toGemini) {
            const fromSection = this.findSectionForBeat(fromGemini.lyricSections, fromBeatInfo.start);
            const toSection = this.findSectionForBeat(toGemini.lyricSections, toBeatInfo.start);

            if (fromSection && toSection) {
                const typeFrom = fromSection.type;
                const typeTo = toSection.type;

                if (typeFrom === 'outro' && typeTo === 'intro') {
                    structuralScore *= 1.5; // Bonus del 50% por la transición perfecta
                    reason += ' | 🏆 Outro → Intro';
                } else if (typeFrom === 'instrumental' && (typeTo === 'intro' || typeTo === 'verse')) {
                    structuralScore *= 1.2; // Bonus del 20%
                    reason += ' | ✅ Instrumental → Vocal';
                } else if ((typeFrom === 'verse' || typeFrom === 'chorus') && typeTo === 'instrumental') {
                    structuralScore *= 1.2;
                    reason += ' | ✅ Vocal → Instrumental';
                }
            }
        }

        return { score: Math.min(300, structuralScore), reason }; // Limitamos a 300
    }

    /**
     * COMPATIBILIDAD ARMÓNICA (0-200 puntos)
     * Utiliza el Círculo de Quintas para evaluar compatibilidad de claves musicales
     */
    protected calculateKeyCompatibilityScore(
        fromSong: Song,
        toSong: Song
    ): { score: number; reason: string } {
        const fromKey = fromSong.analysis.track.key;
        const toKey = toSong.analysis.track.key;
        const fromMode = fromSong.analysis.track.mode;
        const toMode = toSong.analysis.track.mode;

        // Misma clave, mismo modo: perfecto
        if (fromKey === toKey && fromMode === toMode) {
            return { score: 200, reason: '🎼 Clave idéntica' };
        }

        // Misma clave, modo diferente (ej. Do Mayor y Do menor): muy compatible
        if (fromKey === toKey) {
            return { score: 180, reason: '🎼 Modo paralelo' };
        }

        // Círculo de Quintas: claves adyacentes (salto de 7 semitonos = quinta perfecta)
        if ((fromKey + 7) % 12 === toKey || (fromKey + 5) % 12 === toKey) {
            return { score: 150, reason: '🎼 Círculo de Quintas' };
        }

        // Clave relativa menor/mayor (ej. Do Mayor y La menor)
        if (fromMode !== toMode) {
            const relativeKey = fromMode === 1 ? (fromKey + 9) % 12 : (fromKey + 3) % 12;
            if (relativeKey === toKey) {
                return { score: 160, reason: '🎼 Clave relativa' };
            }
        }

        // Claves cercanas (1 semitono de diferencia)
        const diff = Math.abs(fromKey - toKey);
        if (diff === 1 || diff === 11) {
            return { score: 80, reason: '⚠️ Claves cercanas' };
        }

        return { score: 0, reason: '❌ Incompatible armónicamente' };
    }



    /**
     * Score técnico: Energía, vocales, tempo, key
     */
    protected calculateTechnicalScore(
        fromSong: Song,
        fromBeat: number,
        toSong: Song,
        toBeat: number
    ): { score: number } {
        let score = 0;

        const fromAnalysis = fromSong.analysis.advanced;
        const toAnalysis = toSong.analysis.advanced;

        if (!fromAnalysis || !toAnalysis) return { score: 100 };

        // Energía similar (0-100 puntos)
        const fromEnergy = fromAnalysis.energyPerBeat[fromBeat] || 0;
        const toEnergy = toAnalysis.energyPerBeat[toBeat] || 0;
        const energyDiff = Math.abs(fromEnergy - toEnergy);
        score += Math.max(0, 100 * (1 - energyDiff * 5));

        // Evitar vocales (0-100 puntos)
        const fromHasVocal = fromAnalysis.isVocalPerBeat[fromBeat];
        const toHasVocal = toAnalysis.isVocalPerBeat[toBeat];
        if (!fromHasVocal && !toHasVocal) score += 100;
        else if (!fromHasVocal || !toHasVocal) score += 50;

        // Tempo compatible (0-100 puntos)
        const fromTempo = fromSong.analysis.track.tempo;
        const toTempo = toSong.analysis.track.tempo;
        const tempoDiff = Math.abs(fromTempo - toTempo);
        score += Math.max(0, 100 * (1 - tempoDiff / 40));

        return { score };
    }

    /**
     * Score Gemini Mood: Temas, energía emocional, puntos de transición
     * Enfocado en la narrativa y el flujo emocional del set
     */
    protected calculateGeminiMoodScore(
        fromSong: Song,
        fromBeat: number,
        toSong: Song,
        toBeat: number
    ): { score: number } {
        let score = 0;

        const fromGemini = fromSong.analysis.advanced?.gemini;
        const toGemini = toSong.analysis.advanced?.gemini;

        if (!fromGemini || !toGemini) return { score: 0 };

        const fromBeatTime = fromSong.analysis.beats[fromBeat]?.start || 0;
        const toBeatTime = toSong.analysis.beats[toBeat]?.start || 0;

        // 1. Puntos de transición sugeridos por Gemini (0-200 puntos)
        const fromNearPoint = fromGemini.transitionPoints.find(p =>
            Math.abs(p.beatTime - fromBeatTime) < 2.0
        );
        const toNearPoint = toGemini.transitionPoints.find(p =>
            Math.abs(p.beatTime - toBeatTime) < 2.0
        );

        if (fromNearPoint) {
            score += fromNearPoint.quality === 'excellent' ? 100 :
                fromNearPoint.quality === 'good' ? 70 : 40;
        }
        if (toNearPoint) {
            score += toNearPoint.quality === 'excellent' ? 100 :
                toNearPoint.quality === 'good' ? 70 : 40;
        }

        // 2. Compatibilidad temática (0-150 puntos)
        const sharedThemes = fromGemini.themes.filter(t => toGemini.themes.includes(t));
        const themeScore = Math.min(150, sharedThemes.length * 30);
        score += themeScore;

        // 3. Compatibilidad de mood emocional (0-150 puntos)
        const energyMatch = fromGemini.mood.energy === toGemini.mood.energy;
        const emotionMatch = fromGemini.mood.emotion === toGemini.mood.emotion;

        if (energyMatch && emotionMatch) score += 150;
        else if (energyMatch || emotionMatch) score += 75;

        return { score };
    }

    protected findSectionForBeat(sections: any[], beatTime: number): any {
        return sections.find(s => beatTime >= s.startTime && beatTime <= s.endTime);
    }

    /**
     * Score de gaps: Penalizar transiciones muy cercanas o muy lejanas
     */
    protected calculateGapScore(
        fromSong: Song,
        fromBeat: number,
        toSong: Song,
        toBeat: number
    ): number {
        const fromTime = fromSong.analysis.beats[fromBeat]?.start || 0;
        const toTime = toSong.analysis.beats[toBeat]?.start || 0;

        const gap = Math.abs(toTime - fromTime);

        // Gap ideal: 30-90 segundos
        if (gap >= 30 && gap <= 90) return 100;
        if (gap >= 20 && gap <= 120) return 50;
        return 0;
    }



    /**
     * Calcular score de transición (wrapper para compatibilidad con exportAnalysis)
     */
    protected calculateTransitionScore(
        fromSong: Song,
        fromBeat: number,
        toSong: Song,
        toBeat: number,
        distance: number
    ): { score: number; breakdown: string; transitionType: string } {
        // Calcular scores individuales
        const structural = this.calculateStructuralScore(fromSong, fromBeat, toSong, toBeat);
        const harmony = this.calculateKeyCompatibilityScore(fromSong, toSong);
        const technical = this.calculateTechnicalScore(fromSong, fromBeat, toSong, toBeat);
        const gemini = this.calculateGeminiMoodScore(fromSong, fromBeat, toSong, toBeat);
        const gap = this.calculateGapScore(fromSong, fromBeat, toSong, toBeat);

        // Calcular score total con pesos
        const totalScore = 
            (structural.score * 2.0) +  // Peso x2 para estructura
            (harmony.score * 1.5) +     // Peso x1.5 para armonía
            technical.score +            // Peso x1 para técnico
            gemini.score +               // Peso x1 para Gemini
            gap;                         // Bonus por gap

        // Determinar tipo de transición
        let transitionType = 'crossfade';
        const fromBeatInfo = fromSong.analysis.beats[fromBeat];
        const toBeatInfo = toSong.analysis.beats[toBeat];
        
        if (fromBeatInfo?.isDownbeat && toBeatInfo?.isDownbeat) {
            transitionType = 'beatmatch'; // Beatmatch para downbeats perfectos
        } else if (structural.score < 100) {
            transitionType = 'cut'; // Cut para transiciones malas
        }

        // Crear breakdown legible
        const breakdown = `Struct:${structural.score.toFixed(0)} | Harm:${harmony.score.toFixed(0)} | Tech:${technical.score.toFixed(0)} | Gemini:${gemini.score.toFixed(0)} | Gap:${gap.toFixed(0)}`;

        return {
            score: totalScore,
            breakdown,
            transitionType
        };
    }

    // NUEVO: Guardar PathFinderEngine para exportar análisis detallado
    private pathFinderEngine: any = null;
    private bestPathFound: any = null;

    /**
     * Planificar ruta completa - NUEVO SISTEMA CON A*
     * Usa PathFinderEngine para encontrar la mejor ruta posible
     */
    async planCompleteRoute(
        startSongIndex: number,
        endSongIndex: number,
        minBeatsPerSong: number = 60
    ): Promise<void> {
        console.log('\n🗺️  PLANIFICANDO RUTA CON A* EXHAUSTIVO V2.1');
        console.log('═'.repeat(80));

        const { PathFinderEngine } = await import('./PathFinderEngine');
        const pathFinder = new PathFinderEngine(this.songs);
        
        // Guardar para exportar análisis detallado después
        this.pathFinderEngine = pathFinder;

        // Pre-procesar puntos
        console.log('🔍 Pre-procesando puntos de transición...');
        await pathFinder.preprocessPoints();

        // Buscar mejor ruta con progreso
        console.log('\n🎯 Buscando mejor ruta...');
        const bestPath = await pathFinder.findBestPath(
            startSongIndex,
            this.songs.length,
            (progress, score) => {
                if (progress % 10 === 0) {
                    console.log(`   ${progress.toFixed(0)}% - Mejor score: ${score.toFixed(0)}`);
                }
            }
        );

        // Guardar para exportar análisis detallado
        this.bestPathFound = bestPath;

        // Convertir a formato de plannedRoute
        this.plannedRoute = [];
        this.currentSongIndex = startSongIndex;
        this.currentBeatIndex = 0;

        for (let i = 0; i < bestPath.transitions.length; i++) {
            const transition = bestPath.transitions[i];
            
            this.plannedRoute.push({
                atBeatIndex: transition.from.beatIndex,
                fromSong: transition.from.songIndex,
                fromBeat: transition.from.beatIndex,
                toSong: transition.to.songIndex,
                toBeat: transition.to.beatIndex,
                transition: {
                    from: {
                        songIndex: transition.from.songIndex,
                        beatIndex: transition.from.beatIndex
                    },
                    to: {
                        songIndex: transition.to.songIndex,
                        beatIndex: transition.to.beatIndex
                    },
                    distance: 0
                },
                transitionType: transition.from.transitionType as any,
                playbackRate: transition.playbackRate,
                score: transition.totalScore
            });

            console.log(`\n🎯 Salto ${i + 1}/${bestPath.transitions.length}:`);
            console.log(`   ${this.songs[transition.from.songIndex].name} → ${this.songs[transition.to.songIndex].name}`);
            console.log(`   Score: ${transition.totalScore.toFixed(0)}`);
            console.log(`   Tipo: ${transition.from.transitionType} | Tempo: ${(transition.playbackRate * 100).toFixed(0)}%`);
        }

        const visitedSongs = new Set(bestPath.nodes.map(n => n.songIndex));
        const totalSongs = this.songs.length;

        console.log('\n' + '═'.repeat(80));
        console.log(`✅ Ruta planificada: ${this.plannedRoute.length} saltos`);
        console.log(`🎵 Canciones visitadas: ${visitedSongs.size}/${totalSongs}`);
        console.log(`💯 Score total: ${bestPath.totalScore.toFixed(0)}`);

        if (visitedSongs.size === totalSongs) {
            console.log(`🎉 ¡PERFECTO! Todas las canciones serán reproducidas`);
        } else {
            console.warn(`⚠️  ADVERTENCIA: Solo se visitaron ${visitedSongs.size} de ${totalSongs} canciones`);
        }
        
        // 📊 MOSTRAR ESTADÍSTICAS ULTRA DETALLADAS
        console.log('\n');
        pathFinder.showTransitionSummary();

        console.log('\n💾 Análisis ultra detallado disponible para descarga');
    }



    /**
     * Pre-renderizar mezcla completa
     */
    async preRenderMix(): Promise<void> {
        if (this.plannedRoute.length === 0) {
            console.log('⚠️ No hay ruta planificada');
            return;
        }

        console.log('\n🎨 PRE-RENDERIZANDO MEZCLA');
        this.generateTimeMap();

        const lastEntry = this.timeMap[this.timeMap.length - 1];
        const totalDuration = lastEntry.time + 60;

        console.log(`📏 Duración: ${Math.floor(totalDuration / 60)}m ${Math.floor(totalDuration % 60)}s`);

        const sampleRate = 44100;
        const offlineContext = new OfflineAudioContext(2, Math.ceil(totalDuration * sampleRate), sampleRate);
        const transitions = this.timeMap.filter(p => p.isTransition);

        // Primera canción - Con fade out suave
        const firstSongIndex = this.plannedRoute[0].fromSong;
        const firstSong = this.songs[firstSongIndex];
        const firstTransitionTime = transitions[0].time;
        const firstTransitionType = this.plannedRoute[0]?.transitionType || 'crossfade';

        const firstSource = offlineContext.createBufferSource();
        const firstGain = offlineContext.createGain();

        firstSource.buffer = this.audioBuffers[firstSong.id];
        firstSource.connect(firstGain);
        firstGain.connect(offlineContext.destination);

        const firstVol = (this.normalizedVolumes[firstSong.id] || 1.0) * 0.6;
        
        // Fade in inicial suave (evita click al inicio)
        firstGain.gain.setValueAtTime(0.001, 0);
        firstGain.gain.exponentialRampToValueAtTime(firstVol, 0.05);
        firstGain.gain.setValueAtTime(firstVol, Math.max(0.05, firstTransitionTime - this.crossfadeDuration));
        
        // Fade out con curva exponencial
        if (firstTransitionType === 'beatmatch') {
            firstGain.gain.exponentialRampToValueAtTime(firstVol * 0.5, firstTransitionTime - (this.crossfadeDuration * 0.5));
            firstGain.gain.exponentialRampToValueAtTime(0.001, firstTransitionTime);
        } else {
            firstGain.gain.exponentialRampToValueAtTime(0.001, firstTransitionTime);
        }
        
        // Asegurar que empieza desde el inicio y dura hasta la transición + overlap
        firstSource.start(0, 0, firstTransitionTime + 0.1);

        console.log(`✅ [1] ${firstSong.name} [inicio]`);

        // Resto de canciones
        for (let i = 0; i < transitions.length; i++) {
            const transition = transitions[i];
            const nextTransition = transitions[i + 1];
            const song = this.songs[transition.songIndex];
            const beat = song.analysis.beats[transition.beatIndex];

            const plannedJump = this.plannedRoute.find(j =>
                j.toSong === transition.songIndex && j.toBeat === transition.beatIndex
            );
            const playbackRate = plannedJump?.playbackRate || 1.0;
            const transitionType = plannedJump?.transitionType || 'crossfade';

            let effectiveCrossfade = this.crossfadeDuration;
            if (transitionType === 'cut') effectiveCrossfade = 2.0; // Cut más suave (2s)
            else if (transitionType === 'beatmatch') effectiveCrossfade = 12.0; // Beatmatch largo (12s)
            else effectiveCrossfade = 8.0; // Crossfade estándar (8s)

            const fxChain = this.createFxChain(offlineContext, false);
            const source = offlineContext.createBufferSource();

            source.buffer = this.audioBuffers[song.id];
            source.connect(fxChain.input);
            fxChain.output.connect(offlineContext.destination);
            source.playbackRate.value = playbackRate;

            const vol = (this.normalizedVolumes[song.id] || 1.0) * 0.6;
            
            // CRÍTICO: El audio debe empezar ANTES del punto de transición para el fade in
            const overlapBuffer = 0.2; // 200ms de buffer extra
            const startTimeInMix = Math.max(0, transition.time - effectiveCrossfade - overlapBuffer);
            const startTimeInAudio = Math.max(0, beat.start - effectiveCrossfade - overlapBuffer);

            // IMPORTANTE: Asegurar que el gain empiece en 0 desde el inicio del audio
            fxChain.gain.gain.setValueAtTime(0.001, startTimeInMix);
            
            this.applyTransitionIn(fxChain, transition.time, transitionType, vol, effectiveCrossfade);

            if (nextTransition) {
                const duration = nextTransition.time - transition.time;
                const nextPlannedJump = this.plannedRoute.find(j =>
                    j.toSong === nextTransition.songIndex && j.toBeat === nextTransition.beatIndex
                );
                const nextTransitionType = nextPlannedJump?.transitionType || 'crossfade';
                let nextEffectiveCrossfade = this.crossfadeDuration;
                if (nextTransitionType === 'cut') nextEffectiveCrossfade = 2.0;
                else if (nextTransitionType === 'beatmatch') nextEffectiveCrossfade = 12.0;
                else nextEffectiveCrossfade = 8.0;

                this.applyTransitionOut(fxChain, nextTransition.time, nextTransitionType, vol, nextEffectiveCrossfade);

                // CRÍTICO: Agregar overlap extra para asegurar continuidad
                const overlapExtra = 0.3; // 300ms extra de overlap
                const totalDuration = (duration + effectiveCrossfade + nextEffectiveCrossfade + overlapExtra) / playbackRate;
                source.start(startTimeInMix, startTimeInAudio, totalDuration);
            } else {
                // Última canción - fade out suave al final
                const finalDuration = 60;
                const fadeOutStart = transition.time + finalDuration - 2.0;
                fxChain.gain.gain.setValueAtTime(vol, transition.time);
                fxChain.gain.gain.setValueAtTime(vol, fadeOutStart);
                fxChain.gain.gain.exponentialRampToValueAtTime(0.001, fadeOutStart + 2.0);
                
                const totalDuration = (finalDuration + effectiveCrossfade) / playbackRate;
                source.start(startTimeInMix, startTimeInAudio, totalDuration);
            }

            console.log(`✅ [${i + 2}] ${song.name} [${transitionType}]`);
        }

        console.log('⏳ Renderizando...');
        this.preRenderedBuffer = await offlineContext.startRendering();
        console.log(`✅ Mezcla lista: ${this.preRenderedBuffer.duration.toFixed(1)}s`);
    }

    protected generateTimeMap() {
        console.log('\n🗺️  GENERANDO MAPA DE TIEMPO (TimeMap)');
        console.log('═'.repeat(80));
        
        this.timeMap = [];
        if (this.plannedRoute.length === 0) return;

        let currentTime = 0;
        const firstJump = this.plannedRoute[0];
        const firstSongIndex = firstJump.fromSong;
        const firstSong = this.songs[firstSongIndex];
        
        // 🎬 PRIMERA CANCIÓN: Reproducir estructura completa (como un DJ)
        // Mínimo 60 segundos, ideal 90-120 segundos
        const firstSongMinBeats = 240;  // ~60 segundos
        const firstSongIdealBeats = 360; // ~90 segundos
        
        let firstSongEndBeat = Math.max(firstJump.fromBeat, firstSongMinBeats);
        firstSongEndBeat = Math.min(firstSongEndBeat, firstSongIdealBeats, firstSong.analysis.beats.length);
        
        const firstSongDuration = firstSong.analysis.beats[firstSongEndBeat - 1]?.start || 0;
        console.log(`📍 Primera canción: ${firstSong.name}`);
        console.log(`   Reproducir: beats 0 → ${firstSongEndBeat} (~${firstSongDuration.toFixed(1)}s = ${(firstSongDuration/60).toFixed(1)} min)`);

        for (let i = 0; i < firstSongEndBeat; i++) {
            const beat = firstSong.analysis.beats[i];
            if (!beat) continue;
            this.timeMap.push({
                time: currentTime,
                songIndex: firstSongIndex,
                beatIndex: i,
                isTransition: false
            });
            currentTime += beat.duration;
        }

        console.log(`\n🔄 Procesando ${this.plannedRoute.length} saltos:`);
        for (let i = 0; i < this.plannedRoute.length; i++) {
            const jump = this.plannedRoute[i];
            const nextJump = this.plannedRoute[i + 1];
            const song = this.songs[jump.toSong];
            const playbackRate = jump.playbackRate;

            console.log(`\n   Salto ${i + 1}/${this.plannedRoute.length}:`);
            console.log(`      De: ${this.songs[jump.fromSong].name} (índice ${jump.fromSong}, beat ${jump.fromBeat})`);
            console.log(`      A: ${song.name} (índice ${jump.toSong}, beat ${jump.toBeat})`);

            this.timeMap.push({
                time: currentTime,
                songIndex: jump.toSong,
                beatIndex: jump.toBeat,
                isTransition: true
            });

            // 🎧 ESTRATEGIA DE DJ REAL:
            // Un DJ deja que cada canción suene 1-3 minutos, no 15 segundos
            // Reproduce la estructura completa: intro → verso → coro → verso → coro → outro
            // Solo cambia cuando la energía baja o se vuelve repetitiva
            
            let startBeat: number;
            let endBeat: number;
            const geminiSections = song.analysis.advanced?.gemini?.lyricSections;
            
            if (geminiSections && geminiSections.length > 0) {
                // 🎧 ESTRATEGIA DE DJ REAL CON GEMINI
                console.log(`      📊 Secciones: ${geminiSections.map(s => s.type).join(' → ')}`);
                
                // Encontrar el punto de entrada (donde el A* decidió entrar)
                const entryTime = song.analysis.beats[jump.toBeat]?.start || 0;
                
                // 🎯 PASO 1: Encontrar la sección que contiene el punto de entrada
                let entrySection = geminiSections.find(s => 
                    s.startTime <= entryTime && s.endTime >= entryTime
                );
                
                // Si no hay sección exacta, buscar la más cercana
                if (!entrySection) {
                    entrySection = geminiSections.reduce((closest, section) => {
                        const currentDist = Math.abs(section.startTime - entryTime);
                        const closestDist = Math.abs(closest.startTime - entryTime);
                        return currentDist < closestDist ? section : closest;
                    });
                }
                
                // 🎬 PASO 2: Empezar desde el INICIO de la sección (no en medio)
                // Esto evita cortar versos o coros a la mitad
                let startTime: number;
                if (entryTime < 20) {
                    // Si entramos muy temprano, empezar desde el inicio de la canción
                    startTime = 0;
                    console.log(`      🎬 Entrada temprana → Desde INICIO de canción`);
                } else {
                    // Empezar desde el inicio de la sección encontrada
                    startTime = entrySection.startTime;
                    console.log(`      🎯 Entrada en ${entrySection.type} → Desde INICIO de sección (${startTime.toFixed(1)}s)`);
                }
                
                startBeat = song.analysis.beats.findIndex(b => b.start >= startTime);
                if (startBeat === -1) startBeat = 0;
                
                // 🎵 PASO 3: Determinar punto de salida (después de secciones completas)
                const minDuration = 60;   // 1 minuto mínimo
                const idealDuration = 90; // 1.5 minutos ideal
                const maxDuration = 150;  // 2.5 minutos máximo
                
                // Encontrar todas las secciones que vienen después del punto de entrada
                const sectionsAfterEntry = geminiSections.filter(s => s.startTime >= startTime);
                
                // Buscar el mejor punto de salida
                let exitTime = startTime + idealDuration;
                let exitReason = 'duración ideal';
                
                // Prioridad 1: Salir después del segundo coro
                const chorusesAfterEntry = sectionsAfterEntry.filter(s => s.type === 'chorus');
                if (chorusesAfterEntry.length >= 2) {
                    const secondChorus = chorusesAfterEntry[1];
                    if (secondChorus.endTime >= startTime + minDuration) {
                        exitTime = secondChorus.endTime;
                        exitReason = `después del 2º coro (${secondChorus.endTime.toFixed(1)}s)`;
                    }
                } else if (chorusesAfterEntry.length === 1) {
                    // Si solo hay un coro, salir después de él
                    const chorus = chorusesAfterEntry[0];
                    if (chorus.endTime >= startTime + minDuration) {
                        exitTime = chorus.endTime;
                        exitReason = `después del coro (${chorus.endTime.toFixed(1)}s)`;
                    }
                }
                
                // Prioridad 2: Si hay outro, considerar salir ahí
                const outro = sectionsAfterEntry.find(s => s.type === 'outro');
                if (outro && outro.startTime >= startTime + minDuration && outro.startTime < exitTime) {
                    exitTime = outro.startTime;
                    exitReason = `inicio del outro (${outro.startTime.toFixed(1)}s)`;
                }
                
                // Limitar duración máxima y mínima
                exitTime = Math.max(exitTime, startTime + minDuration);
                exitTime = Math.min(exitTime, startTime + maxDuration, song.duration);
                
                // Convertir a beat
                endBeat = song.analysis.beats.findIndex(b => b.start >= exitTime);
                if (endBeat === -1) endBeat = song.analysis.beats.length;
                
                const duration = exitTime - startTime;
                console.log(`      ✅ Reproducir: ${startTime.toFixed(1)}s → ${exitTime.toFixed(1)}s`);
                console.log(`      ⏱️  Duración: ${duration.toFixed(1)}s (${(duration/60).toFixed(1)} min) - ${exitReason}`);
                console.log(`      📍 Beats: ${startBeat} → ${endBeat}`);
                
            } else {
                // SIN GEMINI: Reproducir al menos 60-90 segundos desde el punto de entrada
                console.log(`      ⚠️  Sin datos de Gemini, usando duración fija`);
                startBeat = jump.toBeat;
                
                const minBeats = 240;  // ~60 segundos a 120 BPM
                const idealBeats = 360; // ~90 segundos a 120 BPM
                
                // Intentar reproducir la duración ideal, pero al menos el mínimo
                endBeat = Math.min(startBeat + idealBeats, song.analysis.beats.length);
                
                if (endBeat - startBeat < minBeats) {
                    endBeat = Math.min(startBeat + minBeats, song.analysis.beats.length);
                }
                
                const estimatedDuration = (endBeat - startBeat) / 4; // Estimación aproximada
                console.log(`      ✅ Reproducir: beats ${startBeat} → ${endBeat} (~${estimatedDuration.toFixed(1)}s)`);
            }
            
            // VALIDACIÓN FINAL
            if (endBeat <= startBeat) {
                console.error(`      ❌ ERROR: endBeat (${endBeat}) <= startBeat (${startBeat})`);
                endBeat = Math.min(startBeat + 240, song.analysis.beats.length);
                console.error(`      ❌ Forzando mínimo de 240 beats (~60s)`);
            }
            
            // Asegurar que reproducimos al menos 45 segundos
            const minRequiredBeats = 180; // ~45 segundos
            if (endBeat - startBeat < minRequiredBeats) {
                endBeat = Math.min(startBeat + minRequiredBeats, song.analysis.beats.length);
                console.log(`      ⚠️  Ajustando a mínimo de 45s (${endBeat - startBeat} beats)`);
            }

            for (let j = startBeat; j < endBeat; j++) {
                const beat = song.analysis.beats[j];
                if (!beat) continue;
                this.timeMap.push({
                    time: currentTime,
                    songIndex: jump.toSong,
                    beatIndex: j,
                    isTransition: false
                });
                currentTime += beat.duration / playbackRate;
            }
        }
    }

    protected createFxChain(context: BaseAudioContext, withDelay: boolean = false): FxChain {
        const input = context.createGain();
        const lowShelf = context.createBiquadFilter();
        lowShelf.type = 'lowshelf';
        lowShelf.frequency.value = 320;
        lowShelf.gain.value = 0;

        const midPeak = context.createBiquadFilter();
        midPeak.type = 'peaking';
        midPeak.frequency.value = 1000;
        midPeak.Q.value = 0.5;
        midPeak.gain.value = 0;

        const highShelf = context.createBiquadFilter();
        highShelf.type = 'highshelf';
        highShelf.frequency.value = 3200;
        highShelf.gain.value = 0;

        const output = context.createGain();

        input.connect(lowShelf);
        lowShelf.connect(midPeak);
        midPeak.connect(highShelf);
        highShelf.connect(output);

        const chain: FxChain = {
            input,
            lowShelf,
            midPeak,
            highShelf,
            output,
            gain: input
        };

        if (withDelay) {
            const delay = context.createDelay(2.0);
            delay.delayTime.value = 0.375;
            const feedback = context.createGain();
            feedback.gain.value = 0;

            highShelf.connect(delay);
            delay.connect(feedback);
            feedback.connect(delay);
            delay.connect(output);

            chain.delay = delay;
            chain.feedback = feedback;
        }

        return chain;
    }

    protected applyTransitionIn(
        fxChain: FxChain,
        time: number,
        type: 'crossfade' | 'cut' | 'beatmatch',
        volume: number,
        crossfadeDuration: number
    ) {
        const { gain, lowShelf, midPeak, highShelf } = fxChain;

        if (type === 'cut') {
            // Corte rápido pero suave (evita clicks)
            const cutDuration = 0.05; // 50ms para evitar clicks
            gain.gain.setValueAtTime(0, time - cutDuration);
            gain.gain.exponentialRampToValueAtTime(volume, time);
        } else if (type === 'beatmatch') {
            // Beatmatch: Fade largo con filtro de bajos progresivo
            const fadeStart = time - crossfadeDuration;
            const bassPoint1 = time - (crossfadeDuration * 0.7); // Primer tercio
            const bassPoint2 = time - (crossfadeDuration * 0.4); // Segundo tercio
            const fullPoint = time - (crossfadeDuration * 0.1);  // Casi al final
            
            // Fade de volumen con curva exponencial (más natural)
            gain.gain.setValueAtTime(0.001, fadeStart); // Evitar 0 para exponential
            gain.gain.exponentialRampToValueAtTime(volume * 0.3, bassPoint1);
            gain.gain.exponentialRampToValueAtTime(volume * 0.7, bassPoint2);
            gain.gain.exponentialRampToValueAtTime(volume, fullPoint);
            gain.gain.setValueAtTime(volume, time);
            
            // Filtro de bajos progresivo (entra gradualmente)
            lowShelf.gain.setValueAtTime(-24, fadeStart); // Más corte inicial
            lowShelf.gain.linearRampToValueAtTime(-12, bassPoint1);
            lowShelf.gain.linearRampToValueAtTime(-4, bassPoint2);
            lowShelf.gain.linearRampToValueAtTime(0, fullPoint);
            
            // Boost de agudos al inicio (claridad)
            highShelf.gain.setValueAtTime(3, fadeStart);
            highShelf.gain.linearRampToValueAtTime(0, bassPoint2);
        } else {
            // Crossfade estándar con curva suave y progresiva (como DJ real)
            const fadeStart = time - crossfadeDuration;
            const point1 = time - (crossfadeDuration * 0.75); // 25% del fade
            const point2 = time - (crossfadeDuration * 0.50); // 50% del fade
            const point3 = time - (crossfadeDuration * 0.25); // 75% del fade
            
            // Curva de fade in muy suave con múltiples puntos
            gain.gain.setValueAtTime(0.001, fadeStart);
            gain.gain.exponentialRampToValueAtTime(volume * 0.1, point1);
            gain.gain.exponentialRampToValueAtTime(volume * 0.4, point2);
            gain.gain.exponentialRampToValueAtTime(volume * 0.8, point3);
            gain.gain.exponentialRampToValueAtTime(volume, time);
            
            // Filtro de bajos progresivo para entrada más suave
            lowShelf.gain.setValueAtTime(-12, fadeStart);
            lowShelf.gain.linearRampToValueAtTime(-6, point2);
            lowShelf.gain.linearRampToValueAtTime(0, time);
        }
        
        // Resetear filtros al final
        lowShelf.gain.setValueAtTime(0, time);
        midPeak.gain.setValueAtTime(0, time);
        highShelf.gain.setValueAtTime(0, time);
    }

    protected applyTransitionOut(
        fxChain: FxChain,
        time: number,
        type: 'crossfade' | 'cut' | 'beatmatch',
        currentVolume: number,
        crossfadeDuration: number
    ) {
        const { gain, lowShelf, highShelf } = fxChain;

        if (type === 'cut') {
            // Corte rápido pero suave (evita clicks)
            const cutDuration = 0.05; // 50ms para evitar clicks
            gain.gain.setValueAtTime(currentVolume, time - cutDuration);
            gain.gain.exponentialRampToValueAtTime(0.001, time);
        } else if (type === 'beatmatch') {
            // Beatmatch: Fade out largo con filtro progresivo
            const fadeStart = time - crossfadeDuration;
            const bassPoint1 = time - (crossfadeDuration * 0.7); // Primer tercio
            const bassPoint2 = time - (crossfadeDuration * 0.4); // Segundo tercio
            const endPoint = time - (crossfadeDuration * 0.1);   // Casi al final
            
            // Fade de volumen con curva exponencial
            gain.gain.setValueAtTime(currentVolume, fadeStart);
            gain.gain.exponentialRampToValueAtTime(currentVolume * 0.7, bassPoint1);
            gain.gain.exponentialRampToValueAtTime(currentVolume * 0.3, bassPoint2);
            gain.gain.exponentialRampToValueAtTime(0.001, time);
            
            // Filtro de bajos progresivo (sale gradualmente)
            lowShelf.gain.setValueAtTime(0, fadeStart);
            lowShelf.gain.linearRampToValueAtTime(-8, bassPoint1);
            lowShelf.gain.linearRampToValueAtTime(-16, bassPoint2);
            lowShelf.gain.linearRampToValueAtTime(-24, endPoint);
            
            // Reducir agudos al final (suaviza salida)
            highShelf.gain.setValueAtTime(0, fadeStart);
            highShelf.gain.linearRampToValueAtTime(-6, bassPoint2);
            highShelf.gain.linearRampToValueAtTime(-12, time);
        } else {
            // Crossfade estándar con curva suave y progresiva (como DJ real)
            const fadeStart = time - crossfadeDuration;
            const point1 = time - (crossfadeDuration * 0.75); // 25% del fade
            const point2 = time - (crossfadeDuration * 0.50); // 50% del fade
            const point3 = time - (crossfadeDuration * 0.25); // 75% del fade
            
            // Curva de fade out muy suave con múltiples puntos
            gain.gain.setValueAtTime(currentVolume, fadeStart);
            gain.gain.exponentialRampToValueAtTime(currentVolume * 0.8, point1);
            gain.gain.exponentialRampToValueAtTime(currentVolume * 0.4, point2);
            gain.gain.exponentialRampToValueAtTime(currentVolume * 0.1, point3);
            gain.gain.exponentialRampToValueAtTime(0.001, time);
            
            // Filtro de bajos progresivo para salida más suave
            lowShelf.gain.setValueAtTime(0, fadeStart);
            lowShelf.gain.linearRampToValueAtTime(-6, point2);
            lowShelf.gain.linearRampToValueAtTime(-12, time);
        }
    }

    /**
     * Reproducir mezcla
     */
    play() {
        if (this.isPlaying) return;
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
        if (!this.preRenderedBuffer) {
            console.warn('⚠️ No hay mezcla cargada');
            return;
        }

        this.songsVisited.add(this.currentSongIndex);

        if (this.currentSource) {
            this.currentSource.stop();
            this.currentSource.disconnect();
        }

        this.currentSource = this.audioContext.createBufferSource();
        this.currentSource.buffer = this.preRenderedBuffer;
        this.currentSource.connect(this.masterGain);

        const offset = this.pausedAtTime;
        this.currentSource.start(0, offset);
        this.playbackStartTime = this.audioContext.currentTime - offset;

        this.isPlaying = true;
        this.updatePlaybackState();

        console.log('▶️  Reproduciendo');
    }

    pause() {
        if (!this.isPlaying) return;

        this.pausedAtTime = this.audioContext.currentTime - this.playbackStartTime;

        if (this.currentSource) {
            this.currentSource.stop();
            this.currentSource.disconnect();
            this.currentSource = null;
        }

        this.isPlaying = false;
        console.log('⏸️  Pausado');
    }

    stop() {
        this.pause();
        this.pausedAtTime = 0;
        this.playbackStartTime = 0;
        this.currentSongIndex = 0;
        this.currentBeatIndex = 0;
        console.log('⏹️  Detenido');
    }

    seek(seconds: number) {
        const wasPlaying = this.isPlaying;

        // Pausar si está reproduciendo
        if (wasPlaying) {
            this.pause();
        }

        // Calcular nueva posición
        let newTime = this.pausedAtTime + seconds;
        const totalDuration = this.getTotalDuration();

        // Limitar entre 0 y duración total
        newTime = Math.max(0, Math.min(newTime, totalDuration - 1));

        this.pausedAtTime = newTime;

        // Reanudar si estaba reproduciendo
        if (wasPlaying) {
            this.play();
        }

        console.log(`⏩ Seek: ${seconds > 0 ? '+' : ''}${seconds}s → ${newTime.toFixed(1)}s`);
    }

    setVolume(volume: number) {
        // Volumen entre 0 y 1
        const normalizedVolume = Math.max(0, Math.min(1, volume / 100));
        this.masterGain.gain.value = normalizedVolume;
        console.log(`🔊 Volumen: ${volume}%`);
    }

    protected updatePlaybackState() {
        if (!this.isPlaying) return;

        const currentTime = this.audioContext.currentTime - this.playbackStartTime;

        // Buscar posición actual en el timeMap
        for (let i = 0; i < this.timeMap.length; i++) {
            const entry = this.timeMap[i];
            const nextEntry = this.timeMap[i + 1];

            if (currentTime >= entry.time && (!nextEntry || currentTime < nextEntry.time)) {
                this.currentSongIndex = entry.songIndex;
                this.currentBeatIndex = entry.beatIndex;

                const song = this.songs[entry.songIndex];
                const beat = song.analysis.beats[entry.beatIndex];

                this.onStateUpdate({
                    currentSongIndex: entry.songIndex,
                    currentBeatIndex: entry.beatIndex,
                    currentBeat: beat
                }, null);

                break;
            }
        }

        requestAnimationFrame(() => this.updatePlaybackState());
    }

    getIsPlaying(): boolean {
        return this.isPlaying;
    }

    getCurrentTime(): number {
        if (!this.isPlaying) return this.pausedAtTime;
        return this.audioContext.currentTime - this.playbackStartTime;
    }

    getTotalDuration(): number {
        return this.preRenderedBuffer?.duration || 0;
    }

    getPlannedRoute(): PlannedJump[] {
        return this.plannedRoute;
    }

    getTransitionLog(): string[] {
        return this.transitionLog;
    }

    getStats(): any {
        if (!this.preRenderedBuffer) {
            return null;
        }

        const currentTime = this.getCurrentTime();
        const totalDuration = this.getTotalDuration();

        // Encontrar el próximo salto y su información
        let nextJumpTime = 0;
        let nextJumpInfo: any = null;

        for (let i = 0; i < this.timeMap.length; i++) {
            const entry = this.timeMap[i];
            if (entry.isTransition && entry.time > currentTime) {
                nextJumpTime = entry.time;

                // Buscar información del salto en plannedRoute
                const jump = this.plannedRoute.find(j =>
                    j.toSong === entry.songIndex && j.toBeat === entry.beatIndex
                );

                if (jump) {
                    const fromSong = this.songs[jump.fromSong];
                    const toSong = this.songs[jump.toSong];

                    nextJumpInfo = {
                        fromSong: fromSong.name,
                        toSong: toSong.name,
                        type: jump.transitionType,
                        time: nextJumpTime,
                        timeRemaining: nextJumpTime - currentTime
                    };
                }
                break;
            }
        }

        // Encontrar canción actual
        let currentSongName = '';
        for (let i = 0; i < this.timeMap.length; i++) {
            const entry = this.timeMap[i];
            const nextEntry = this.timeMap[i + 1];

            if (currentTime >= entry.time && (!nextEntry || currentTime < nextEntry.time)) {
                currentSongName = this.songs[entry.songIndex]?.name || '';
                break;
            }
        }

        return {
            currentTime,
            totalDuration,
            currentSong: currentSongName,
            nextJump: nextJumpInfo,
            totalJumps: this.plannedRoute.length,
            songsVisited: this.songsVisited.size,
            isPlaying: this.isPlaying
        };
    }

    /**
     * Descargar mezcla como archivo WAV
     */
    downloadMixAsMP3(): void {
        if (!this.preRenderedBuffer) {
            console.warn('⚠️ No hay mezcla para descargar');
            return;
        }

        console.log('💾 Preparando descarga de mezcla...');

        // Convertir AudioBuffer a WAV
        const wavBlob = this.audioBufferToWav(this.preRenderedBuffer);

        // Crear URL y descargar
        const url = URL.createObjectURL(wavBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `aura-loop-mix-${Date.now()}.wav`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        console.log('✅ Descarga iniciada');
    }

    /**
     * Convertir AudioBuffer a WAV
     */
    private audioBufferToWav(buffer: AudioBuffer): Blob {
        const numberOfChannels = buffer.numberOfChannels;
        const sampleRate = buffer.sampleRate;
        const format = 1; // PCM
        const bitDepth = 16;

        const bytesPerSample = bitDepth / 8;
        const blockAlign = numberOfChannels * bytesPerSample;

        const data = new Float32Array(buffer.length * numberOfChannels);
        for (let channel = 0; channel < numberOfChannels; channel++) {
            const channelData = buffer.getChannelData(channel);
            for (let i = 0; i < buffer.length; i++) {
                data[i * numberOfChannels + channel] = channelData[i];
            }
        }

        const dataLength = data.length * bytesPerSample;
        const bufferLength = 44 + dataLength;
        const arrayBuffer = new ArrayBuffer(bufferLength);
        const view = new DataView(arrayBuffer);

        // WAV header
        const writeString = (offset: number, string: string) => {
            for (let i = 0; i < string.length; i++) {
                view.setUint8(offset + i, string.charCodeAt(i));
            }
        };

        writeString(0, 'RIFF');
        view.setUint32(4, bufferLength - 8, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, format, true);
        view.setUint16(22, numberOfChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * blockAlign, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, bitDepth, true);
        writeString(36, 'data');
        view.setUint32(40, dataLength, true);

        // PCM samples
        let offset = 44;
        for (let i = 0; i < data.length; i++) {
            const sample = Math.max(-1, Math.min(1, data[i]));
            view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
            offset += 2;
        }

        return new Blob([arrayBuffer], { type: 'audio/wav' });
    }

    /**
     * NUEVO: Exportar análisis ULTRA detallado con TODOS los puntos y transiciones
     */
    exportUltraDetailedAnalysis(): string {
        if (!this.pathFinderEngine || !this.bestPathFound) {
            return 'Error: No hay análisis disponible. Ejecuta planCompleteRoute() primero.';
        }

        return this.pathFinderEngine.exportDetailedAnalysis(this.bestPathFound);
    }

    /**
     * Exportar análisis estándar (compatible con versión anterior)
     */
    exportAnalysis(): string {
        const lines: string[] = [];
        const width = 100;

        // Header
        lines.push('═'.repeat(width));
        lines.push('ANÁLISIS ULTRA DETALLADO DE MEZCLA - AURA LOOP');
        lines.push('Sistema de Scoring Híbrido: Técnico + Gemini AI');
        lines.push('═'.repeat(width));
        lines.push('');
        lines.push(`Fecha: ${new Date().toLocaleString()}`);
        lines.push(`Total de canciones: ${this.songs.length}`);
        lines.push(`Total de saltos planificados: ${this.plannedRoute.length}`);
        lines.push(`Duración total de la mezcla: ${(this.getTotalDuration() / 60).toFixed(1)} minutos`);
        lines.push('');

        // Resumen de canciones
        lines.push('─'.repeat(width));
        lines.push('CANCIONES EN LA MEZCLA');
        lines.push('─'.repeat(width));
        this.songs.forEach((song, idx) => {
            lines.push(`${idx + 1}. ${song.name}`);
            lines.push(`   Duración: ${song.duration.toFixed(1)}s | Tempo: ${song.analysis.track.tempo.toFixed(1)} BPM | Key: ${song.analysis.track.key} | Mode: ${song.analysis.track.mode ? 'Major' : 'Minor'}`);

            // Info de Gemini si existe
            if (song.analysis.advanced?.gemini) {
                const gemini = song.analysis.advanced.gemini;
                lines.push(`   🧠 Gemini: ${gemini.themes.join(', ')}`);
                lines.push(`   Mood: Energy=${gemini.mood.energy}, Emotion=${gemini.mood.emotion}`);
                lines.push(`   Secciones: ${gemini.lyricSections.length} | Puntos de transición: ${gemini.transitionPoints.length}`);
            }
            lines.push('');
        });

        // Análisis detallado de cada salto
        lines.push('═'.repeat(width));
        lines.push('ANÁLISIS DETALLADO DE TRANSICIONES');
        lines.push('═'.repeat(width));
        lines.push('');

        for (let i = 0; i < this.plannedRoute.length; i++) {
            const jump = this.plannedRoute[i];
            const fromSong = this.songs[jump.fromSong];
            const toSong = this.songs[jump.toSong];

            lines.push('▼'.repeat(width));
            lines.push(`SALTO ${i + 1} de ${this.plannedRoute.length}`);
            lines.push('▼'.repeat(width));
            lines.push('');

            // Información básica
            lines.push('📍 INFORMACIÓN BÁSICA');
            lines.push('─'.repeat(width));
            lines.push(`De: ${fromSong.name}`);
            lines.push(`    Beat: ${jump.fromBeat} / ${fromSong.analysis.beats.length}`);
            lines.push(`    Tiempo: ${fromSong.analysis.beats[jump.fromBeat]?.start.toFixed(2)}s`);
            lines.push('');
            lines.push(`A:  ${toSong.name}`);
            lines.push(`    Beat: ${jump.toBeat} / ${toSong.analysis.beats.length}`);
            lines.push(`    Tiempo: ${toSong.analysis.beats[jump.toBeat]?.start.toFixed(2)}s`);
            lines.push('');

            // Score total y breakdown
            lines.push('🎯 SCORE TOTAL: ' + jump.score.toFixed(2) + ' puntos');
            lines.push('─'.repeat(width));

            // Calcular breakdown detallado
            const scoreBreakdown = this.calculateTransitionScore(
                fromSong,
                jump.fromBeat,
                toSong,
                jump.toBeat,
                jump.transition.distance
            );

            lines.push('📊 DESGLOSE DE PUNTUACIÓN:');
            lines.push(scoreBreakdown.breakdown);
            lines.push('');

            // NUEVO: Análisis de Estructura (Fraseo)
            const structural = this.calculateStructuralScore(fromSong, jump.fromBeat, toSong, jump.toBeat);
            lines.push('🎼 ANÁLISIS ESTRUCTURAL (Fraseo) - PESO: 2.0x');
            lines.push('─'.repeat(width));

            const fromBeat = fromSong.analysis.beats[jump.fromBeat];
            const toBeat = toSong.analysis.beats[jump.toBeat];

            lines.push(`Downbeats (el "1" del compás):`);
            lines.push(`  Origen en downbeat: ${fromBeat?.isDownbeat ? '✅ SÍ' : '❌ NO'}`);
            lines.push(`  Destino en downbeat: ${toBeat?.isDownbeat ? '✅ SÍ' : '❌ NO'}`);
            lines.push('');

            const fromGeminiStruct = fromSong.analysis.advanced?.gemini;
            const toGeminiStruct = toSong.analysis.advanced?.gemini;

            if (fromGeminiStruct && toGeminiStruct) {
                const fromBeatTime = fromBeat?.start || 0;
                const toBeatTime = toBeat?.start || 0;
                const fromSection = this.findSectionForBeat(fromGeminiStruct.lyricSections, fromBeatTime);
                const toSection = this.findSectionForBeat(toGeminiStruct.lyricSections, toBeatTime);

                lines.push(`Secciones:`);
                lines.push(`  Origen: ${fromSection?.type || 'desconocida'} (${fromBeatTime.toFixed(1)}s)`);
                lines.push(`  Destino: ${toSection?.type || 'desconocida'} (${toBeatTime.toFixed(1)}s)`);
                lines.push(`  Transición: ${fromSection?.type || '?'} → ${toSection?.type || '?'}`);
            }

            lines.push(`Score: ${structural.score.toFixed(0)} / 300`);
            lines.push(`Razón: ${structural.reason}`);
            lines.push('');

            // NUEVO: Análisis de Armonía (Clave Musical)
            const harmony = this.calculateKeyCompatibilityScore(fromSong, toSong);
            lines.push('🎹 ANÁLISIS ARMÓNICO (Clave Musical) - PESO: 1.5x');
            lines.push('─'.repeat(width));

            const keyNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
            const fromKey = fromSong.analysis.track.key;
            const toKey = toSong.analysis.track.key;
            const fromMode = fromSong.analysis.track.mode;
            const toMode = toSong.analysis.track.mode;

            lines.push(`Clave origen: ${keyNames[fromKey]} ${fromMode ? 'Mayor' : 'menor'}`);
            lines.push(`Clave destino: ${keyNames[toKey]} ${toMode ? 'Mayor' : 'menor'}`);
            lines.push(`Diferencia: ${Math.abs(fromKey - toKey)} semitonos`);
            lines.push(`Score: ${harmony.score.toFixed(0)} / 200`);
            lines.push(`Razón: ${harmony.reason}`);
            lines.push('');

            // Análisis técnico detallado
            lines.push('⚡ ANÁLISIS TÉCNICO (0-300 puntos)');
            lines.push('─'.repeat(width));

            const fromAnalysis = fromSong.analysis.advanced;
            const toAnalysis = toSong.analysis.advanced;

            if (fromAnalysis && toAnalysis) {
                const fromEnergy = fromAnalysis.energyPerBeat[jump.fromBeat] || 0;
                const toEnergy = toAnalysis.energyPerBeat[jump.toBeat] || 0;
                const energyDiff = Math.abs(fromEnergy - toEnergy);
                const energyScore = Math.max(0, 100 * (1 - energyDiff * 5));

                lines.push(`Energía:`);
                lines.push(`  Canción origen: ${fromEnergy.toFixed(3)}`);
                lines.push(`  Canción destino: ${toEnergy.toFixed(3)}`);
                lines.push(`  Diferencia: ${energyDiff.toFixed(3)}`);
                lines.push(`  Score: ${energyScore.toFixed(1)} / 100 (mejor si es similar)`);
                lines.push('');

                const fromHasVocal = fromAnalysis.isVocalPerBeat[jump.fromBeat];
                const toHasVocal = toAnalysis.isVocalPerBeat[jump.toBeat];
                let vocalScore = 0;
                if (!fromHasVocal && !toHasVocal) vocalScore = 100;
                else if (!fromHasVocal || !toHasVocal) vocalScore = 50;

                lines.push(`Vocales:`);
                lines.push(`  Origen tiene vocal: ${fromHasVocal ? 'Sí' : 'No'}`);
                lines.push(`  Destino tiene vocal: ${toHasVocal ? 'Sí' : 'No'}`);
                lines.push(`  Score: ${vocalScore} / 100 (mejor sin vocales en transición)`);
                lines.push('');

                const fromTempo = fromSong.analysis.track.tempo;
                const toTempo = toSong.analysis.track.tempo;
                const tempoDiff = Math.abs(fromTempo - toTempo);
                const tempoScore = Math.max(0, 100 * (1 - tempoDiff / 40));

                lines.push(`Tempo:`);
                lines.push(`  Origen: ${fromTempo.toFixed(1)} BPM`);
                lines.push(`  Destino: ${toTempo.toFixed(1)} BPM`);
                lines.push(`  Diferencia: ${tempoDiff.toFixed(1)} BPM`);
                lines.push(`  Score: ${tempoScore.toFixed(1)} / 100`);
                lines.push(`  Playback rate ajustado: ${(jump.playbackRate * 100).toFixed(1)}%`);
                lines.push('');
            }

            // Análisis de Gemini detallado
            lines.push('🧠 ANÁLISIS GEMINI AI (0-500 puntos) - PESO ALTO');
            lines.push('─'.repeat(width));

            const fromGemini = fromSong.analysis.advanced?.gemini;
            const toGemini = toSong.analysis.advanced?.gemini;

            if (fromGemini && toGemini) {
                const fromBeatTime = fromSong.analysis.beats[jump.fromBeat]?.start || 0;
                const toBeatTime = toSong.analysis.beats[jump.toBeat]?.start || 0;

                // Puntos de transición sugeridos
                lines.push('Puntos de transición sugeridos por Gemini:');
                const fromNearPoint = fromGemini.transitionPoints.find(p =>
                    Math.abs(p.beatTime - fromBeatTime) < 2.0
                );
                const toNearPoint = toGemini.transitionPoints.find(p =>
                    Math.abs(p.beatTime - toBeatTime) < 2.0
                );

                if (fromNearPoint) {
                    lines.push(`  Origen: ${fromNearPoint.reason}`);
                    lines.push(`    Calidad: ${fromNearPoint.quality}`);
                    lines.push(`    Score: ${fromNearPoint.quality === 'excellent' ? 100 : fromNearPoint.quality === 'good' ? 70 : 40} / 100`);
                } else {
                    lines.push(`  Origen: No hay punto de transición cercano (0 puntos)`);
                }

                if (toNearPoint) {
                    lines.push(`  Destino: ${toNearPoint.reason}`);
                    lines.push(`    Calidad: ${toNearPoint.quality}`);
                    lines.push(`    Score: ${toNearPoint.quality === 'excellent' ? 100 : toNearPoint.quality === 'good' ? 70 : 40} / 100`);
                } else {
                    lines.push(`  Destino: No hay punto de transición cercano (0 puntos)`);
                }
                lines.push('');

                // Compatibilidad temática
                const sharedThemes = fromGemini.themes.filter(t => toGemini.themes.includes(t));
                const themeScore = Math.min(150, sharedThemes.length * 30);

                lines.push('Compatibilidad temática:');
                lines.push(`  Temas origen: ${fromGemini.themes.join(', ')}`);
                lines.push(`  Temas destino: ${toGemini.themes.join(', ')}`);
                lines.push(`  Temas compartidos: ${sharedThemes.length > 0 ? sharedThemes.join(', ') : 'Ninguno'}`);
                lines.push(`  Score: ${themeScore} / 150 (30 puntos por tema compartido)`);
                lines.push('');

                // Compatibilidad de mood
                const energyMatch = fromGemini.mood.energy === toGemini.mood.energy;
                const emotionMatch = fromGemini.mood.emotion === toGemini.mood.emotion;
                let moodScore = 0;
                if (energyMatch && emotionMatch) moodScore = 100;
                else if (energyMatch || emotionMatch) moodScore = 50;

                lines.push('Compatibilidad de mood:');
                lines.push(`  Origen: Energy=${fromGemini.mood.energy}, Emotion=${fromGemini.mood.emotion}`);
                lines.push(`  Destino: Energy=${toGemini.mood.energy}, Emotion=${toGemini.mood.emotion}`);
                lines.push(`  Energy match: ${energyMatch ? 'Sí' : 'No'}`);
                lines.push(`  Emotion match: ${emotionMatch ? 'Sí' : 'No'}`);
                lines.push(`  Score: ${moodScore} / 100`);
                lines.push('');

                // Estructura
                const fromSection = this.findSectionForBeat(fromGemini.lyricSections, fromBeatTime);
                const toSection = this.findSectionForBeat(toGemini.lyricSections, toBeatTime);
                let structureScore = 0;
                if (fromSection?.type === 'outro' && toSection?.type === 'intro') structureScore = 50;
                else if (fromSection?.type === 'chorus' && toSection?.type === 'chorus') structureScore = 30;

                lines.push('Compatibilidad estructural:');
                lines.push(`  Sección origen: ${fromSection?.type || 'desconocida'}`);
                lines.push(`  Sección destino: ${toSection?.type || 'desconocida'}`);
                lines.push(`  Score: ${structureScore} / 50 (outro→intro es ideal)`);
                lines.push('');
            } else {
                lines.push('⚠️  Análisis Gemini no disponible para estas canciones');
                lines.push('');
            }

            // Tipo de transición
            lines.push('🎚️  TIPO DE TRANSICIÓN');
            lines.push('─'.repeat(width));
            lines.push(`Tipo seleccionado: ${jump.transitionType}`);
            const duration = jump.transitionType === 'cut' ? '0.1s' : 
                           jump.transitionType === 'beatmatch' ? '4.0s' : '2.0s';
            lines.push(`Duración de crossfade: ${duration}`);

            const transitionExplanations: any = {
                'crossfade': 'Mezcla suave y gradual entre canciones (2 segundos)',
                'cut': 'Corte rápido y directo (0.1 segundos) - Para cambios dramáticos',
                'beatmatch': 'Beatmatch profesional (4 segundos) - Mantiene el groove'
            };

            lines.push(`Explicación: ${transitionExplanations[jump.transitionType] || 'Transición estándar'}`);
            lines.push('');

            // Candidatos descartados (top 5)
            lines.push('🔍 CANDIDATOS ALTERNATIVOS EVALUADOS');
            lines.push('─'.repeat(width));
            lines.push('(Mostrando top 5 candidatos descartados con sus scores)');
            lines.push('');

            // Buscar candidatos alternativos en transitions.cross
            const alternativeCandidates = this.transitions.cross
                .filter(t =>
                    t.from.songIndex === jump.fromSong &&
                    Math.abs(t.from.beatIndex - jump.fromBeat) < 50
                )
                .slice(0, 6) // Top 6 (incluyendo el seleccionado)
                .map(t => {
                    const candidateToSong = this.songs[t.to.songIndex];
                    const scoreData = this.calculateTransitionScore(
                        fromSong,
                        t.from.beatIndex,
                        candidateToSong,
                        t.to.beatIndex,
                        t.distance
                    );
                    return {
                        toSong: candidateToSong.name,
                        toBeat: t.to.beatIndex,
                        score: scoreData.score,
                        breakdown: scoreData.breakdown,
                        isSelected: t.to.songIndex === jump.toSong && t.to.beatIndex === jump.toBeat
                    };
                })
                .sort((a, b) => b.score - a.score);

            alternativeCandidates.forEach((candidate, idx) => {
                const marker = candidate.isSelected ? '✓ SELECCIONADO' : `  Alternativa ${idx}`;
                lines.push(`${marker}:`);
                lines.push(`  → ${candidate.toSong} (beat ${candidate.toBeat})`);
                lines.push(`  Score: ${candidate.score.toFixed(2)} puntos`);
                lines.push(`  ${candidate.breakdown}`);
                lines.push('');
            });

            lines.push('');
        }

        // Footer
        lines.push('═'.repeat(width));
        lines.push('FIN DEL ANÁLISIS');
        lines.push('═'.repeat(width));
        lines.push('');
        lines.push('Leyenda de scoring:');
        lines.push('  • Distancia euclidiana: 0-200 puntos (menor distancia = mejor)');
        lines.push('  • Análisis técnico: 0-300 puntos (energía, vocales, tempo)');
        lines.push('  • Análisis Gemini: 0-500 puntos (PESO ALTO - temas, mood, estructura)');
        lines.push('  • Bonus por gaps: 0-100 puntos (gaps ideales: 30-90 segundos)');
        lines.push('  • Score total máximo: ~1100 puntos');
        lines.push('');
        lines.push('El sistema elige la transición con el score más alto.');
        lines.push('Gemini AI tiene el mayor peso porque entiende letras, estructura y contexto musical.');

        return lines.join('\n');
    }
}

export default AudioPlayer;
