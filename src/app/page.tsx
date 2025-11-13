
"use client";

import BackgroundVisualizer from "@/components/background-visualizer";
import Header from "@/components/layout/header";
import { FileImporter } from "@/components/music/file-importer";
import { PlaybackInterface } from "@/components/music/playback-interface";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import * as musicMetadata from "music-metadata-browser";
import type { CancionAnalizada } from "@/lib/db";

export type Track = {
  file: File;
  title: string;
  artist: string;
  album: string;
  artwork: string | null;
  duration: number;
  url: string;
  analisis?: CancionAnalizada | null;
};

export default function Home() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [volume, setVolume] = useState(0.7);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const { toast } = useToast();

  const fetchAlbumArtFromAPI = async (artist: string, album: string): Promise<string | null> => {
    try {
      const response = await fetch(
        `https://musicbrainz.org/ws/2/release/?query=artist:${encodeURIComponent(artist)}%20AND%20release:${encodeURIComponent(album)}&fmt=json&limit=1`
      );
      const data = await response.json();
      
      if (data.releases && data.releases.length > 0) {
        const releaseId = data.releases[0].id;
        const artUrl = `https://coverartarchive.org/release/${releaseId}/front-250`;
        
        const artResponse = await fetch(artUrl);
        if (artResponse.ok) {
          return artUrl;
        }
      }
    } catch {
      return null;
    }
    return null;
  };

  const handleFiles = async (files: File[]) => {
    if (files.length === 0) return;

    setIsUploading(true);
    setUploadProgress(0);

    // PASO 1: Extracción rápida de metadatos básicos (sin análisis completo)
    console.log('📋 Extrayendo metadatos básicos de', files.length, 'archivos...');
    const formDataMetadata = new FormData();
    files.forEach(file => formDataMetadata.append('files', file));
    
    let metadatosRapidos: any[] = [];
    try {
      const response = await fetch('/api/metadata', {
        method: 'POST',
        body: formDataMetadata,
      });
      
      if (response.ok) {
        const data = await response.json();
        metadatosRapidos = data.canciones || [];
        console.log('✅ Metadatos extraídos:', metadatosRapidos.length);
      }
    } catch (error) {
      console.error('Error extrayendo metadatos:', error);
    }

    // PASO 2: Crear tracks iniciales con metadatos básicos
    const newTracks: Track[] = [];
    let processedCount = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const url = URL.createObjectURL(file);
      const metadato = metadatosRapidos[i];

      try {
        const metadata = await musicMetadata.parseBlob(file);
        const { common } = metadata;
        
        let artwork: string | null = null;
        
        if (common.picture?.[0]) {
          const picture = common.picture[0];
          const base64 = btoa(
            new Uint8Array(picture.data).reduce(
              (data, byte) => data + String.fromCharCode(byte),
              ''
            )
          );
          artwork = `data:${picture.format};base64,${base64}`;
        } else if (common.artist && common.album) {
          artwork = await fetchAlbumArtFromAPI(common.artist, common.album);
        }

        const track: Track = {
          file,
          title: metadato?.titulo || common.title || file.name.replace(/\.[^/.]+$/, ""),
          artist: metadato?.artista || common.artist || "Artista Desconocido",
          album: common.album || "Álbum Desconocido",
          artwork,
          duration: metadato?.duracion_ms ? metadato.duracion_ms / 1000 : 0,
          url,
          analisis: metadato?.analizado ? metadato : null,
        };

        newTracks.push(track);
      } catch (error) {
        console.error("Error procesando archivo:", file.name, error);
      }

      processedCount++;
      setUploadProgress((processedCount / files.length) * 50); // 50% por metadatos
    }

    setTracks((prev) => [...prev, ...newTracks]);

    // PASO 3: Análisis completo en segundo plano (solo para los que no están analizados)
    const tracksParaAnalizar = newTracks.filter(track => !track.analisis);
    
    if (tracksParaAnalizar.length > 0) {
      console.log('🤖 Analizando', tracksParaAnalizar.length, 'canciones con Gemini...');
      
      const MAX_CONCURRENT = 5;
      let analizadosCount = 0;

      for (let i = 0; i < tracksParaAnalizar.length; i += MAX_CONCURRENT) {
        const batch = tracksParaAnalizar.slice(i, i + MAX_CONCURRENT);
        
        await Promise.all(
          batch.map(async (track, batchIndex) => {
            const globalIndex = i + batchIndex;
            
            // Delay progresivo
            if (globalIndex > 0) {
              const delay = Math.min(globalIndex * 2000, 10000);
              await new Promise(resolve => setTimeout(resolve, delay));
            }

            try {
              const formData = new FormData();
              formData.append('file', track.file);
              
              const response = await fetch('/api/analyze', {
                method: 'POST',
                body: formData,
              });
              
              if (response.ok) {
                const analisis: CancionAnalizada = await response.json();
                
                // Actualizar el track con el análisis
                setTracks(prev => prev.map(t => 
                  t.url === track.url ? { ...t, analisis } : t
                ));

                toast({
                  title: "Canción analizada",
                  description: `${analisis.titulo} - BPM: ${analisis.bpm?.toFixed(1)}`,
                });
              }
            } catch (error) {
              console.error('Error analizando:', track.title, error);
            }

            analizadosCount++;
            setUploadProgress(50 + (analizadosCount / tracksParaAnalizar.length) * 50);
          })
        );
      }
    }

    setIsUploading(false);
    
    toast({
      title: "Procesamiento completado",
      description: `${newTracks.length} canción(es) cargada(s)`,
    });
  };

  const handleVolumeChange = (newVolume: number[]) => {
    setVolume(newVolume[0]);
  };

  // Mostrar importer solo si no hay tracks
  const showImporter = tracks.length === 0;
  
  // Mostrar player solo si hay tracks Y todos están analizados (o si no estamos subiendo)
  const todosAnalizados = tracks.length > 0 && tracks.every(t => t.analisis !== undefined);
  const showPlayer = todosAnalizados && !isUploading;

  return (
    <>
      <BackgroundVisualizer />
      <Header volume={volume} onVolumeChange={handleVolumeChange} />
      <main className="flex flex-col items-center justify-center min-h-screen p-4">
        <div className="container relative mx-auto flex flex-col items-center justify-center h-full flex-grow">
          
          <div className={cn("absolute inset-0 flex items-center justify-center transition-opacity duration-500",
            showPlayer ? 'opacity-100' : 'opacity-0 pointer-events-none'
          )}>
            {showPlayer && <PlaybackInterface tracks={tracks} volume={volume} />}
          </div>

          <div className={cn("absolute inset-0 flex items-center justify-center transition-opacity duration-500",
            (showImporter || isUploading) ? 'opacity-100' : 'opacity-0 pointer-events-none'
          )}>
            <FileImporter
              onFiles={handleFiles}
              isUploading={isUploading}
              uploadProgress={uploadProgress}
            />
          </div>

        </div>
      </main>
    </>
  );
}
