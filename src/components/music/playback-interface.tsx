import { PlaceHolderImages } from "@/lib/placeholder-images";
import Image from "next/image";
import { useEffect, useState, useRef } from "react";
import { Button } from "../ui/button";
import { Play, Pause, SkipBack, SkipForward, ChevronsRight, ChevronsLeft, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Track } from "@/app/page";
import type { MixPlanEntry } from "@/lib/mix-planner";
import { TrackAnalysis } from "./track-analysis";
import { useMixPlayer, MixSequence } from "@/hooks/use-mix-player";

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
      if (target.closest('.progress-ring-hitbox')) {
        e.preventDefault();
        isSeeking.current = true;
        handleSeek(e);
        window.addEventListener("mousemove", mouseMoveHandler);
        window.addEventListener("mouseup", mouseUpHandler);
      }
    };

    const touchStartHandler = (e: TouchEvent) => {
      const target = e.target as SVGElement;
      if (target.closest('.progress-ring-hitbox')) {
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
        style={{ strokeDashoffset, transition: "stroke-dashoffset 0.5s linear" }}
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
  const [showAnalysis, setShowAnalysis] = useState(false);
  const mainContainerRef = useRef<HTMLDivElement>(null);
  const [ringSizes, setRingSizes] = useState({ outer: 0, inner: 0 });

  // Enrich mixSequence with local track URLs (Blob URLs)
  // The API returns track metadata but NOT the blob URL which is local state
  const enrichedMixSequence: MixSequence | null = mixSequence ? {
    ...mixSequence,
    tracks: mixSequence.tracks.map((item: any) => {
      // Find the local track that matches this sequence item
      // Match by ID (if available) or Hash or Title/Artist as fallback
      const localTrack = tracks.find(t =>
        (t.analisis?.hash_archivo && t.analisis.hash_archivo === item.track.hash) ||
        (t.hash && t.hash === item.track.hash) ||
        (t.title === item.track.title)
      );

      return {
        ...item,
        track: {
          ...item.track,
          ...localTrack, // Merge full local track data (includes analisis, album, etc.)
          url: localTrack?.url || item.track.url || "",
          artwork: localTrack?.artwork || item.track.artwork,
          duration: localTrack?.duration || item.track.duration || 0
        }
      };
    })
  } : null;

  const {
    isPlaying,
    currentTrackIndex,
    currentTime,
    duration,
    togglePlay,
    seek,
    skipNext,
    skipPrev,
    transitionStatus
  } = useMixPlayer({
    mixSequence: enrichedMixSequence,
    initialVolume: volume
  });

  // Use the sequence for display, NOT the raw tracks array
  const sequenceTracks = enrichedMixSequence?.tracks || [];
  const currentSequenceItem = sequenceTracks[currentTrackIndex];
  // Cast to Track because we merged localTrack properties above
  const currentTrack = currentSequenceItem?.track as unknown as Track;

  const nextTrackIndex = (currentTrackIndex + 1) % sequenceTracks.length;
  const nextSequenceItem = sequenceTracks.length > 1 ? sequenceTracks[nextTrackIndex] : null;
  const nextTrack = nextSequenceItem?.track as unknown as Track;

  const prevTrackIndex = (currentTrackIndex - 1 + sequenceTracks.length) % sequenceTracks.length;
  const prevSequenceItem = sequenceTracks.length > 1 ? sequenceTracks[prevTrackIndex] : null;

  // Calculate effective start and end points for the progress bar
  // IMPORTANT: currentSequenceItem.transition contains BOTH:
  // - entryPointMs: Where THIS track starts playing (not from 0)
  // - exitPointMs: Where THIS track exits and transitions to next

  const trackRealDurationMs = (currentTrack as any)?.durationMs || (currentTrack?.duration * 1000) || 0;

  // Sanitization Logic
  const rawExitPointMs = currentSequenceItem?.transition?.exitPointMs || trackRealDurationMs;
  const safeExitPointMs = Math.min(rawExitPointMs, trackRealDurationMs);
  const safeEntryPointMs = currentSequenceItem?.transition?.entryPointMs || 0;

  // Effective Duration (the "playable window" of this track)
  const effectiveDurationMs = safeExitPointMs - safeEntryPointMs;

  const currentTimeMs = currentTime * 1000;

  // Progress: 0% when at entry point, 100% when at exit point
  const normalizedProgress = effectiveDurationMs > 0
    ? Math.min(100, Math.max(0, ((currentTimeMs - safeEntryPointMs) / effectiveDurationMs) * 100))
    : 0;

  // Countdown: Time from effective current position to exit
  const timeRemainingMs = Math.max(0, safeExitPointMs - currentTimeMs);
  const timeRemainingSec = Math.max(0, Math.ceil(timeRemainingMs / 1000));

  // Album Art Logic
  const [currentAlbumArt, setCurrentAlbumArt] = useState<string | null>(null);
  const [previousAlbumArt, setPreviousAlbumArt] = useState<string | null>(null);

  useEffect(() => {
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

  const handleSeek = (progress: number) => {
    // Seek within the effective window
    const seekTimeMs = safeEntryPointMs + ((progress / 100) * effectiveDurationMs);
    seek(seekTimeMs / 1000);
  };

  // Map sequence items to Track objects for the PlaylistRing
  const displayTracks = sequenceTracks.map(item => item.track as unknown as Track);

  if (!currentTrack) {
    return null;
  }

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

        {/* Visualizer / Album Art */}
        <div
          ref={mainContainerRef}
          className="relative w-full max-w-xs aspect-square flex items-center justify-center"
        >
          <div className="absolute inset-0 flex items-center justify-center">
            <PlaylistRing tracks={displayTracks} currentTrackIndex={currentTrackIndex} radius={ringSizes.outer} stroke={12} className="opacity-50" />
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <ProgressRing radius={ringSizes.inner} stroke={4} progress={normalizedProgress} onSeek={handleSeek} />
          </div>

          <div className={cn("relative rounded-full overflow-hidden shadow-2xl bg-black w-[70%] aspect-square transition-all duration-500",
            "before:absolute before:inset-0 before:z-10 before:rounded-full before:bg-transparent before:shadow-[inset_0_0_20px_hsl(var(--primary)/0.5)]",
            "after:absolute after:inset-0 after:z-10 after:rounded-full after:border-2 after:border-white/10",
            transitionStatus === 'MIXING' && "shadow-[0_0_50px_hsl(var(--primary))] scale-105 border-primary animate-pulse"
          )}
          >
            {prevAlbumArtUrl && (
              <Image
                src={prevAlbumArtUrl}
                alt="Previous Album Art"
                fill
                sizes="(max-width: 768px) 70vw, 300px"
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
        </div>

        <div className="flex flex-col items-center gap-2 text-center opacity-80">
          <p className="text-xs tracking-widest text-muted-foreground">SIGUIENTE</p>
          <div className="flex items-center gap-4">
            <div className="relative w-12 h-12 flex items-center justify-center">
              {/* Countdown Timer */}
              <div className="absolute inset-0 flex items-center justify-center z-10">
                <span className="text-sm font-bold font-mono text-primary">{timeRemainingSec}s</span>
              </div>

              {/* Background Ring for visual consistency */}
              <div className="absolute inset-0 -m-1 opacity-20">
                <svg width="56" height="56" className="transform -rotate-90">
                  <circle cx="28" cy="28" r="26" stroke="currentColor" strokeWidth="2" fill="none" className="text-primary" />
                </svg>
              </div>

              <div className="relative w-full h-full rounded-full overflow-hidden opacity-50 grayscale">
                <Image
                  src={nextAlbumArtUrl}
                  alt={nextTrack?.album || "Next Album Art"}
                  fill
                  className="object-cover"
                  data-ai-hint={albumArtHint}
                  key={`next-${currentTrackIndex}`}
                />
              </div>
            </div>
            <div>
              <h3 className="font-semibold text-left">{nextTrack?.title}</h3>
              <p className="text-sm text-left text-muted-foreground">{nextTrack?.artist}</p>
            </div>
          </div>
        </div>


        <div className="flex items-center gap-2 p-2 rounded-full bg-black/20 backdrop-blur-md border border-white/10 z-30">
          <Button variant="ghost" size="icon" className="rounded-full w-14 h-14 text-muted-foreground hover:text-foreground" onClick={skipPrev}>
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
          <Button variant="ghost" size="icon" className="rounded-full w-14 h-14 text-muted-foreground hover:text-foreground" onClick={skipNext}>
            <SkipForward />
          </Button>
        </div>
      </div>
    </>
  );
}
