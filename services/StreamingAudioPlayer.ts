/**
 * Streaming Audio Player - Pre-renderizado por bloques
 * 
 * Sistema de ventana deslizante:
 * - Pre-renderiza bloques de 5 minutos
 * - Mantiene 5min adelante + 5min atrás cargados
 * - Libera memoria de bloques antiguos
 * - Soporta bibliotecas ilimitadas
 */

import AudioPlayer from './AudioPlayer';

interface AudioBlock {
    startTime: number;
    endTime: number;
    buffer: AudioBuffer;
    jumps: Array<{
        time: number;
        fromSong: number;
        toSong: number;
        type: string;
    }>;
}

export class StreamingAudioPlayer extends AudioPlayer {
    private readonly BLOCK_DURATION = 300; // 5 minutos en segundos
    private readonly PRELOAD_AHEAD = 300; // 5 minutos adelante
    private readonly KEEP_BEHIND = 300; // 5 minutos atrás

    private blocks: Map<number, AudioBlock> = new Map();
    private currentBlockIndex = 0;
    private isPreloading = false;
    private preloadQueue: number[] = [];

    /**
     * Override: Pre-renderizar solo el primer bloque
     */
    async preRenderMix(): Promise<void> {
        if (this.plannedRoute.length === 0) {
            console.log('⚠️ No hay ruta planificada');
            return;
        }

        console.log('\n🎨 PRE-RENDERIZADO POR BLOQUES (5 minutos)');
        console.log('═'.repeat(80));

        this.generateTimeMap();

        // Pre-renderizar primer bloque (0-5min)
        await this.renderBlock(0);

        // Pre-cargar segundo bloque en background
        this.schedulePreload(1);

        console.log('✅ Primer bloque listo, reproducción puede comenzar');
    }

    /**
     * Renderizar un bloque específico
     */
    private async renderBlock(blockIndex: number): Promise<void> {
        if (this.blocks.has(blockIndex)) {
            console.log(`⏭️ Bloque ${blockIndex} ya renderizado`);
            return;
        }

        const startTime = blockIndex * this.BLOCK_DURATION;
        const endTime = startTime + this.BLOCK_DURATION;

        console.log(`🎨 Renderizando bloque ${blockIndex} (${this.formatTime(startTime)} - ${this.formatTime(endTime)})`);

        // Filtrar timeMap para este bloque
        const blockTimeMap = this.timeMap.filter(
            entry => entry.time >= startTime && entry.time < endTime
        );

        if (blockTimeMap.length === 0) {
            console.log(`⚠️ Bloque ${blockIndex} vacío`);
            return;
        }

        // Calcular duración real del bloque
        const actualDuration = Math.min(
            this.BLOCK_DURATION,
            this.timeMap[this.timeMap.length - 1].time - startTime + 60
        );

        const sampleRate = 44100;
        const offlineContext = new OfflineAudioContext(
            2,
            Math.ceil(actualDuration * sampleRate),
            sampleRate
        );

        // Renderizar transiciones en este bloque
        const transitions = blockTimeMap.filter(p => p.isTransition);
        const jumps: AudioBlock['jumps'] = [];

        for (let i = 0; i < transitions.length; i++) {
            const transition = transitions[i];
            const nextTransition = transitions[i + 1];
            const song = this.songs[transition.songIndex];
            const beat = song.analysis.beats[transition.beatIndex];

            const plannedJump = this.plannedRoute.find(j =>
                j.toSong === transition.songIndex && j.toBeat === transition.beatIndex
            );

            if (!plannedJump) continue;

            const playbackRate = plannedJump.playbackRate || 1.0;
            const transitionType = plannedJump.transitionType || 'crossfade';

            let effectiveCrossfade = this.crossfadeDuration;
            if (transitionType === 'cut') effectiveCrossfade = 0.5;
            else if (transitionType === 'beatmatch') effectiveCrossfade = 4.0;

            const fxChain = this.createFxChain(offlineContext, false);
            const source = offlineContext.createBufferSource();

            source.buffer = this.audioBuffers[song.id];
            source.connect(fxChain.input);
            fxChain.output.connect(offlineContext.destination);
            source.playbackRate.value = playbackRate;

            const vol = (this.normalizedVolumes[song.id] || 1.0) * 0.6;

            // Ajustar tiempos relativos al bloque
            const transitionTimeInBlock = transition.time - startTime;
            const startTimeInMix = transitionTimeInBlock - effectiveCrossfade;
            const startTimeInAudio = Math.max(0, beat.start - effectiveCrossfade);

            this.applyTransitionIn(fxChain, transitionTimeInBlock, transitionType, vol, effectiveCrossfade);

            if (nextTransition) {
                const duration = nextTransition.time - transition.time;
                const nextPlannedJump = this.plannedRoute.find(j =>
                    j.toSong === nextTransition.songIndex && j.toBeat === nextTransition.beatIndex
                );
                const nextTransitionType = nextPlannedJump?.transitionType || 'crossfade';
                let nextEffectiveCrossfade = this.crossfadeDuration;
                if (nextTransitionType === 'cut') nextEffectiveCrossfade = 0.5;
                else if (nextTransitionType === 'beatmatch') nextEffectiveCrossfade = 4.0;

                const nextTransitionTimeInBlock = nextTransition.time - startTime;
                this.applyTransitionOut(fxChain, nextTransitionTimeInBlock, nextTransitionType, vol, nextEffectiveCrossfade);

                const totalDuration = (duration + effectiveCrossfade + nextEffectiveCrossfade) / playbackRate;
                source.start(startTimeInMix, startTimeInAudio, totalDuration);
            } else {
                fxChain.gain.gain.setValueAtTime(vol, transitionTimeInBlock);
                const totalDuration = (60 + effectiveCrossfade) / playbackRate;
                source.start(startTimeInMix, startTimeInAudio, totalDuration);
            }

            // Guardar info del salto
            jumps.push({
                time: transition.time,
                fromSong: plannedJump.fromSong,
                toSong: transition.songIndex,
                type: transitionType
            });
        }

        // Renderizar bloque
        const buffer = await offlineContext.startRendering();

        // Guardar bloque
        this.blocks.set(blockIndex, {
            startTime,
            endTime,
            buffer,
            jumps
        });

        console.log(`✅ Bloque ${blockIndex} renderizado (${(buffer.duration / 60).toFixed(1)}min)`);

        // Limpiar bloques antiguos
        this.cleanupOldBlocks(blockIndex);
    }

    /**
     * Programar pre-carga de bloques
     */
    private schedulePreload(blockIndex: number): void {
        if (this.blocks.has(blockIndex) || this.preloadQueue.includes(blockIndex)) {
            return;
        }

        this.preloadQueue.push(blockIndex);

        if (!this.isPreloading) {
            this.processPreloadQueue();
        }
    }

    /**
     * Procesar cola de pre-carga
     */
    private async processPreloadQueue(): Promise<void> {
        if (this.preloadQueue.length === 0) {
            this.isPreloading = false;
            return;
        }

        this.isPreloading = true;
        const blockIndex = this.preloadQueue.shift()!;

        try {
            await this.renderBlock(blockIndex);
        } catch (error) {
            console.error(`❌ Error pre-cargando bloque ${blockIndex}:`, error);
        }

        // Continuar con siguiente bloque
        setTimeout(() => this.processPreloadQueue(), 100);
    }

    /**
     * Limpiar bloques antiguos para liberar memoria
     */
    private cleanupOldBlocks(currentBlockIndex: number): void {
        const minBlock = currentBlockIndex - Math.ceil(this.KEEP_BEHIND / this.BLOCK_DURATION);
        const maxBlock = currentBlockIndex + Math.ceil(this.PRELOAD_AHEAD / this.BLOCK_DURATION);

        for (const [blockIndex] of this.blocks) {
            if (blockIndex < minBlock || blockIndex > maxBlock) {
                this.blocks.delete(blockIndex);
                console.log(`🗑️ Bloque ${blockIndex} liberado de memoria`);
            }
        }
    }

    /**
     * Override: Reproducir con streaming
     */
    play(): void {
        if (this.isPlaying) return;
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }

        const currentTime = this.pausedAtTime;
        this.currentBlockIndex = Math.floor(currentTime / this.BLOCK_DURATION);

        // Verificar que el bloque actual está cargado
        if (!this.blocks.has(this.currentBlockIndex)) {
            console.warn(`⚠️ Bloque ${this.currentBlockIndex} no está cargado, esperando...`);
            this.renderBlock(this.currentBlockIndex).then(() => this.play());
            return;
        }

        // Pre-cargar bloques adelante
        for (let i = 1; i <= Math.ceil(this.PRELOAD_AHEAD / this.BLOCK_DURATION); i++) {
            this.schedulePreload(this.currentBlockIndex + i);
        }

        this.songsVisited.add(this.currentSongIndex);

        if (this.currentSource) {
            this.currentSource.stop();
            this.currentSource.disconnect();
        }

        // Reproducir bloque actual
        const block = this.blocks.get(this.currentBlockIndex)!;
        this.currentSource = this.audioContext.createBufferSource();
        this.currentSource.buffer = block.buffer;
        this.currentSource.connect(this.masterGain);

        const offsetInBlock = currentTime - block.startTime;
        this.currentSource.start(0, offsetInBlock);
        this.playbackStartTime = this.audioContext.currentTime - currentTime;

        this.isPlaying = true;
        this.updatePlaybackState();

        // Programar cambio de bloque
        this.scheduleBlockTransition();

        console.log(`▶️ Reproduciendo bloque ${this.currentBlockIndex}`);
    }

    /**
     * Programar transición al siguiente bloque
     */
    private scheduleBlockTransition(): void {
        if (!this.isPlaying) return;

        const currentTime = this.getCurrentTime();
        const currentBlock = this.blocks.get(this.currentBlockIndex);

        if (!currentBlock) return;

        const timeUntilNextBlock = currentBlock.endTime - currentTime;

        if (timeUntilNextBlock <= 0) {
            // Cambiar al siguiente bloque
            this.transitionToNextBlock();
        } else if (timeUntilNextBlock < 10) {
            // Pre-cargar siguiente bloque si falta poco
            this.schedulePreload(this.currentBlockIndex + 1);
        }

        // Verificar cada segundo
        setTimeout(() => this.scheduleBlockTransition(), 1000);
    }

    /**
     * Transición al siguiente bloque
     */
    private transitionToNextBlock(): void {
        const nextBlockIndex = this.currentBlockIndex + 1;

        if (!this.blocks.has(nextBlockIndex)) {
            console.log('🏁 Fin de la mezcla');
            this.pause();
            return;
        }

        console.log(`🔄 Transición a bloque ${nextBlockIndex}`);

        // Detener bloque actual
        if (this.currentSource) {
            this.currentSource.stop();
            this.currentSource.disconnect();
        }

        // Reproducir siguiente bloque
        this.currentBlockIndex = nextBlockIndex;
        const block = this.blocks.get(nextBlockIndex)!;

        this.currentSource = this.audioContext.createBufferSource();
        this.currentSource.buffer = block.buffer;
        this.currentSource.connect(this.masterGain);
        this.currentSource.start(0, 0);

        this.playbackStartTime = this.audioContext.currentTime - block.startTime;

        // Pre-cargar siguiente
        this.schedulePreload(nextBlockIndex + 1);

        // Limpiar bloques antiguos
        this.cleanupOldBlocks(nextBlockIndex);
    }

    /**
     * Override: Obtener duración total
     */
    getTotalDuration(): number {
        if (this.timeMap.length === 0) return 0;
        const lastEntry = this.timeMap[this.timeMap.length - 1];
        return lastEntry.time + 60;
    }

    /**
     * Obtener estadísticas de bloques
     */
    getBlockStats(): { loaded: number; total: number; memoryMB: number } {
        const totalDuration = this.getTotalDuration();
        const totalBlocks = Math.ceil(totalDuration / this.BLOCK_DURATION);
        const loadedBlocks = this.blocks.size;

        // Calcular memoria aproximada
        let memoryBytes = 0;
        for (const block of this.blocks.values()) {
            memoryBytes += block.buffer.length * block.buffer.numberOfChannels * 4; // 4 bytes por sample (Float32)
        }
        const memoryMB = memoryBytes / 1024 / 1024;

        return {
            loaded: loadedBlocks,
            total: totalBlocks,
            memoryMB: Math.round(memoryMB * 100) / 100
        };
    }

    private formatTime(seconds: number): string {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
}

export default StreamingAudioPlayer;
