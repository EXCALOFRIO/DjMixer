
"use client";

import BackgroundVisualizer from "@/components/background-visualizer";
import Header from "@/components/layout/header";
import { FileImporter } from "@/components/music/file-importer";
import { PlaybackInterface } from "@/components/music/playback-interface";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useApiHealthCheck } from "@/hooks/use-api-health-check";
import { HealthCheckDisplay } from "@/components/health-check-display";
import * as musicMetadata from "music-metadata-browser";
import type { CancionAnalizada } from "@/lib/db";
import type { MixPlanEntry } from "@/lib/mix-planner";

export type Track = {
  file: File;
  title: string;
  artist: string;
  album: string;
  artwork: string | null;
  duration: number;
  url: string;
  hash: string | null;
  analisis?: CancionAnalizada | null;
  geminiPending?: boolean;
};

export default function Home() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [volume, setVolume] = useState(0.7);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [mixPlan, setMixPlan] = useState<MixPlanEntry[] | null>(null);
  const [mixSequence, setMixSequence] = useState<any | null>(null);
  const { toast } = useToast();
  const mixPlanHashRef = useRef<string | null>(null);

  // 🏥 Health check de API keys al cargar la aplicación
  const healthCheck = useApiHealthCheck();

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

      const hash = metadato?.hash || null;
      const analisisExistente = metadato?.analizado && metadato?.hash_archivo
        ? (metadato as CancionAnalizada)
        : null;

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
          hash,
          analisis: analisisExistente,
          geminiPending: metadato?.geminiPending || false,
        };

        newTracks.push(track);
      } catch (error) {
        console.error("Error procesando archivo:", file.name, error);
      }

      processedCount++;
      setUploadProgress((processedCount / files.length) * 50); // 50% por metadatos
    }

    setTracks((prev) => [...prev, ...newTracks]);

    // PASO 3: Análisis PARALELO REAL con Promise.all
    const tracksParaAnalizar = newTracks.filter(track => !track.analisis || track.geminiPending);

    if (tracksParaAnalizar.length > 0) {
      console.log(`🚀 Analizando ${tracksParaAnalizar.length} canciones en PARALELO...`);
      console.log(`   ⚡ Essentia: máx 10 simultáneas`);
      console.log(`   🤖 Gemini: máx 25 simultáneas`);

      // Advertencia para lotes muy grandes
      if (tracksParaAnalizar.length > 50) {
        console.warn(`⚠️ ADVERTENCIA: ${tracksParaAnalizar.length} canciones es un lote grande.`);
        console.warn(`   Considera procesar en grupos de 50 para mejor estabilidad.`);
      }

      try {
        // 1️⃣ ANÁLISIS ESSENTIA + GEMINI - PIPELINE PARALELO REAL
        console.log('\n📊 Lanzando análisis Essentia + Gemini en pipeline...');
        console.log('   ⚡ Cada canción lanza Gemini inmediatamente tras Essentia');

        // Obtener configuración de Gemini
        let MAX_GEMINI_CONCURRENTES = 25;
        try {
          const configResp = await fetch('/api/gemini-config');
          if (configResp.ok) {
            const configData = await configResp.json();
            MAX_GEMINI_CONCURRENTES = configData.maxParallelRequests || 25;
          }
        } catch (err) {
          console.log('⚠️ Config Gemini no disponible, usando 25 por defecto');
        }

        // Límites de concurrencia
        const MAX_ESSENTIA_CONCURRENTES = 10; // Limitar Essentia para no saturar servidor
        let essentiaEnCurso = 0;
        let geminiEnCurso = 0;

        const ejecutarEssentiaConLimite = async (fn: () => Promise<any>) => {
          while (essentiaEnCurso >= MAX_ESSENTIA_CONCURRENTES) {
            await new Promise(resolve => setTimeout(resolve, 200));
          }
          essentiaEnCurso++;
          try {
            return await fn();
          } finally {
            essentiaEnCurso--;
          }
        };

        const ejecutarGeminiConLimite = async (fn: () => Promise<void>) => {
          while (geminiEnCurso >= MAX_GEMINI_CONCURRENTES) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          geminiEnCurso++;
          try {
            await fn();
          } finally {
            geminiEnCurso--;
          }
        };

        const promesasPipeline = tracksParaAnalizar.map(async (track, index) => {
          const numActual = index + 1;

          // PASO 1: Essentia (con límite de concurrencia)
          try {
            const data = await ejecutarEssentiaConLimite(async () => {
              const formData = new FormData();
              formData.append('file', track.file);

              const response = await fetch('/api/analyze', {
                method: 'POST',
                body: formData,
              });

              if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Error desconocido' }));
                const errorMsg = errorData.error || `HTTP ${response.status}`;
                console.error(`   ❌ [${numActual}/${tracksParaAnalizar.length}] ${track.title} - Essentia falló: ${errorMsg}`);
                throw new Error(errorMsg);
              }

              return await response.json();
            });

            if (!data || !data.analisis) {
              console.error(`   ❌ [${numActual}/${tracksParaAnalizar.length}] ${track.title} - Respuesta sin análisis`);
              return { track, essentiaData: null, geminiSuccess: false };
            }

            console.log(`   ✅ [${numActual}/${tracksParaAnalizar.length}] ${track.title} - Essentia OK`);

            // Determinar si necesita Gemini (si es nuevo o si ya estaba pendiente)
            const needsGemini = (!data.fromCache || data.geminiPending) && data.hash;

            // Actualizar track inmediatamente con datos de Essentia
            setTracks(prev => prev.map(t =>
              t.file.name === track.file.name
                ? {
                  ...t,
                  hash: data.hash,
                  duration: data.analisis.duracion_ms ? data.analisis.duracion_ms / 1000 : t.duration,
                  analisis: data.analisis as CancionAnalizada,
                  geminiPending: !!needsGemini // 🔒 FORZAR PENDIENTE para evitar que el mix arranque antes de tiempo
                }
                : t
            ));

            // PASO 2: Gemini (si no viene de caché O si está pendiente)
            if (needsGemini) {
              const MAX_REINTENTOS_GEMINI = 3;
              let reintentoGemini = 0;
              let geminiExitoso = false;

              while (reintentoGemini < MAX_REINTENTOS_GEMINI && !geminiExitoso) {
                try {
                  await ejecutarGeminiConLimite(async () => {
                    // Enviar el archivo MP3 completo (no solo el hash)
                    const formData = new FormData();
                    formData.append('file', track.file); // ⚠️ Campo correcto: 'file'
                    formData.append('hash', data.hash);

                    const geminiResp = await fetch('/api/enrich-gemini', {
                      method: 'POST',
                      body: formData // FormData incluye el archivo
                    });

                    if (geminiResp.ok) {
                      const geminiData = await geminiResp.json();

                      // 🔒 VALIDACIÓN EXHAUSTIVA de la respuesta
                      const camposFaltantes: string[] = [];
                      
                      if (!geminiData.gemini) {
                        camposFaltantes.push('gemini');
                      } else {
                        if (!geminiData.gemini.estructura || !Array.isArray(geminiData.gemini.estructura) || geminiData.gemini.estructura.length === 0) {
                          camposFaltantes.push('estructura');
                        }
                        if (!geminiData.gemini.huecos || !Array.isArray(geminiData.gemini.huecos)) {
                          camposFaltantes.push('huecos');
                        }
                        if (!geminiData.gemini.tema || !geminiData.gemini.tema.palabras_clave || !geminiData.gemini.tema.emocion) {
                          camposFaltantes.push('tema completo');
                        }
                        if (!geminiData.gemini.eventos_dj || !Array.isArray(geminiData.gemini.eventos_dj)) {
                          camposFaltantes.push('eventos_dj');
                        }
                        if (!geminiData.gemini.transcripcion || !Array.isArray(geminiData.gemini.transcripcion.palabras)) {
                          camposFaltantes.push('transcripcion.palabras');
                        }
                      }

                      if (camposFaltantes.length > 0) {
                        console.warn(`   ⚠️ [${numActual}/${tracksParaAnalizar.length}] ${track.title} - Respuesta Gemini incompleta (intento ${reintentoGemini + 1}/${MAX_REINTENTOS_GEMINI})`);
                        console.warn(`      Campos faltantes: ${camposFaltantes.join(', ')}`);
                        throw new Error(`Respuesta Gemini incompleta - faltan: ${camposFaltantes.join(', ')}`);
                      }

                      setTracks(prev => prev.map(t =>
                        t.hash === data.hash && t.analisis
                          ? {
                            ...t,
                            analisis: {
                              ...t.analisis,
                              genero: geminiData.gemini?.genero,
                              subgenero: geminiData.gemini?.subgenero,
                              emocion_principal: geminiData.gemini?.emocion_principal,
                              intensidad_emocional: geminiData.gemini?.intensidad_emocional
                            } as CancionAnalizada,
                            geminiPending: false // ✅ Marcamos como completado para desbloquear el mix
                          }
                          : t
                      ));

                      console.log(`   🤖 [${numActual}/${tracksParaAnalizar.length}] ${track.title} - Gemini OK`);
                      geminiExitoso = true; // ✅ Marcar como exitoso
                    } else {
                      const errorText = await geminiResp.text().catch(() => 'Error desconocido');
                      console.warn(`   ⚠️ [${numActual}/${tracksParaAnalizar.length}] ${track.title} - Gemini falló (${geminiResp.status}): ${errorText}`);
                      throw new Error(`HTTP ${geminiResp.status}: ${errorText}`);
                    }
                  });
                } catch (error) {
                  reintentoGemini++;
                  console.warn(`   ⚠️ [${numActual}/${tracksParaAnalizar.length}] ${track.title} - Error Gemini (intento ${reintentoGemini}/${MAX_REINTENTOS_GEMINI}):`, error instanceof Error ? error.message : error);
                  
                  // Si llegamos al máximo de reintentos, marcar como no pendiente para no bloquear
                  if (reintentoGemini >= MAX_REINTENTOS_GEMINI) {
                    console.error(`   ❌ [${numActual}/${tracksParaAnalizar.length}] ${track.title} - Gemini falló tras ${MAX_REINTENTOS_GEMINI} intentos`);
                    
                    // 🔓 Desbloquear track aunque falle Gemini para permitir el mix
                    setTracks(prev => prev.map(t =>
                      t.hash === data.hash
                        ? { ...t, geminiPending: false }
                        : t
                    ));
                  } else {
                    // Esperar antes de reintentar (backoff exponencial)
                    await new Promise(resolve => setTimeout(resolve, 1000 * reintentoGemini));
                  }
                }
              }
            }

            return { track, essentiaData: data, geminiSuccess: data.fromCache ? null : true };

          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Error de red';
            console.error(`   ❌ [${numActual}/${tracksParaAnalizar.length}] ${track.title} - ${errorMsg}`);
            return { track, essentiaData: null, geminiSuccess: false };
          }
        });

        // Esperar a que TODAS terminen (pero ya se van procesando en paralelo)
        const resultados = await Promise.all(promesasPipeline);

        const exitosos = resultados.filter(r => r.essentiaData);
        const geminiExitosos = resultados.filter(r => r.geminiSuccess === true);

        console.log(`\n✅ Pipeline completado:`);
        console.log(`   📊 Essentia: ${exitosos.length}/${tracksParaAnalizar.length}`);
        console.log(`   🤖 Gemini: ${geminiExitosos.length}/${resultados.filter(r => r.essentiaData && !r.essentiaData.fromCache).length}`);

        setUploadProgress(100);

        // Notificar resultado final
        const exitososTotal = exitosos.length;
        const falliosTotal = tracksParaAnalizar.length - exitososTotal;

        if (falliosTotal > 0) {
          toast({
            title: "Análisis completado con errores",
            description: `${exitososTotal} canciones analizadas, ${falliosTotal} fallaron`,
            variant: "destructive"
          });
        } else {
          toast({
            title: "Análisis completado",
            description: `${exitososTotal} canciones analizadas exitosamente`,
          });
        }

      } catch (error) {
        console.error('Error crítico en análisis:', error);
        toast({
          title: "Error en el análisis",
          description: "Ocurrió un error inesperado durante el análisis",
          variant: "destructive",
        });
      }

      setUploadProgress(100);
    } else {
      console.log('✅ Todas las canciones ya estaban analizadas (caché)');
      setUploadProgress(100);
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

  // Mostrar player solo si hay tracks Y todos están analizados Y NO hay pendientes de Gemini
  const todosAnalizados = tracks.length > 0 && tracks.every(t =>
    Boolean(t.analisis && t.analisis.hash_archivo) && !t.geminiPending
  );
  const showPlayer = todosAnalizados && !isUploading && mixSequence !== null;

  useEffect(() => {
    if (!todosAnalizados) {
      setMixPlan(null);
      setMixSequence(null);
      mixPlanHashRef.current = null;
      return;
    }

    const hashes = tracks
      .map(track => track.analisis?.hash_archivo || track.hash)
      .filter((hash): hash is string => typeof hash === 'string' && hash.length > 0);

    if (hashes.length === 0) {
      return;
    }

    const hashKey = hashes.join('|');
    if (mixPlanHashRef.current === hashKey) {
      return;
    }

    mixPlanHashRef.current = hashKey;

    // PASO 1: Generar mix plan
    console.log('📊 Generando mix plan...');
    fetch('/api/mix-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hashes }),
    })
      .then(async response => {
        if (!response.ok) {
          throw new Error('mix-plan-error');
        }
        return response.json() as Promise<{ plan: MixPlanEntry[] }>;
      })
      .then(({ plan }) => {
        setMixPlan(plan);
        console.log('✅ Mix plan calculado con top 5 puntos de entrada/salida por canción');

        toast({
          title: "Mix Plan Generado",
          description: `${plan.length} canciones con puntos de entrada/salida identificados`,
        });

        // PASO 2: Ejecutar algoritmo A* para secuenciar
        console.log('🎯 Ejecutando algoritmo A* para secuenciar...');
        return fetch('/api/mix-sequence', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            hashes,
            sessionLength: Math.min(hashes.length, 10) // Máximo 10 canciones en la secuencia
          }),
        });
      })
      .then(async response => {
        if (!response.ok) {
          throw new Error('mix-sequence-error');
        }
        return response.json();
      })
      .then(({ session }) => {
        setMixSequence(session);
        console.log('✅ Secuencia A* generada:', session);
        console.log(`   📈 Score total: ${session.totalScore.toFixed(2)}`);
        console.log(`   📊 Score promedio transiciones: ${session.avgTransitionScore.toFixed(2)}`);

        toast({
          title: "Secuencia Optimizada Generada",
          description: `${session.tracks.length} canciones ordenadas (Score: ${session.totalScore.toFixed(0)}/100)`,
        });
      })
      .catch((error) => {
        mixPlanHashRef.current = null;
        console.error('❌ Error generando mix plan o secuencia:', error);
        toast({
          title: "Error",
          description: "No se pudo generar la secuencia optimizada",
          variant: "destructive",
        });
      });
  }, [todosAnalizados, tracks, toast]);

  return (
    <>
      <HealthCheckDisplay
        loading={healthCheck.loading}
        operationalCount={healthCheck.operationalCount}
        totalCount={healthCheck.totalCount}
        lastCheck={healthCheck.lastCheck}
        results={healthCheck.results}
      />
      <BackgroundVisualizer />
      <Header volume={volume} onVolumeChange={handleVolumeChange} />
      <main className="flex flex-col items-center justify-center min-h-screen p-4">
        <div className="container relative mx-auto flex flex-col items-center justify-center h-full flex-grow">

          <div className={cn("absolute inset-0 flex items-center justify-center transition-opacity duration-500",
            showPlayer ? 'opacity-100' : 'opacity-0 pointer-events-none'
          )}>
            {showPlayer && <PlaybackInterface tracks={tracks} volume={volume} mixPlan={mixPlan ?? undefined} mixSequence={mixSequence} />}
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
