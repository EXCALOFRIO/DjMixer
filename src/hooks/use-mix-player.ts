import { useState, useEffect, useRef, useCallback } from 'react';

export interface MixTrack {
    id: string;
    title: string;
    artist: string;
    url: string;
    artwork: string;
    duration: number;
    bpm?: number;
}

export interface MixTransition {
    type: 'LONG_MIX' | 'QUICK_MIX' | 'DOUBLE_DROP' | 'CUT' | 'LOOP_MIX';
    exitPointMs: number;      // Punto donde ESTA canción empieza a salir
    entryPointMs: number;     // Punto donde LA SIGUIENTE canción entra
    startPointMs?: number;    // Punto donde ESTA canción EMPIEZA a sonar (si no es 0)
    durationMs?: number;      // Duración del crossfade
}

export interface MixSequenceItem {
    position: number;
    track: MixTrack;
    transition: MixTransition | null;
}

export interface MixSequence {
    tracks: MixSequenceItem[];
}

interface UseMixPlayerProps {
    mixSequence: MixSequence | null;
    initialVolume?: number;
}

export function useMixPlayer({ mixSequence, initialVolume = 1 }: UseMixPlayerProps) {
    // State
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
    const [currentTime, setCurrentTime] = useState(0); // Time of the MASTER output (relative to current track)
    const [activeDeck, setActiveDeck] = useState<'A' | 'B'>('A');
    const [transitionStatus, setTransitionStatus] = useState<'IDLE' | 'PREPARING' | 'MIXING'>('IDLE');

    // Refs for Audio Elements (Decks)
    const deckA = useRef<HTMLAudioElement | null>(null);
    const deckB = useRef<HTMLAudioElement | null>(null);
    const rafRef = useRef<number>();

    // Initialize Audio Elements once
    useEffect(() => {
        deckA.current = new Audio();
        deckB.current = new Audio();
        deckA.current.preload = 'auto';
        deckB.current.preload = 'auto';

        // Cleanup
        return () => {
            if (deckA.current) {
                deckA.current.pause();
                deckA.current.src = '';
            }
            if (deckB.current) {
                deckB.current.pause();
                deckB.current.src = '';
            }
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, []);

    // Handle Volume
    useEffect(() => {
        if (deckA.current) deckA.current.volume = initialVolume;
        if (deckB.current) deckB.current.volume = initialVolume;
    }, [initialVolume]);

    // Load Initial Track & Auto-play
    useEffect(() => {
        if (!mixSequence || mixSequence.tracks.length === 0) return;

        const firstItem = mixSequence.tracks[0];
        if (deckA.current && !deckA.current.src) {
            deckA.current.src = firstItem.track.url;
            deckA.current.load();

            // CRITICAL: Start from startPointMs (where THIS track starts)
            // NOT entryPointMs (which is where the NEXT track enters on THIS track)
            deckA.current.addEventListener('loadedmetadata', () => {
                if (deckA.current) {
                    // startPointMs = donde empieza a sonar esta canción (default 0)
                    const startPointSec = (firstItem.transition?.startPointMs || 0) / 1000;
                    deckA.current.currentTime = startPointSec;
                    deckA.current.volume = initialVolume; // Ensure full volume

                    // Auto-play
                    deckA.current.play().then(() => {
                        setIsPlaying(true);
                    }).catch(e => console.warn("Auto-play blocked:", e));
                }
            }, { once: true });
        }
    }, [mixSequence, initialVolume]);

    // Main Playback Loop
    const updateLoop = useCallback(() => {
        if (!mixSequence) return;

        const currentItem = mixSequence.tracks[currentTrackIndex];
        const nextItem = mixSequence.tracks[currentTrackIndex + 1];

        // Get the active audio element
        const activeAudio = activeDeck === 'A' ? deckA.current : deckB.current;
        const inactiveAudio = activeDeck === 'A' ? deckB.current : deckA.current;

        if (!activeAudio) return;

        const now = activeAudio.currentTime * 1000; // ms
        setCurrentTime(activeAudio.currentTime);

        // CRITICAL FIX: currentItem.transition contains the exit point for THIS track
        // (when to transition FROM current TO next)
        // NOT nextItem.transition (which is the transition FROM previous TO nextItem)
        const transition = currentItem?.transition;

        // 1. Check for Transition Trigger
        if (nextItem && transition && transitionStatus === 'IDLE') {
            const timeUntilExit = transition.exitPointMs - now;

            // Pre-load next track if we are getting close (e.g. 15s before)
            if (timeUntilExit < 15000 && timeUntilExit > 10000) {
                if (inactiveAudio && inactiveAudio.src !== nextItem.track.url) {
                    console.log(`Preloading next track: ${nextItem.track.title}`);
                    inactiveAudio.src = nextItem.track.url;
                    inactiveAudio.load();
                }
            }

            // Start Mixing
            // We start slightly before the exit point to allow for the crossfade
            // Default crossfade duration is 8s if not specified, or calculated based on type
            let crossfadeDuration = transition.durationMs || 8000;
            if (transition.type === 'QUICK_MIX') crossfadeDuration = 4000;
            if (transition.type === 'LOOP_MIX') crossfadeDuration = 16000; // Loops need longer
            if (transition.type === 'CUT') crossfadeDuration = 100;

            // Start transition when we are at (ExitPoint - CrossfadeDuration)
            const startMixTime = transition.exitPointMs - crossfadeDuration;

            if (now >= startMixTime && now < transition.exitPointMs) {
                console.log('Starting Transition...');
                setTransitionStatus('MIXING');

                // Prepare Deck B
                if (inactiveAudio) {
                    // Ensure src is set (in case we skipped preload)
                    if (inactiveAudio.src !== nextItem.track.url) {
                        console.log(`Late load for next track: ${nextItem.track.title}`);
                        inactiveAudio.src = nextItem.track.url;
                        inactiveAudio.load();
                    }

                    // Start the next track from its startPointMs
                    // (which was set from the entryPoint of this transition)
                    const nextStartSec = (nextItem.transition?.startPointMs || 0) / 1000;
                    inactiveAudio.currentTime = nextStartSec;
                    inactiveAudio.volume = 0;
                    inactiveAudio.play().catch(e => console.error("Error playing next deck", e));
                }
            }
        }

        // 2. Handle Mixing State
        if (transitionStatus === 'MIXING' && nextItem && transition) {
            let crossfadeDuration = transition.durationMs || 8000;
            if (transition.type === 'QUICK_MIX') crossfadeDuration = 4000;
            if (transition.type === 'LOOP_MIX') crossfadeDuration = 16000;
            if (transition.type === 'CUT') crossfadeDuration = 100;

            const startMixTime = transition.exitPointMs - crossfadeDuration;
            const progress = Math.min(1, Math.max(0, (now - startMixTime) / crossfadeDuration)); // Clamp 0-1

            if (progress >= 1) {
                // Transition Complete
                console.log('Transition Complete. Swapping Decks.');
                
                // IMPORTANT: First set volume to full on the NEW active deck
                if (inactiveAudio) {
                    inactiveAudio.volume = Math.min(1, Math.max(0, initialVolume));
                    console.log(`🔊 New active deck volume set to: ${inactiveAudio.volume}`);
                    // Ensure it's playing
                    if (inactiveAudio.paused) {
                        inactiveAudio.play().catch(e => console.warn("Swap play error:", e));
                    }
                }
                
                // Then pause and reset the OLD deck
                if (activeAudio) {
                    activeAudio.pause();
                    activeAudio.currentTime = 0;
                    activeAudio.volume = Math.min(1, Math.max(0, initialVolume)); // Reset for next use
                }
                
                // Update state AFTER audio operations
                setTransitionStatus('IDLE');
                setActiveDeck(prev => prev === 'A' ? 'B' : 'A');
                setCurrentTrackIndex(prev => prev + 1);
            } else {
                // Apply Crossfade (Equal Power or Linear)
                // Linear for now for simplicity
                const fadeOutVol = initialVolume * (1 - progress);
                const fadeInVol = initialVolume * progress;

                if (activeAudio) activeAudio.volume = Math.min(1, Math.max(0, fadeOutVol));
                if (inactiveAudio) inactiveAudio.volume = Math.min(1, Math.max(0, fadeInVol));
            }
        }

        // 3. Handle End of Track (No Transition defined)
        if (activeAudio.ended && transitionStatus === 'IDLE') {
            if (nextItem) {
                // Hard cut to next
                console.log('Track ended. Hard cut to next.');
                setActiveDeck(prev => prev === 'A' ? 'B' : 'A');
                setCurrentTrackIndex(prev => prev + 1);

                if (inactiveAudio) {
                    inactiveAudio.src = nextItem.track.url;
                    // CRITICAL: Start from startPointMs (where THIS new track starts)
                    const startPointSec = (nextItem.transition?.startPointMs || 0) / 1000;
                    inactiveAudio.currentTime = startPointSec;
                    inactiveAudio.volume = Math.min(1, Math.max(0, initialVolume));
                    inactiveAudio.play().catch(e => console.warn("Auto-play blocked:", e));
                }
            } else {
                setIsPlaying(false);
            }
        }

        rafRef.current = requestAnimationFrame(updateLoop);
    }, [mixSequence, currentTrackIndex, activeDeck, transitionStatus, initialVolume]);

    // Start/Stop Loop
    useEffect(() => {
        if (isPlaying) {
            rafRef.current = requestAnimationFrame(updateLoop);
        } else {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        }
        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [isPlaying, updateLoop]);

    // Controls
    const togglePlay = useCallback(() => {
        const activeAudio = activeDeck === 'A' ? deckA.current : deckB.current;
        if (!activeAudio) return;

        if (isPlaying) {
            activeAudio.pause();
            if (transitionStatus === 'MIXING') {
                // Pause both if mixing
                const inactiveAudio = activeDeck === 'A' ? deckB.current : deckA.current;
                inactiveAudio?.pause();
            }
            setIsPlaying(false);
        } else {
            const playPromise = activeAudio.play();
            if (playPromise !== undefined) {
                playPromise.catch(e => console.warn("Play interrupted:", e));
            }

            if (transitionStatus === 'MIXING') {
                const inactiveAudio = activeDeck === 'A' ? deckB.current : deckA.current;
                const playPromiseB = inactiveAudio?.play();
                if (playPromiseB !== undefined) {
                    playPromiseB.catch(e => console.warn("Play B interrupted:", e));
                }
            }
            setIsPlaying(true);
        }
    }, [isPlaying, activeDeck, transitionStatus]);

    const seek = useCallback((time: number) => {
        const activeAudio = activeDeck === 'A' ? deckA.current : deckB.current;
        if (activeAudio) {
            activeAudio.currentTime = time;
            setCurrentTime(time);
        }
    }, [activeDeck]);

    const skipNext = useCallback(() => {
        // Force skip to next track
        if (!mixSequence || currentTrackIndex >= mixSequence.tracks.length - 1) return;

        const nextIndex = currentTrackIndex + 1;
        const nextItem = mixSequence.tracks[nextIndex];

        // Reset current deck
        const activeAudio = activeDeck === 'A' ? deckA.current : deckB.current;
        if (activeAudio) {
            activeAudio.pause();
            activeAudio.currentTime = 0;
            activeAudio.volume = Math.min(1, Math.max(0, initialVolume));
        }

        // Prepare next deck
        const nextDeck = activeDeck === 'A' ? 'B' : 'A'; // Swap
        const nextAudio = activeDeck === 'A' ? deckB.current : deckA.current;

        if (nextAudio) {
            nextAudio.src = nextItem.track.url;
            nextAudio.currentTime = 0; // Start from beginning if skipping manually? Or entry point?
            // Usually manual skip goes to start
            nextAudio.volume = Math.min(1, Math.max(0, initialVolume));
            if (isPlaying) {
                const p = nextAudio.play();
                if (p !== undefined) p.catch(e => console.warn("Skip play error:", e));
            }
        }

        setActiveDeck(nextDeck);
        setCurrentTrackIndex(nextIndex);
        setTransitionStatus('IDLE');

    }, [mixSequence, currentTrackIndex, activeDeck, initialVolume, isPlaying]);

    const skipPrev = useCallback(() => {
        if (currentTrackIndex <= 0) {
            // Seek to start
            seek(0);
            return;
        }

        const prevIndex = currentTrackIndex - 1;
        const prevItem = mixSequence?.tracks[prevIndex];
        if (!prevItem) return;

        // Reset current deck
        const activeAudio = activeDeck === 'A' ? deckA.current : deckB.current;
        if (activeAudio) {
            activeAudio.pause();
            activeAudio.currentTime = 0;
            activeAudio.volume = Math.min(1, Math.max(0, initialVolume));
        }

        // Prepare prev deck
        const nextDeck = activeDeck === 'A' ? 'B' : 'A'; // Swap
        const nextAudio = activeDeck === 'A' ? deckB.current : deckA.current;

        if (nextAudio) {
            nextAudio.src = prevItem.track.url;
            nextAudio.currentTime = 0;
            nextAudio.volume = Math.min(1, Math.max(0, initialVolume));
            if (isPlaying) {
                const p = nextAudio.play();
                if (p !== undefined) p.catch(e => console.warn("Skip prev play error:", e));
            }
        }

        setActiveDeck(nextDeck);
        setCurrentTrackIndex(prevIndex);
        setTransitionStatus('IDLE');
    }, [mixSequence, currentTrackIndex, activeDeck, initialVolume, isPlaying, seek]);

    // Calculate effective duration for UI
    const currentItem = mixSequence?.tracks[currentTrackIndex];
    
    // startPointMs: donde empieza esta canción (puede ser > 0 si saltamos intro)
    // exitPointMs: donde termina esta canción (antes de la transición)
    const startPointMs = currentItem?.transition?.startPointMs || 0;
    const trackDurationMs = (currentItem?.track.duration || 0) * 1000;
    const exitPointMs = currentItem?.transition?.exitPointMs || trackDurationMs || 0;
    
    // Duración efectiva = desde startPoint hasta exitPoint
    const effectiveDurationMs = Math.max(1, exitPointMs - startPointMs);

    return {
        isPlaying,
        currentTrackIndex,
        currentTime,
        // Datos para la barra de progreso
        startPointMs,           // Donde empieza (para calcular 0%)
        exitPointMs,            // Donde termina (para calcular 100%)
        effectiveDurationMs,    // Duración de la ventana de reproducción
        duration: exitPointMs / 1000, // Backwards compat
        totalDuration: currentItem?.track.duration || 0,
        togglePlay,
        seek,
        skipNext,
        skipPrev,
        transitionStatus
    };
}
