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
    type: 'LONG_MIX' | 'QUICK_MIX' | 'DOUBLE_DROP' | 'CUT';
    exitPointMs: number;
    entryPointMs: number;
    durationMs?: number; // Optional override
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

            // CRITICAL: Start from the entry point, not from 0
            deckA.current.addEventListener('loadedmetadata', () => {
                if (deckA.current) {
                    const entryPointSec = (firstItem.transition?.entryPointMs || 0) / 1000;
                    deckA.current.currentTime = entryPointSec;

                    // Auto-play
                    deckA.current.play().then(() => {
                        setIsPlaying(true);
                    }).catch(e => console.warn("Auto-play blocked:", e));
                }
            }, { once: true });
        }
    }, [mixSequence]);

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

                    inactiveAudio.currentTime = transition.entryPointMs / 1000;
                    inactiveAudio.volume = 0;
                    inactiveAudio.play().catch(e => console.error("Error playing next deck", e));
                }
            }
        }

        // 2. Handle Mixing State
        if (transitionStatus === 'MIXING' && nextItem && transition) {
            let crossfadeDuration = transition.durationMs || 8000;
            if (transition.type === 'QUICK_MIX') crossfadeDuration = 4000;
            if (transition.type === 'CUT') crossfadeDuration = 100;

            const startMixTime = transition.exitPointMs - crossfadeDuration;
            const progress = Math.min(1, Math.max(0, (now - startMixTime) / crossfadeDuration)); // Clamp 0-1

            if (progress >= 1) {
                // Transition Complete
                console.log('Transition Complete. Swapping Decks.');
                setTransitionStatus('IDLE');
                setActiveDeck(prev => prev === 'A' ? 'B' : 'A');
                setCurrentTrackIndex(prev => prev + 1);

                // Reset Volume
                if (activeAudio) {
                    activeAudio.pause();
                    activeAudio.volume = Math.min(1, Math.max(0, initialVolume));
                    activeAudio.currentTime = 0;
                }
                if (inactiveAudio) {
                    // Ensure the new track is fully audible
                    inactiveAudio.volume = Math.min(1, Math.max(0, initialVolume));
                    // Ensure it's playing if it wasn't already
                    if (inactiveAudio.paused) {
                        inactiveAudio.play().catch(e => console.warn("Swap play error:", e));
                    }
                }
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
                    // CRITICAL: Start from entry point, not 0
                    const entryPointSec = (nextItem.transition?.entryPointMs || 0) / 1000;
                    inactiveAudio.currentTime = entryPointSec;
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

    // Calculate effective duration (exit point) for UI
    const currentItem = mixSequence?.tracks[currentTrackIndex];
    // If there is a transition, the "mix duration" is the exit point. 
    // Otherwise it's the full track duration.
    // Ensure we don't return 0 to avoid division by zero in UI
    const mixDuration = (currentItem?.transition?.exitPointMs && currentItem.transition.exitPointMs > 0)
        ? currentItem.transition.exitPointMs / 1000
        : (currentItem?.track.duration || 1);

    return {
        isPlaying,
        currentTrackIndex,
        currentTime,
        duration: mixDuration, // Return the MIX duration for the UI progress bar
        totalDuration: currentItem?.track.duration || 0, // Also return total if needed
        togglePlay,
        seek,
        skipNext,
        skipPrev,
        transitionStatus
    };
}
