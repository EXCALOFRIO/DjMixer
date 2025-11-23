
"use client";

import { PlaceHolderImages } from "@/lib/placeholder-images";
import Image from "next/image";
import { useEffect, useState, useCallback, useRef } from "react";
import { Button } from "../ui/button";
import { Play, Pause, SkipBack, SkipForward, ChevronsRight, ChevronsLeft, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Track } from "@/app/page";
import type { MixPlanEntry } from "@/lib/mix-planner";
import { TrackAnalysis } from "./track-analysis";


const albumArtPlaceholder = PlaceHolderImages.find(
  (img) => img.id === "album-art-placeholder"
);

const polarToCartesian = (centerX: number, centerY: number, radius: number, angleInDegrees: number) => {
  const angleInRadians = (angleInDegrees) * Math.PI / 180.0;
  return {
    x: centerX + (radius * Math.cos(angleInRadians)),
    y: centerY + (radius * Math.sin(angleInRadians))
  };
};

const describeArc = (x: number, y: number, radius: number, startAngle: number, endAngle: number) => {
  if (endAngle - startAngle >= 360) {
    endAngle = startAngle + 359.99;
  }
  const start = polarToCartesian(x, y, radius, endAngle);
  const end = polarToCartesian(x, y, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
  const d = [
    "M", start.x, start.y,
    "A", radius, radius, 0, largeArcFlag, 0, end.x, end.y
  ].join(" ");
  return d;
};

const PlaylistRing = ({
  tracks,
  currentTrackIndex,
  radius,
  stroke,
  className
}: {
  tracks: Track[];
  currentTrackIndex: number;
  radius: number;
  stroke: number;
  className?: string;
}) => {
  const trackCount = tracks.length;
  if (trackCount === 0 || !radius) return null;

  const gap = trackCount > 1 ? 4 : 0;
  const totalGap = gap * trackCount;
  const anglePerTrack = (360 - totalGap) / trackCount;

  return (
    <svg width={radius * 2} height={radius * 2} className={cn("transform -rotate-90", className)}>
      {tracks.map((_, index) => {
        const startAngle = index * (anglePerTrack + gap);
        const endAngle = startAngle + anglePerTrack;
        const isCurrent = index === currentTrackIndex;
        const isPassed = index < currentTrackIndex;

        return (
          <g key={index}>
            <path
              d={describeArc(radius, radius, radius - stroke / 2, startAngle, endAngle)}
              fill="none"
              stroke="hsl(var(--border))"
              strokeWidth={stroke}
              className={cn("opacity-20", {
                "opacity-40": isCurrent
              })}
            />
             {(isPassed) && (
                <path
                  d={describeArc(radius, radius, radius - stroke / 2, startAngle, endAngle)}
                  fill="none"
                  stroke="hsl(var(--primary))"
                  strokeWidth={stroke}
                  className="opacity-70"
                />
            )}
          </g>
        );
      })}
    </svg>
  );
};


const ProgressRing = ({
  radius,
  stroke,
  progress,
  className,
  onSeek
}: {
  radius: number;
  stroke: number;
  progress: number;
  className?: string;
  onSeek: (progress: number) => void;
}) => {
  const ringRef = useRef<SVGSVGElement>(null);
  const isSeeking = useRef(false);

  const handleSeek = (e: React.MouseEvent<SVGSVGElement> | React.TouchEvent<SVGSVGElement> | MouseEvent | TouchEvent) => {
    if (!ringRef.current || !radius) return;
    const rect = ringRef.current.getBoundingClientRect();
    const touch = 'touches' in e ? e.touches[0] : e;
    const x = touch.clientX - rect.left - radius;
    const y = touch.clientY - rect.top - radius;
    let angle = Math.atan2(y, x) * (180 / Math.PI) + 90;
    if (angle < 0) angle += 360;
    const newProgress = Math.max(0, Math.min(100, (angle / 360) * 100));
    onSeek(newProgress);
  };

  useEffect(() => {
    const currentRing = ringRef.current;
    if (!currentRing) return;
    
    const mouseMoveHandler = (e: MouseEvent) => {
      if (isSeeking.current) {
        handleSeek(e);
      }
    };

    const touchMoveHandler = (e: TouchEvent) => {
        if (isSeeking.current) {
            handleSeek(e);
        }
    };
    
    const mouseUpHandler = () => {
        isSeeking.current = false;
        window.removeEventListener("mousemove", mouseMoveHandler);
        window.removeEventListener("mouseup", mouseUpHandler);
    };

    const touchEndHandler = () => {
        isSeeking.current = false;
        window.removeEventListener("touchmove", touchMoveHandler);
        window.removeEventListener("touchend", touchEndHandler);
    };
    
    const mouseDownHandler = (e: MouseEvent) => {
      const target = e.target as SVGElement;
      if(target.closest('.progress-ring-hitbox')) {
        e.preventDefault();
        isSeeking.current = true;
        handleSeek(e);
        window.addEventListener("mousemove", mouseMoveHandler);
        window.addEventListener("mouseup", mouseUpHandler);
      }
    };

    const touchStartHandler = (e: TouchEvent) => {
        const target = e.target as SVGElement;
        if(target.closest('.progress-ring-hitbox')) {
            e.preventDefault();
            isSeeking.current = true;
            handleSeek(e);
            window.addEventListener("touchmove", touchMoveHandler);
            window.addEventListener("touchend", touchEndHandler);
        }
    };

    currentRing.addEventListener("mousedown", mouseDownHandler);
    currentRing.addEventListener("touchstart", touchStartHandler, { passive: false });
  
    return () => {
      if (currentRing) {
        currentRing.removeEventListener("mousedown", mouseDownHandler);
        currentRing.removeEventListener("touchstart", touchStartHandler);
      }
      window.removeEventListener("mousemove", mouseMoveHandler);
      window.removeEventListener("mouseup", mouseUpHandler);
      window.removeEventListener("touchmove", touchMoveHandler);
      window.removeEventListener("touchend", touchEndHandler);
    };
  }, [onSeek, radius]);

  if (!radius) return null;

  const normalizedRadius = radius - stroke / 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <svg
      ref={ringRef}
      height={radius * 2}
      width={radius * 2}
      className={cn("transform -rotate-90", className)}
    >
        {/* Invisible wider hitbox */}
        <circle
            className="progress-ring-hitbox cursor-pointer"
            stroke="transparent"
            fill="transparent"
            strokeWidth={stroke + 20} 
            r={normalizedRadius}
            cx={radius}
            cy={radius}
        />
      
      {/* Background ring */}
      <circle
        className="pointer-events-none"
        stroke="hsl(var(--border))"
        fill="transparent"
        strokeWidth={stroke}
        r={normalizedRadius}
        cx={radius}
        cy={radius}
        opacity="0.1"
      />
      {/* Progress ring */}
      <circle
        className="pointer-events-none"
        stroke="hsl(var(--primary))"
        fill="transparent"
        strokeWidth={stroke}
        strokeDasharray={circumference + " " + circumference}
        style={{ strokeDashoffset }}
        strokeLinecap="round"
        r={normalizedRadius}
        cx={radius}
        cy={radius}
      />
    </svg>
  );
};

type PlaybackInterfaceProps = {
  tracks: Track[];
  volume: number;
  mixPlan?: MixPlanEntry[];
  mixSequence?: any;
};

const SeekIndicator = ({ time, direction }: { time: number; direction: 'forward' | 'backward' }) => {
  const isVisible = time > 0;
  const Icon = direction === 'forward' ? ChevronsRight : ChevronsLeft;

  return (
    <div
      className={cn(
        "absolute inset-y-0 w-1/3 flex flex-col items-center justify-center text-primary transition-opacity duration-200 pointer-events-none z-30",
        direction === 'forward' ? "right-0" : "left-0",
        isVisible ? "opacity-100" : "opacity-0"
      )}
    >
      <Icon className="w-10 h-10 mb-1" />
      <p className="text-lg font-bold">+{time}s</p>
    </div>
  );
};

export function PlaybackInterface({ tracks, volume, mixPlan, mixSequence }: PlaybackInterfaceProps) {
    const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [timeInTrack, setTimeInTrack] = useState(0);
    const [showAnalysis, setShowAnalysis] = useState(false);

    const audioRef = useRef<HTMLAudioElement | null>(null);
    const preloadAudioRef = useRef<HTMLAudioElement | null>(null);
    const animationFrameRef = useRef<number>();
    
    const [seekForwardTime, setSeekForwardTime] = useState(0);
    const [seekBackwardTime, setSeekBackwardTime] = useState(0);

    const seekForwardTimer = useRef<NodeJS.Timeout | null>(null);
    const seekBackwardTimer = useRef<NodeJS.Timeout | null>(null);

    const [currentAlbumArt, setCurrentAlbumArt] = useState<string | null>(null);
    const [previousAlbumArt, setPreviousAlbumArt] = useState<string | null>(null);

    const mainContainerRef = useRef<HTMLDivElement>(null);
    const [ringSizes, setRingSizes] = useState({ outer: 0, inner: 0 });

    const tapTimer = useRef<NodeJS.Timeout | null>(null);
    const lastTapArea = useRef<string | null>(null);
    const isSeekingRef = useRef<'forward' | 'backward' | null>(null);

    // Log de información de la secuencia optimizada
    useEffect(() => {
        if (mixSequence) {
            console.log('🎵 Secuencia A* cargada en PlaybackInterface:');
            console.log(`   📈 Score total: ${mixSequence.totalScore.toFixed(2)}/100`);
            console.log(`   📊 Score promedio transiciones: ${mixSequence.avgTransitionScore.toFixed(2)}/100`);
            console.log(`   🎧 Tracks en secuencia:`);
            mixSequence.tracks.forEach((t: any, i: number) => {
                console.log(`      ${i + 1}. ${t.track.title} - ${t.track.artist}`);
                if (t.transition) {
                    console.log(`         → Transición: ${t.transition.type} (${t.transition.crossfadeDurationMs}ms, score: ${t.transition.score.toFixed(1)})`);
                }
            });
        }
    }, [mixSequence]);

    useEffect(() => {
        if (mixPlan) {
            console.log('📋 Mix Plan cargado:');
            mixPlan.forEach((entry, i) => {
                console.log(`   ${i + 1}. ${entry.title} - ${entry.artist}`);
                console.log(`      → ${entry.bestEntryPoints.length} puntos de entrada`);
                console.log(`      → ${entry.bestExitPoints.length} puntos de salida`);
            });
        }
    }, [mixPlan]);

    const currentTrack = tracks[currentTrackIndex];
    const songProgress = (timeInTrack / (currentTrack?.duration || 1)) * 100;
    const nextTrackIndex = (currentTrackIndex + 1) % tracks.length;
    const nextTrack = tracks.length > 1 ? tracks[nextTrackIndex] : null;
    const prevTrackIndex = (currentTrackIndex - 1 + tracks.length) % tracks.length;

    useEffect(() => {
        const calculateSizes = () => {
            if (mainContainerRef.current) {
                const width = mainContainerRef.current.offsetWidth;
                const baseRadius = Math.min(width, window.innerHeight * 0.45, 400) / 2;
                setRingSizes({
                    outer: baseRadius, 
                    inner: baseRadius * 0.87
                });
            }
        };

        calculateSizes();
        window.addEventListener('resize', calculateSizes);
        return () => window.removeEventListener('resize', calculateSizes);
    }, []);

    const playNext = useCallback(() => {
        setCurrentTrackIndex(prevIndex => (prevIndex + 1) % tracks.length);
    }, [tracks.length]);

    const playPrev = useCallback(() => {
        setCurrentTrackIndex(prevIndex => (prevIndex - 1 + tracks.length) % tracks.length);
    }, [tracks.length]);
    
    const changeTrack = useCallback((direction: 'next' | 'prev') => {
        if (direction === 'next') {
            playNext();
        } else {
            if(timeInTrack > 3) {
                if(audioRef.current) audioRef.current.currentTime = 0;
            } else {
                playPrev();
            }
        }
    }, [timeInTrack, playNext, playPrev]);
    
    
    const handleSeek = (progress: number) => {
        if (!currentTrack || !audioRef.current) return;
        const newTime = (progress / 100) * currentTrack.duration;
        audioRef.current.currentTime = newTime;
        setTimeInTrack(newTime);
    };
    
    const seekTime = (amount: number) => {
      if (!audioRef.current || !currentTrack) return;
      
      const currentTime = audioRef.current.currentTime;
      const newTime = currentTime + amount;
      const isForward = amount > 0;
      
      if (newTime < 0) {
        if (currentTrackIndex > 0 || tracks.length > 1) {
          const prevTrack = tracks[prevTrackIndex];
          const targetTime = prevTrack.duration + newTime;
          setCurrentTrackIndex(prevTrackIndex);
          setTimeout(() => {
            if (audioRef.current) {
              audioRef.current.currentTime = Math.max(0, targetTime);
            }
          }, 50);
        } else {
          audioRef.current.currentTime = 0;
        }
      } else if (newTime > currentTrack.duration) {
        if (currentTrackIndex < tracks.length - 1 || tracks.length > 1) {
          const overflow = newTime - currentTrack.duration;
          setCurrentTrackIndex(nextTrackIndex);
          setTimeout(() => {
            if (audioRef.current) {
              audioRef.current.currentTime = Math.min(overflow, tracks[nextTrackIndex].duration);
            }
          }, 50);
        } else {
          audioRef.current.currentTime = currentTrack.duration;
        }
      } else {
        audioRef.current.currentTime = newTime;
      }
      
      if (isForward) {
        setSeekForwardTime(prev => prev + Math.abs(amount));
        if (seekForwardTimer.current) clearTimeout(seekForwardTimer.current);
        seekForwardTimer.current = setTimeout(() => {
          setSeekForwardTime(0);
          isSeekingRef.current = null;
        }, 800);
      } else {
        setSeekBackwardTime(prev => prev + Math.abs(amount));
        if (seekBackwardTimer.current) clearTimeout(seekBackwardTimer.current);
        seekBackwardTimer.current = setTimeout(() => {
          setSeekBackwardTime(0);
          isSeekingRef.current = null;
        }, 800);
      }
    };
    
    const togglePlay = () => {
        if (!audioRef.current) return;
        if (isPlaying) {
          audioRef.current.pause();
        } else {
          audioRef.current.play().catch(e => console.error("Error playing audio:", e));
        }
    };

    const handleTap = (area: 'left' | 'center' | 'right') => {
      const seekAmount = 5;

      if (area === 'left') {
        if (isSeekingRef.current === 'backward') {
            seekTime(-seekAmount);
            return;
        }
      }
      if (area === 'right') {
        if (isSeekingRef.current === 'forward') {
            seekTime(seekAmount);
            return;
        }
      }

      if (tapTimer.current && lastTapArea.current === area) {
          // Double tap detected
          clearTimeout(tapTimer.current);
          tapTimer.current = null;
          if (area === 'left') {
            isSeekingRef.current = 'backward';
            seekTime(-seekAmount);
          } else if (area === 'right') {
            isSeekingRef.current = 'forward';
            seekTime(seekAmount);
          }
      } else {
          // First tap
          if (tapTimer.current) {
              clearTimeout(tapTimer.current);
          }
          lastTapArea.current = area;
          tapTimer.current = setTimeout(() => {
              // If it's a single tap, and not a seek tap
              if (!isSeekingRef.current) {
                if (area === 'center') {
                    togglePlay();
                }
              }
              tapTimer.current = null;
              // Don't reset isSeekingRef here, it's handled by seekTime's timer
          }, 300); // 300ms window for double tap
      }
    };
      
    // Precarga inteligente de la siguiente canción
    useEffect(() => {
        if (!nextTrack || !preloadAudioRef.current) {
            if (!preloadAudioRef.current) {
                preloadAudioRef.current = new Audio();
            }
            return;
        }
        
        const preloadAudio = preloadAudioRef.current;
        
        if (preloadAudio.src !== nextTrack.url) {
            preloadAudio.src = nextTrack.url;
            preloadAudio.preload = 'auto';
            preloadAudio.load();
        }
    }, [nextTrack]);

    // Effect for audio element and its events
    useEffect(() => {
        if (!audioRef.current) {
            audioRef.current = new Audio();
            audioRef.current.preload = 'auto';
        }
        const audio = audioRef.current;
        if (!currentTrack) return;
    
        const updateTime = () => {
            setTimeInTrack(audio.currentTime);
            animationFrameRef.current = requestAnimationFrame(updateTime);
        };
    
        const handlePlay = () => setIsPlaying(true);
        const handlePause = () => setIsPlaying(false);
        const handleEnded = () => playNext();
        
        const handleTimeUpdate = () => {
            if (nextTrack && audio.duration - audio.currentTime < 120) {
                if (preloadAudioRef.current && preloadAudioRef.current.src !== nextTrack.url) {
                    preloadAudioRef.current.src = nextTrack.url;
                    preloadAudioRef.current.preload = 'auto';
                    preloadAudioRef.current.load();
                }
            }
        };
    
        const wasPlaying = isPlaying;
    
        audio.addEventListener('play', handlePlay);
        audio.addEventListener('pause', handlePause);
        audio.addEventListener('ended', handleEnded);
        audio.addEventListener('timeupdate', handleTimeUpdate);
    
        const startPlayback = () => {
            if (wasPlaying) {
                audio.play().catch(e => {
                    console.error("Error al reproducir audio:", e);
                    setIsPlaying(false);
                });
            }
            requestAnimationFrame(updateTime);
        };
    
        if (audio.src !== currentTrack.url) {
            audio.src = currentTrack.url;
            audio.load();
            audio.addEventListener('loadeddata', startPlayback, { once: true });
        } else {
            startPlayback();
        }
    
        return () => {
            audio.removeEventListener('play', handlePlay);
            audio.removeEventListener('pause', handlePause);
            audio.removeEventListener('ended', handleEnded);
            audio.removeEventListener('timeupdate', handleTimeUpdate);
            audio.removeEventListener('loadeddata', startPlayback);
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, [currentTrack, playNext, nextTrack, isPlaying]);


    // Effect for volume changes
    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.volume = volume;
        }
    }, [volume]);


    // Album art transition logic
    useEffect(() => {
      // Initialize album art on first track
      if (currentTrack && currentAlbumArt === null) {
        setCurrentAlbumArt(currentTrack.artwork);
        return;
      }
  
      const newArt = currentTrack?.artwork;
      if (newArt !== currentAlbumArt) {
        setPreviousAlbumArt(currentAlbumArt);
        setCurrentAlbumArt(newArt);
      }
    }, [currentTrack, currentAlbumArt]);
  
    const albumArtUrl = currentAlbumArt || albumArtPlaceholder?.imageUrl || "https://picsum.photos/500";
    const prevAlbumArtUrl = previousAlbumArt || albumArtPlaceholder?.imageUrl || "https://picsum.photos/500";
    const nextAlbumArtUrl = nextTrack?.artwork || albumArtPlaceholder?.imageUrl || "https://picsum.photos/100";
    const albumArtHint = albumArtPlaceholder?.imageHint ?? "album cover";

    if (!currentTrack) {
      return null;
    }

    const handleInteraction = (area: 'left' | 'center' | 'right') => (e: React.MouseEvent | React.TouchEvent) => {
        // Prevent default on touch to avoid zoom on double tap
        if (e.type === 'touchstart') e.preventDefault();
        handleTap(area);
    };
  
    return (
      <>
        {showAnalysis && currentTrack.analisis && (
          <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm overflow-y-auto">
            <div className="container max-w-4xl mx-auto py-8">
              <Button
                variant="ghost"
                size="icon"
                className="mb-4"
                onClick={() => setShowAnalysis(false)}
              >
                ← Volver
              </Button>
              <TrackAnalysis analisis={currentTrack.analisis} />
            </div>
          </div>
        )}
        
        <div className="relative w-full h-full flex flex-col items-center justify-between flex-grow gap-4 md:gap-6 p-4 pt-10 md:pt-16">
        
        <div className="absolute inset-0 z-20 flex" style={{ touchAction: 'none' }}>
            <div 
                className="w-[40%] h-full" 
                onMouseDown={handleInteraction('left')}
                onTouchStart={handleInteraction('left')}
            />
            <div 
                className="w-[20%] h-full"
                onMouseDown={handleInteraction('center')}
                onTouchStart={handleInteraction('center')}
            />
            <div 
                className="w-[40%] h-full"
                onMouseDown={handleInteraction('right')}
                onTouchStart={handleInteraction('right')}
            />
        </div>
  
        <SeekIndicator time={seekBackwardTime} direction="backward" />
        <SeekIndicator time={seekForwardTime} direction="forward" />
  
  
        <div 
          ref={mainContainerRef}
          className="relative w-full max-w-xs aspect-square flex items-center justify-center"
        >
            <div className="absolute inset-0 flex items-center justify-center">
                <PlaylistRing tracks={tracks} currentTrackIndex={currentTrackIndex} radius={ringSizes.outer} stroke={12} className="opacity-50" />
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
                 <ProgressRing radius={ringSizes.inner} stroke={4} progress={songProgress} onSeek={handleSeek} />
            </div>
          
            <div className={cn("relative rounded-full overflow-hidden shadow-2xl bg-black w-[70%] aspect-square",
                          "before:absolute before:inset-0 before:z-10 before:rounded-full before:bg-transparent before:shadow-[inset_0_0_20px_hsl(var(--primary)/0.5)]",
                          "after:absolute after:inset-0 after:z-10 after:rounded-full after:border-2 after:border-white/10"
                          )}
            >
            {prevAlbumArtUrl && (
              <Image
                src={prevAlbumArtUrl}
                alt="Previous Album Art"
                fill
                sizes="(max-width: 768px) 70vw, 300px"
                quality={90}
                className={cn(
                  "object-cover transition-opacity duration-1000",
                  "opacity-0"
                )}
                data-ai-hint={albumArtHint}
                key={`prev-${currentTrackIndex}`}
              />
            )}
            <Image
              src={albumArtUrl}
              alt={currentTrack.album || "Album Art"}
              fill
              sizes="(max-width: 768px) 70vw, 300px"
              quality={90}
              className={cn(
                "object-cover transition-all duration-500",
                isPlaying ? "scale-105" : "scale-100",
                "opacity-100"
              )}
              data-ai-hint={albumArtHint}
              priority
              key={currentTrackIndex}
            />
          </div>
        </div>
  
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2">
            <h2 className="text-xl md:text-2xl font-bold font-headline">{currentTrack.title}</h2>
            {currentTrack.analisis && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setShowAnalysis(true)}
              >
                <Info className="w-4 h-4" />
              </Button>
            )}
          </div>
          <p className="text-sm md:text-base text-muted-foreground">{currentTrack.artist}</p>
          {currentTrack.analisis && (
            <div className="flex items-center justify-center gap-3 text-xs text-muted-foreground">
              <span>{currentTrack.analisis.bpm?.toFixed(0)} BPM</span>
              <span>•</span>
              <span>{currentTrack.analisis.tonalidad_camelot}</span>
              <span>•</span>
              <span className="capitalize">{currentTrack.analisis.animo_general}</span>
            </div>
          )}
          {mixSequence && (
            <div className="flex items-center justify-center gap-2 mt-2">
              <div className="px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
                🎯 Secuencia A* • Score: {mixSequence.totalScore.toFixed(0)}/100
              </div>
            </div>
          )}
        </div>
  
        <div className="flex flex-col items-center gap-2 text-center opacity-80">
            <p className="text-xs tracking-widest text-muted-foreground">SIGUIENTE</p>
            <div className="flex items-center gap-4">
                <div className="relative w-12 h-12">
                    <Image
                        src={nextAlbumArtUrl}
                        alt={nextTrack?.album || "Next Album Art"}
                        width={100}
                        height={100}
                        quality={100}
                        className="object-cover w-full h-full rounded-full"
                        data-ai-hint={albumArtHint}
                        key={`next-${currentTrackIndex}`}
                    />
                </div>
                <div>
                    <h3 className="font-semibold text-left">{nextTrack?.title}</h3>
                    <p className="text-sm text-left text-muted-foreground">{nextTrack?.artist}</p>
                </div>
            </div>
        </div>
  
  
        <div className="flex items-center gap-2 p-2 rounded-full bg-black/20 backdrop-blur-md border border-white/10 z-30">
          <Button variant="ghost" size="icon" className="rounded-full w-14 h-14 text-muted-foreground hover:text-foreground" onClick={() => changeTrack('prev')}>
            <SkipBack />
          </Button>
          <Button 
            variant="default" 
            size="icon" 
            className="w-20 h-20 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 scale-100 hover:scale-105 transition-transform"
            onClick={togglePlay}
          >
            {isPlaying ? <Pause className="w-8 h-8" /> : <Play className="w-8 h-8 ml-1" />}
          </Button>
          <Button variant="ghost" size="icon" className="rounded-full w-14 h-14 text-muted-foreground hover:text-foreground" onClick={() => changeTrack('next')}>
            <SkipForward />
          </Button>
        </div>
        </div>
      </>
    );
}

    
