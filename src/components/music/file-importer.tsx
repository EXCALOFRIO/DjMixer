
"use client";

import { UploadCloud, Music } from "lucide-react";
import { useState, useRef, useEffect } from "react";

import { cn } from "@/lib/utils";

type FileImporterProps = {
  onFiles: (files: File[]) => void;
  isUploading: boolean;
  uploadProgress: number;
};

const UploadProgressRing = ({
    radius,
    stroke,
    progress,
    className,
  }: {
    radius: number;
    stroke: number;
    progress: number;
    className?: string;
  }) => {
    if (!radius) return null;
    const normalizedRadius = radius - stroke * 2;
    const circumference = normalizedRadius * 2 * Math.PI;
    const strokeDashoffset = circumference - (progress / 100) * circumference;
  
    return (
      <svg
        height={radius * 2}
        width={radius * 2}
        className={cn("transform -rotate-90", className)}
      >
        <circle
          stroke="hsl(var(--border))"
          fill="transparent"
          strokeWidth={stroke}
          r={normalizedRadius}
          cx={radius}
          cy={radius}
          className="opacity-10"
        />
        <circle
          stroke="hsl(var(--primary))"
          fill="transparent"
          strokeWidth={stroke}
          strokeDasharray={circumference + " " + circumference}
          style={{ strokeDashoffset }}
          strokeLinecap="round"
          r={normalizedRadius}
          cx={radius}
          cy={radius}
          className="transition-all duration-150 ease-linear"
        />
      </svg>
    );
  };

export function FileImporter({ onFiles, isUploading, uploadProgress }: FileImporterProps) {
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [ringRadius, setRingRadius] = useState(0);

  useEffect(() => {
    const calculateRadius = () => {
        if (containerRef.current) {
            setRingRadius(containerRef.current.offsetWidth / 2);
        }
    };
    calculateRadius();
    window.addEventListener('resize', calculateRadius);
    return () => window.removeEventListener('resize', calculateRadius);
  }, []);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.relatedTarget && (e.currentTarget as Node).contains(e.relatedTarget as Node)) {
      return;
    }
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };
  
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files).filter(
      (file) => file.type.startsWith("audio/")
    );
    onFiles(files);
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      onFiles(files);
    }
  };

  return (
    <div 
        ref={containerRef}
        className="relative w-full max-w-[400px] aspect-square flex flex-col items-center justify-center text-center p-4"
    >
        <div 
            className={cn("absolute inset-0 flex items-center justify-center transition-opacity duration-300",
                isUploading ? 'opacity-100' : 'opacity-0 pointer-events-none'
            )}
        >
            <UploadProgressRing radius={ringRadius} stroke={8} progress={uploadProgress} className="absolute text-primary" />
            <div className="flex flex-col items-center justify-center gap-2">
                <Music className="w-10 h-10 text-primary animate-pulse" />
                <p className="text-muted-foreground">Cargando canciones...</p>
            </div>
        </div>

      <label
        htmlFor="file-upload"
        className={cn(
          "relative flex items-center justify-center w-full h-full rounded-full cursor-pointer transition-all duration-300 border-2 border-dashed",
          isDragging ? "border-primary bg-primary/10 scale-105" : "border-border/50 bg-card/20 hover:border-primary/80 hover:bg-primary/5",
          isUploading ? 'opacity-0 scale-90 pointer-events-none' : 'opacity-100 scale-100'
        )}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <div className="flex flex-col items-center justify-center text-center">
          <UploadCloud className="w-10 h-10 md:w-12 md:h-12 mb-4 text-primary" />
          <p className="mb-2 text-md md:text-lg font-semibold text-foreground">
            Arrastra tu música
          </p>
          <p className="text-xs md:text-sm text-muted-foreground">O haz click para seleccionar</p>
        </div>
        <input
          id="file-upload"
          type="file"
          className="hidden"
          accept="audio/*"
          multiple
          onChange={onFileChange}
          disabled={isUploading}
        />
      </label>
    </div>
  );
}
