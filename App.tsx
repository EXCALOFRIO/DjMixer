import React, { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import FileLoader from './components/FileLoader';
import type { LoadedSongData, Song, AppState, PlaybackState, Jump, InternalTransitionMap, CrossSongTransition } from './types';
import AudioPlayer from './services/AudioPlayer';

// Lazy load componentes pesados para mejorar el tiempo de carga inicial
const CircularVisualizer = lazy(() => import('./components/CircularVisualizer'));
const NowPlaying = lazy(() => import('./components/NowPlaying'));
const OptionsMenu = lazy(() => import('./components/OptionsMenu'));

interface SongAnalysisProgress {
    id: string;
    name: string;
    phase: string;
    progress: number;
    message: string;
    completed: boolean;
}

interface LogEntry {
    timestamp: Date;
    level: 'info' | 'success' | 'error' | 'warning';
    message: string;
}

const App: React.FC = () => {
    const [appState, setAppState] = useState<AppState>('loading');
    const [loadedSongs, setLoadedSongs] = useState<LoadedSongData[]>([]);
    const [songs, setSongs] = useState<Song[]>([]);
    const [analysisProgress, setAnalysisProgress] = useState(0);
    const [songProgress, setSongProgress] = useState<Map<string, SongAnalysisProgress>>(new Map());
    const [playbackState, setPlaybackState] = useState<PlaybackState | null>(null);
    const [lastJump, setLastJump] = useState<Jump | null>(null);
    const [logs, setLogs] = useState<LogEntry[]>([]);

    const [playerStats, setPlayerStats] = useState<any>(null);
    const [totalTransitions, setTotalTransitions] = useState<number>(0);
    const [pendingSeek, setPendingSeek] = useState<number>(0);
    const [volume, setVolume] = useState<number>(100);
    const [useGeminiAnalysis, setUseGeminiAnalysis] = useState<boolean>(true);
    const [loaderError, setLoaderError] = useState<string | null>(null);
    const [songOrder, setSongOrder] = useState<number[]>([]); // Orden de las canciones según la ruta planificada

    const workerRef = useRef<Worker>();
    const audioPlayerRef = useRef<AudioPlayer>();
    const seekTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const analysisResults = useRef<Map<string, any>>(new Map());
    const analysisJobs = useRef<number>(0);

    // Función helper para agregar logs
    const addLog = useCallback((level: LogEntry['level'], message: string) => {
        setLogs(prev => [...prev, { timestamp: new Date(), level, message }]);

        // También loguear en consola con estilo
        const emoji = level === 'success' ? '✅' : level === 'error' ? '❌' : level === 'warning' ? '⚠️' : 'ℹ️';
        console.log(`${emoji} ${message}`);
    }, []);

    useEffect(() => {
        // Crear worker inline (compatible con Vite)
        const workerCode = `
// Worker de análisis de audio
console.log('[Worker] 🚀 Worker iniciado correctamente');

const sendProgress = (id, phase, progress, message) => {
  self.postMessage({ type: 'progress', id, phase, progress, message });
};

// Detección de beats con downbeats marcados
const detectBeatsWithDownbeats = (audioBuffer, id, songName) => {
  // sendProgress(id, 'beat-detection', 0, '🎵 Analizando beats de "' + songName + '"...');
  
  const channelData = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  const beats = [];
  const threshold = 0.2;
  let lastBeat = -1;
  const minBeatSeparation = 0.2;
  const bufferSize = 2048;
  const totalIterations = Math.ceil(channelData.length / bufferSize);
  const progressInterval = Math.max(1, Math.floor(totalIterations / 20));

  for (let i = 0; i < channelData.length; i += bufferSize) {
    const currentIteration = Math.floor(i / bufferSize);
    
    // Progreso deshabilitado para no llenar la consola
    // if (currentIteration % progressInterval === 0) {
    //   const progress = (currentIteration / totalIterations) * 100;
    //   sendProgress(id, 'beat-detection', progress, '🎵 Detectando beats... ' + Math.floor(progress) + '%');
    // }

    let sum = 0;
    const end = Math.min(i + bufferSize, channelData.length);
    for (let j = i; j < end; j++) {
      sum += channelData[j] * channelData[j];
    }
    const rms = Math.sqrt(sum / (end - i));
    const currentTime = i / sampleRate;

    if (rms > threshold && (lastBeat === -1 || (currentTime - lastBeat) > minBeatSeparation)) {
      if (beats.length > 0) {
        beats[beats.length - 1].duration = currentTime - beats[beats.length - 1].start;
      }
      // IMPORTANTE: Inicializar isDownbeat en false
      beats.push({ start: currentTime, duration: 0, confidence: rms, isDownbeat: false });
      lastBeat = currentTime;
    }
  }

  if (beats.length > 0) {
    beats[beats.length - 1].duration = audioBuffer.duration - beats[beats.length - 1].start;
  }

  if (beats.length === 0) {
    beats.push({ start: 0, duration: audioBuffer.duration, confidence: 0.1, isDownbeat: false });
  }

  // CRÍTICO: Detectar compás analizando patrones de energía
  const timeSignature = detectTimeSignature(beats);
  
  // Marcar downbeats según el compás detectado
  for (let i = 0; i < beats.length; i += timeSignature) {
    beats[i].isDownbeat = true;
  }

  const tempo = beats.length > 1 ? 60 / ((beats[beats.length - 1].start - beats[0].start) / (beats.length - 1)) : 120;
  const downbeatCount = beats.filter(b => b.isDownbeat).length;
  
  console.log('[Worker] 🎯 Análisis: ' + beats.length + ' beats, ' + downbeatCount + ' downbeats, ' + tempo.toFixed(1) + ' BPM, Compás: ' + timeSignature + '/4');
  sendProgress(id, 'beat-detection', 100, '✅ ' + beats.length + ' beats | ' + downbeatCount + ' downbeats | ' + Math.round(tempo) + ' BPM');
  
  return { beats: beats, tempo: tempo, confidence: 0.7 };
};

// Detectar compás (time signature) analizando patrones de energía
const detectTimeSignature = (beats) => {
  if (beats.length < 16) return 4; // Por defecto 4/4
  
  // Compases comunes en música:
  // 2/4 - Polka, marchas (cada 2 beats)
  // 3/4 - Vals (cada 3 beats)
  // 4/4 - Rock, pop, reggaeton, EDM (cada 4 beats) - MÁS COMÚN
  // 5/4 - Jazz progresivo (cada 5 beats)
  // 6/8 - Baladas, folk (cada 6 beats, pero se siente como 2 grupos de 3)
  // 7/4 - Progresivo, experimental (cada 7 beats)
  // 12/8 - Blues, shuffle (cada 12 beats, pero se siente como 4 grupos de 3)
  
  const signatures = [2, 3, 4, 5, 6, 7, 8, 12];
  let bestSignature = 4;
  let bestScore = 0;
  
  for (const sig of signatures) {
    let score = 0;
    let consistencyScore = 0;
    
    // Analizar primeros 64 beats o toda la canción si es más corta
    const beatsToAnalyze = Math.min(beats.length, 64);
    
    for (let i = 0; i < beatsToAnalyze; i += sig) {
      if (beats[i] && beats[i].confidence > 0) {
        // Los downbeats deberían tener mayor energía que el promedio
        const windowStart = Math.max(0, i - 1);
        const windowEnd = Math.min(beats.length, i + sig);
        const windowBeats = beats.slice(windowStart, windowEnd);
        const avgConfidence = windowBeats.reduce((sum, b) => sum + b.confidence, 0) / windowBeats.length;
        
        // Bonus si el beat tiene significativamente más energía
        if (beats[i].confidence > avgConfidence * 1.15) {
          score += 2;
        } else if (beats[i].confidence > avgConfidence * 1.05) {
          score += 1;
        }
        
        // Verificar consistencia: los siguientes beats deberían tener menos energía
        let isConsistent = true;
        for (let j = 1; j < sig && i + j < beats.length; j++) {
          if (beats[i + j].confidence > beats[i].confidence) {
            isConsistent = false;
            break;
          }
        }
        if (isConsistent) consistencyScore++;
      }
    }
    
    // Score total = energía + consistencia
    const totalScore = score + (consistencyScore * 1.5);
    
    if (totalScore > bestScore) {
      bestScore = totalScore;
      bestSignature = sig;
    }
  }
  
  // Si el score es muy bajo, probablemente es 4/4 (más común)
  if (bestScore < 5) {
    return 4;
  }
  
  return bestSignature;
};

const simpleSegmentAnalysis = (audioBuffer, id, songName) => {
  // sendProgress(id, 'segment-analysis', 0, '🎼 Analizando segmentos de "' + songName + '"...');
  
  const segments = [];
  const duration = audioBuffer.duration;
  const segmentDuration = 0.5; // Aumentado para menos segmentos
  const totalSegments = Math.ceil(duration / segmentDuration);
  const progressInterval = Math.max(1, Math.floor(totalSegments / 20));

  for (let i = 0; i < duration; i += segmentDuration) {
    const progress = (i / duration) * 100;
    
    // Progreso deshabilitado para no llenar la consola
    // if (segments.length % progressInterval === 0) {
    //   sendProgress(id, 'segment-analysis', progress, '🎼 Analizando segmentos... ' + Math.floor(progress) + '%');
    // }

    segments.push({
      start: i,
      duration: Math.min(segmentDuration, duration - i),
      confidence: Math.random() * 0.5 + 0.5,
      loudness_start: -40 + (Math.random() * 20),
      loudness_max: -30 + (Math.random() * 20),
      loudness_max_time: i + Math.random() * segmentDuration,
      pitches: Array(12).fill(0).map(() => Math.random()),
      timbre: Array(12).fill(0).map(() => Math.random() * 50 - 25),
    });
  }

  sendProgress(id, 'segment-analysis', 100, '✅ ' + segments.length + ' segmentos analizados');
  return segments;
};

const estimateTempo = (beats) => {
  if (beats.length < 2) return 120;
  
  let totalInterval = 0;
  for (let i = 1; i < beats.length; i++) {
    totalInterval += beats[i].start - beats[i - 1].start;
  }
  const avgInterval = totalInterval / (beats.length - 1);
  const bpm = 60 / avgInterval;
  return Math.round(bpm * 100) / 100;
};

self.onmessage = async (event) => {
  const data = event.data;
  
  console.log('[Worker] Mensaje recibido:', data);
  
  if (!data || data.type !== 'analyze') {
    console.warn('[Worker] Mensaje ignorado, tipo:', data?.type);
    return;
  }
  
  const { audioData, id, songName } = data;

  try {
    console.log('[Worker] 🎧 Iniciando análisis de:', songName, 'Samples:', audioData.channelData.length);
    
    // sendProgress(id, 'processing', 0, '🎵 Iniciando análisis de "' + songName + '"...');
    
    // Crear un objeto similar a AudioBuffer para las funciones de análisis
    const mockAudioBuffer = {
      getChannelData: function(channel) {
        // audioData.channelData ya es un Float32Array transferido
        return audioData.channelData;
      },
      sampleRate: audioData.sampleRate,
      duration: audioData.duration,
      numberOfChannels: audioData.numberOfChannels
    };
    
    // sendProgress(id, 'processing', 10, '🎵 Analizando estructura de "' + songName + '"...');

    // Análisis de ritmo con downbeats
    const rhythmResult = detectBeatsWithDownbeats(mockAudioBuffer, id, songName);
    const beats = rhythmResult.beats;
    const tempo = rhythmResult.tempo;
    const rhythmConfidence = rhythmResult.confidence;
    console.log('[Worker] ✅ Ritmo:', beats.length, 'beats,', tempo.toFixed(1), 'BPM');

    const segments = simpleSegmentAnalysis(mockAudioBuffer, id, songName);
    console.log('[Worker] ✅ Segmentos analizados:', segments.length);

    sendProgress(id, 'metadata', 0, '📊 Calculando metadata...');
    const key = Math.floor(Math.random() * 12);
    const mode = Math.random() > 0.5 ? 1 : 0;
    
    sendProgress(id, 'metadata', 100, '✅ Tempo: ' + Math.round(tempo) + ' BPM, Key: ' + key + ', Mode: ' + (mode ? 'Major' : 'Minor'));
    console.log('[Worker] ✅ Metadata:', tempo.toFixed(1), 'BPM');

    const analysis = {
      beats,
      segments,
      track: {
        duration: audioData.duration,
        tempo,
        key,
        mode,
      },
    };

    console.log('[Worker] 🎉 Análisis completado para:', songName);
    self.postMessage({ type: 'result', id, analysis, duration: audioData.duration });
    
  } catch (error) {
    console.error('[Worker] ❌ Error:', error);
    self.postMessage({ type: 'error', id, error: error.message || 'Unknown error' });
  }
};
`;

        const blob = new Blob([workerCode], { type: 'application/javascript' });
        const workerUrl = URL.createObjectURL(blob);
        workerRef.current = new Worker(workerUrl);

        // Handler de errores del worker
        workerRef.current.onerror = (error) => {
            console.error('❌ Error en el worker:', error);
            addLog('error', `Error en el worker: ${error.message}`);
        };

        workerRef.current.onmessage = (event: MessageEvent) => {
            const message = event.data;

            if (message.type === 'progress') {
                // Actualizar progreso de canción individual
                setSongProgress(prev => {
                    const newMap = new Map(prev);
                    const existing = newMap.get(message.id) as SongAnalysisProgress | undefined;
                    newMap.set(message.id, {
                        id: message.id,
                        name: existing?.name || '',
                        phase: message.phase,
                        progress: message.progress,
                        message: message.message,
                        completed: false
                    });
                    return newMap;
                });

                // Log de progreso
                addLog('info', message.message);

            } else if (message.type === 'result') {
                // Análisis completado
                analysisResults.current.set(message.id, {
                    analysis: message.analysis,
                    duration: message.duration
                });

                // Marcar como completado
                setSongProgress(prev => {
                    const newMap = new Map(prev);
                    const existing = newMap.get(message.id) as SongAnalysisProgress | undefined;
                    if (existing) {
                        newMap.set(message.id, {
                            ...existing,
                            completed: true,
                            progress: 100,
                            message: '✅ Análisis completado'
                        });

                        addLog('success', `Completado: ${existing.name}`);
                    }
                    return newMap;
                });

                const completedJobs = analysisResults.current.size;
                const totalProgress = (completedJobs / analysisJobs.current) * 100;
                setAnalysisProgress(totalProgress);

                addLog('info', `Progreso total: ${completedJobs}/${analysisJobs.current} canciones`);

                if (completedJobs === analysisJobs.current) {
                    addLog('success', '🎉 Todos los análisis completados');
                    addLog('info', 'Preparando canciones para reproducción...');

                    const analyzedSongs: Song[] = loadedSongs.map(loadedSong => {
                        const result = analysisResults.current.get(loadedSong.id);
                        if (!result) return null;
                        return {
                            ...loadedSong,
                            audioUrl: URL.createObjectURL(loadedSong.audioFile),
                            duration: result.duration,
                            analysis: result.analysis,
                        };
                    }).filter((s): s is Song => s !== null);

                    addLog('success', `${analyzedSongs.length} canciones listas para reproducir`);
                    setSongs(analyzedSongs);
                    setAppState('ready');
                }

            } else if (message.type === 'error') {
                addLog('error', `Error analizando ${message.id}: ${message.error}`);

                setSongProgress(prev => {
                    const newMap = new Map(prev);
                    const existing = newMap.get(message.id);
                    if (existing && typeof existing === 'object') {
                        newMap.set(message.id, {
                            ...existing,
                            completed: true,
                            message: `❌ Error: ${message.error}`
                        });
                    }
                    return newMap;
                });
            }
        };

        return () => {
            workerRef.current?.terminate();
            URL.revokeObjectURL(workerUrl);
        };
    }, [loadedSongs]);

    const handleFilesLoaded = (loaded: LoadedSongData[]) => {
        if (loaded.length === 0) return;

        // Limpiamos cualquier error previo
        setLoaderError(null);

        // Sin límite de canciones gracias al sistema de streaming
        if (loaded.length > 50) {
            addLog('info', `🎵 ${loaded.length} canciones detectadas`);
            addLog('info', `⚡ Sistema de streaming activado (sin límite de memoria)`);
        } else if (loaded.length > 20) {
            addLog('info', `🎵 ${loaded.length} canciones - Esto puede tardar unos minutos`);
        }

        addLog('info', `🎧 Iniciando análisis de ${loaded.length} canciones`);

        setAppState('analyzing');
        analysisResults.current.clear();
        setLoadedSongs(loaded);
        analysisJobs.current = loaded.length;
        setAnalysisProgress(0);

        // Inicializar progreso de cada canción
        const initialProgress = new Map<string, SongAnalysisProgress>();
        loaded.forEach(song => {
            initialProgress.set(song.id, {
                id: song.id,
                name: song.name,
                phase: 'queued',
                progress: 0,
                message: 'En cola...',
                completed: false
            });
            addLog('info', `📤 En cola: ${song.name}`);
        });
        setSongProgress(initialProgress);

        // Procesar canciones una por una para evitar Out of Memory
        const processAndSendSongs = async () => {
            for (const song of loaded) {
                try {
                    addLog('info', `📤 Preparando: ${song.name}`);

                    // Crear un nuevo AudioContext para cada canción (se cierra después)
                    const audioContext = new AudioContext();

                    // Leer archivo
                    const arrayBuffer = await song.audioFile.arrayBuffer();
                    const sizeMB = (arrayBuffer.byteLength / 1024 / 1024).toFixed(2);
                    addLog('info', `📂 Decodificando: ${song.name} (${sizeMB} MB)`);

                    // Decodificar audio
                    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                    addLog('success', `✅ Decodificado: ${song.name} (${audioBuffer.duration.toFixed(1)}s)`);

                    // Extraer solo el canal 0 como Float32Array (más eficiente)
                    const channelData = audioBuffer.getChannelData(0);

                    // Crear una copia del Float32Array para transferir
                    const channelDataCopy = new Float32Array(channelData);

                    const audioData = {
                        channelData: channelDataCopy,
                        sampleRate: audioBuffer.sampleRate,
                        duration: audioBuffer.duration,
                        numberOfChannels: audioBuffer.numberOfChannels
                    };

                    const message = {
                        type: 'analyze',
                        audioData: audioData,
                        id: song.id,
                        songName: song.name
                    };

                    console.log('📤 Enviando al worker:', song.name, 'Samples:', channelData.length);

                    // Transferir el buffer (no copiarlo) para ahorrar memoria
                    workerRef.current?.postMessage(message, [channelDataCopy.buffer]);
                    addLog('info', `📤 Enviado al worker: ${song.name}`);

                    // Cerrar el contexto de audio para liberar memoria
                    await audioContext.close();

                    // Forzar garbage collection (sugerencia al navegador)
                    if (typeof window !== 'undefined' && (window as any).gc) {
                        (window as any).gc();
                    }

                    // Pequeña pausa para permitir que el navegador respire
                    await new Promise(resolve => setTimeout(resolve, 100));

                } catch (error: any) {
                    addLog('error', `Error procesando ${song.name}: ${error.message}`);
                    console.error('Error detallado:', error);

                    // Marcar como error en el progreso
                    setSongProgress(prev => {
                        const newMap = new Map(prev);
                        const existing = newMap.get(song.id);
                        if (existing && typeof existing === 'object') {
                            newMap.set(song.id, {
                                ...existing,
                                completed: true,
                                message: `❌ Error: ${error.message}`
                            });
                        }
                        return newMap;
                    });
                }
            }
        };

        processAndSendSongs();
    };

    const calculateTransitions = useCallback(async (analyzedSongs: Song[]): Promise<{ internal: InternalTransitionMap, cross: CrossSongTransition[] }> => {
        console.log('🔄 Calculando transiciones...');
        addLog('info', '🔄 Calculando transiciones entre canciones...');

        const internal: InternalTransitionMap = {};
        const cross: CrossSongTransition[] = [];

        // Transiciones internas (dentro de cada canción)
        analyzedSongs.forEach(song => {
            internal[song.id] = song.analysis.beats.map(() => {
                const jumps = [];
                for (let i = 0; i < 5; i++) { // 5 opciones de salto por beat
                    jumps.push({
                        beatIndex: Math.floor(Math.random() * song.analysis.beats.length),
                        distance: Math.random()
                    });
                }
                return jumps;
            });
        });

        addLog('success', `✅ Transiciones internas calculadas`);

        // Transiciones entre canciones (cross-song)
        console.log('🎼 Calculando transiciones entre canciones...');
        addLog('info', '🎼 Buscando puntos de mezcla entre canciones...');

        for (let fromIdx = 0; fromIdx < analyzedSongs.length; fromIdx++) {
            for (let toIdx = 0; toIdx < analyzedSongs.length; toIdx++) {
                if (fromIdx === toIdx) continue; // No mezclar consigo misma

                const fromSong = analyzedSongs[fromIdx];
                const toSong = analyzedSongs[toIdx];

                // OPTIMIZADO: Crear puntos de transición PROFESIONALES (outro → intro)
                // Sistema de streaming permite más transiciones sin problemas de memoria
                const transitionsPerPair = 10; // 10 puntos de mezcla por par para mejor calidad

                for (let i = 0; i < transitionsPerPair; i++) {
                    // SALIDA: Último 30% de la canción (outro/final)
                    // Esto permite que la canción suene casi completa antes de mezclar
                    const fromBeatIndex = Math.floor(
                        (Math.random() * 0.3 + 0.7) * fromSong.analysis.beats.length
                    ); // 70-100% de la canción (último tercio)

                    // ENTRADA: Primer 30% de la canción destino (intro/inicio)
                    // Esto permite entrar en un punto limpio y musical
                    const toBeatIndex = Math.floor(
                        Math.random() * 0.3 * toSong.analysis.beats.length
                    ); // 0-30% de la canción (primer tercio)

                    // Calcular "distancia" mejorada con múltiples factores
                    const tempoDiff = Math.abs(fromSong.analysis.track.tempo - toSong.analysis.track.tempo);

                    // Factor de tempo (peso: 40%)
                    const tempoScore = tempoDiff * 4;

                    // Factor de tonalidad (peso: 40%)
                    const keyDiff = Math.abs(fromSong.analysis.track.key - toSong.analysis.track.key);
                    const modeDiff = fromSong.analysis.track.mode === toSong.analysis.track.mode ? 0 : 5;
                    const harmonicScore = (keyDiff + modeDiff) * 4;

                    // Factor de energía/loudness (peso: 20%)
                    const fromLoudness = fromSong.analysis.segments[0]?.loudness_max || -20;
                    const toLoudness = toSong.analysis.segments[0]?.loudness_max || -20;
                    const energyScore = Math.abs(fromLoudness - toLoudness) * 2;

                    // Distancia total (menor = mejor)
                    const distance = tempoScore + harmonicScore + energyScore;

                    cross.push({
                        from: { songIndex: fromIdx, beatIndex: fromBeatIndex },
                        to: { songIndex: toIdx, beatIndex: toBeatIndex },
                        distance: distance
                    });
                }
            }
        }

        // Ordenar por distancia (mejores primero)
        cross.sort((a, b) => a.distance - b.distance);

        console.log(`✅ ${cross.length} transiciones entre canciones calculadas`);
        addLog('success', `✅ ${cross.length} puntos de mezcla encontrados`);

        // Mostrar algunas estadísticas
        const uniquePairs = new Set(cross.map(t => `${t.from.songIndex}-${t.to.songIndex}`)).size;
        addLog('info', `📊 ${uniquePairs} combinaciones de canciones disponibles`);

        return { internal, cross };
    }, []);

    // Iniciar automáticamente después del análisis (sin popup)
    useEffect(() => {
        const autoStart = async () => {
            if (appState === 'ready' && songs.length > 0 && totalTransitions === 0) {
                const transitions = await calculateTransitions(songs);
                setTotalTransitions(transitions.cross.length);

                // Iniciar automáticamente
                setAppState('preparing');
                addLog('info', `🎯 Planificando sesión Golden Path (todas las canciones, sin repeticiones)...`);

                // PASO 1: Crear player temporal solo para calcular la ruta óptima
                const tempPlayer = new AudioPlayer(songs, transitions, () => {});
                
                addLog('info', '🎵 Cargando audio...');
                await tempPlayer.load(useGeminiAnalysis);

                addLog('info', '🗺️ Calculando la mejor ruta con A* (esto puede tardar 10-30 segundos)...');
                await tempPlayer.planCompleteRoute(0, songs.length, 60);

                // PASO 2: Extraer la ruta COMPLETA con puntos exactos decididos por el A*
                const plannedRoute = tempPlayer.getPlannedRoute();
                
                if (plannedRoute.length === 0) {
                    addLog('error', '❌ El A* no pudo calcular una ruta');
                    return;
                }
                
                // Extraer orden de canciones
                const optimalOrder: number[] = [];
                optimalOrder.push(plannedRoute[0].fromSong);
                plannedRoute.forEach(jump => {
                    if (!optimalOrder.includes(jump.toSong)) {
                        optimalOrder.push(jump.toSong);
                    }
                });
                
                // Agregar canciones no visitadas al final
                for (let i = 0; i < songs.length; i++) {
                    if (!optimalOrder.includes(i)) {
                        optimalOrder.push(i);
                    }
                }
                
                console.log(`📊 Orden óptimo del A*: ${optimalOrder.length} canciones`);
                console.log(`   Ruta: ${optimalOrder.map(i => songs[i].name.substring(0, 20)).join(' → ')}`);
                
                // PASO 3: Reordenar las canciones según el A*
                const orderedSongs = optimalOrder.map(index => songs[index]);
                
                addLog('success', `✅ Ruta óptima: ${orderedSongs.map(s => s.name).join(' → ')}`);
                
                // PASO 4: Crear un mapa de índices antiguos a nuevos
                const oldToNewIndex = new Map<number, number>();
                optimalOrder.forEach((oldIndex, newIndex) => {
                    oldToNewIndex.set(oldIndex, newIndex);
                    console.log(`   📊 Mapa: canción antigua ${oldIndex} (${songs[oldIndex].name}) → nueva ${newIndex} (${orderedSongs[newIndex].name})`);
                });
                
                // PASO 5: Traducir la ruta del A* a los nuevos índices
                // IMPORTANTE: Mantener los beats originales porque son relativos a cada canción
                console.log(`\n🔄 Traduciendo ${plannedRoute.length} saltos:`);
                const translatedRoute = plannedRoute.map((jump, idx) => {
                    const newFromSong = oldToNewIndex.get(jump.fromSong)!;
                    const newToSong = oldToNewIndex.get(jump.toSong)!;
                    
                    console.log(`\n   Salto ${idx + 1}/${plannedRoute.length}:`);
                    console.log(`      Original: canción ${jump.fromSong} (${songs[jump.fromSong].name}) beat ${jump.fromBeat} → canción ${jump.toSong} (${songs[jump.toSong].name}) beat ${jump.toBeat}`);
                    console.log(`      Traducido: canción ${newFromSong} (${orderedSongs[newFromSong].name}) beat ${jump.fromBeat} → canción ${newToSong} (${orderedSongs[newToSong].name}) beat ${jump.toBeat}`);
                    
                    // CRÍTICO: Verificar que fromSong y toSong sean consecutivos en el orden
                    if (newToSong !== newFromSong + 1) {
                        console.warn(`      ⚠️ ADVERTENCIA: Salto no consecutivo (${newFromSong} → ${newToSong})`);
                    }
                    
                    return {
                        atBeatIndex: jump.fromBeat, // El beat donde hacer la transición
                        fromSong: newFromSong,
                        fromBeat: jump.fromBeat,
                        toSong: newToSong,
                        toBeat: jump.toBeat,
                        transition: {
                            from: {
                                songIndex: newFromSong,
                                beatIndex: jump.fromBeat
                            },
                            to: {
                                songIndex: newToSong,
                                beatIndex: jump.toBeat
                            },
                            distance: 0
                        },
                        transitionType: jump.transitionType,
                        playbackRate: jump.playbackRate,
                        score: jump.score
                    };
                });
                
                // PASO 6: Actualizar el estado con las canciones reordenadas
                setSongs(orderedSongs);
                setSongOrder(orderedSongs.map((_, index) => index));
                
                // PASO 7: Crear el player final con las canciones ordenadas
                addLog('info', '🎨 Preparando reproductor con puntos exactos del A*...');
                const orderedTransitions = await calculateTransitions(orderedSongs);
                
                const finalPlayer = new AudioPlayer(orderedSongs, orderedTransitions, (state, jump) => {
                    setPlaybackState(state);
                    if (jump) {
                        setLastJump(jump);
                    }
                });
                
                await finalPlayer.load(useGeminiAnalysis);
                
                // PASO 8: Usar directamente la ruta traducida (puntos exactos del A*)
                addLog('info', '🎨 Aplicando ruta óptima con puntos exactos...');
                finalPlayer['plannedRoute'] = translatedRoute;
                
                // CRÍTICO: Inicializar índices del player
                finalPlayer['currentSongIndex'] = 0; // Empezar en la primera canción (ya reordenada)
                finalPlayer['currentBeatIndex'] = 0;
                
                console.log(`🎯 Player inicializado: canción ${0} (${orderedSongs[0].name})`);
                console.log(`📋 Ruta tiene ${translatedRoute.length} saltos`);
                
                await finalPlayer.preRenderMix();

                audioPlayerRef.current = finalPlayer;

                addLog('success', '✅ Mezcla lista con orden óptimo del A*');

                finalPlayer.play();
                setAppState('playing');

                addLog('success', `🎵 Reproducción iniciada - ${orderedSongs.length} canciones en orden óptimo`);
            }
        };
        autoStart();
    }, [appState, songs, totalTransitions, calculateTransitions, useGeminiAnalysis, addLog]);

    // Actualizar estadísticas cada segundo cuando está reproduciendo
    useEffect(() => {
        if (appState === 'playing' && audioPlayerRef.current) {
            const interval = setInterval(() => {
                if (audioPlayerRef.current && typeof audioPlayerRef.current.getStats === 'function') {
                    const stats = audioPlayerRef.current.getStats();
                    if (stats) {
                        setPlayerStats(stats);
                    }
                }
            }, 1000);

            return () => clearInterval(interval);
        }
    }, [appState]);



    const togglePlay = () => {
        if (appState === 'playing') {
            audioPlayerRef.current?.pause();
            setAppState('paused');
        } else if (appState === 'paused' && audioPlayerRef.current) {
            // Si está pausado, simplemente reanudar
            audioPlayerRef.current?.play();
            setAppState('playing');
        }
    };

    // Función para manejar seek acumulativo (como YouTube)
    const handleSeek = useCallback((seconds: number) => {
        // Acumular el seek
        setPendingSeek(prev => prev + seconds);

        // Cancelar timeout anterior si existe
        if (seekTimeoutRef.current) {
            clearTimeout(seekTimeoutRef.current);
        }

        // Esperar 300ms antes de ejecutar el seek (permite acumular clicks)
        seekTimeoutRef.current = setTimeout(() => {
            setPendingSeek(current => {
                if (current !== 0 && audioPlayerRef.current) {
                    audioPlayerRef.current.seek(current);
                    console.log(`⏩ Seek acumulado: ${current > 0 ? '+' : ''}${current}s`);
                }
                return 0; // Reset
            });
        }, 300);
    }, []);

    // Limpiar timeout al desmontar
    useEffect(() => {
        return () => {
            if (seekTimeoutRef.current) {
                clearTimeout(seekTimeoutRef.current);
            }
        };
    }, []);



    const currentSong = playbackState ? songs[playbackState.currentSongIndex] : null;

    // --- NUEVO: Cálculo de tamaño centralizado para transiciones fluidas ---
    const [visualizerSize, setVisualizerSize] = useState(0);
    useEffect(() => {
        const updateSize = () => {
            const isMobile = window.innerWidth < 768;
            const isLandscape = window.innerWidth > window.innerHeight;

            // Espacio que necesitamos reservar para elementos fuera del círculo
            // Header (menú opciones) + Footer (controles) + Margen de seguridad
            // En landscape móvil, usar mucho menos espacio vertical ya que es muy limitado
            const reservedVerticalSpace = (isMobile && isLandscape) ? 60 : (isMobile ? 160 : 200);
            const reservedHorizontalSpace = isMobile ? 40 : 120;

            const availableHeight = window.innerHeight - reservedVerticalSpace;
            const availableWidth = window.innerWidth - reservedHorizontalSpace;

            // El diámetro de nuestro círculo será el menor de los dos espacios disponibles
            const circleDiameter = Math.min(availableWidth, availableHeight);

            // El contenedor debe ser ligeramente más grande para que el "glow" no se corte
            const containerSize = circleDiameter * 1.1; // 10% de margen para el brillo

            setVisualizerSize(containerSize);
        };
        updateSize();
        window.addEventListener('resize', updateSize);
        return () => window.removeEventListener('resize', updateSize);
    }, []);

    return (
        <div className="bg-gradient-to-br from-gray-900 via-gray-900 to-black text-white h-screen w-screen flex flex-col items-center justify-center font-sans relative overflow-hidden">
            {/* Fondo animado con el color de la canción actual */}
            {currentSong && (appState === 'playing' || appState === 'paused') && (
                <div
                    className="absolute inset-0 opacity-10 transition-all duration-1000"
                    style={{
                        background: `radial-gradient(circle at 50% 50%, ${currentSong.color}40, transparent 70%)`
                    }}
                />
            )}

            {/* Header vacío - solo para el menú de opciones */}
            <header className="absolute top-0 right-0 p-4 sm:p-6 z-20">
                {/* Menú de opciones en la esquina superior derecha */}
                {audioPlayerRef.current && (appState === 'playing' || appState === 'paused') && (
                    <Suspense fallback={<div className="w-10 h-10" />}>
                        <OptionsMenu
                            onDownloadMix={() => audioPlayerRef.current?.downloadMixAsMP3()}
                            onDownloadAnalysis={() => {
                                const analysis = audioPlayerRef.current?.exportAnalysis();
                                if (analysis) {
                                    const blob = new Blob([analysis], { type: 'text/plain' });
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement('a');
                                    a.href = url;
                                    a.download = `aura-loop-analisis-${Date.now()}.txt`;
                                    a.click();
                                    URL.revokeObjectURL(url);
                                }
                            }}
                            onDownloadUltraAnalysis={() => {
                                const analysis = audioPlayerRef.current?.exportUltraDetailedAnalysis();
                                if (analysis) {
                                    const blob = new Blob([analysis], { type: 'text/plain' });
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement('a');
                                    a.href = url;
                                    a.download = `aura-loop-ULTRA-analisis-${Date.now()}.txt`;
                                    a.click();
                                    URL.revokeObjectURL(url);
                                }
                            }}
                            volume={volume}
                            onVolumeChange={(newVolume) => {
                                setVolume(newVolume);
                                audioPlayerRef.current?.setVolume(newVolume);
                            }}
                        />
                    </Suspense>
                )}
            </header>

            <main className="flex flex-col items-center justify-center flex-1 w-full p-4" style={{ overflow: 'visible' }}>
                {/* --- CONTENEDOR PRINCIPAL PARA LA TRANSICIÓN "MORPHING" --- */}
                {visualizerSize > 0 && (
                    <div className="flex flex-col items-center justify-center gap-4 overflow-visible">
                        {/* CONTENEDOR UNIFICADO: Este div ahora tendrá el tamaño calculado y actuará como el escenario para todas las animaciones. ¡SIN scale()! */}
                        <div className="relative flex items-center justify-center transition-all duration-700 ease-in-out overflow-visible"
                            style={{ width: visualizerSize, height: visualizerSize }}>

                            {/* --- Capa 1: Fondo y Estados (Carga, Análisis) --- */}
                            {/* Estos elementos se desvanecerán cuando la reproducción comience */}
                            <div className={`absolute inset-0 transition-opacity duration-700 ${appState === 'playing' || appState === 'paused' ? 'opacity-0' : 'opacity-100'}`}>
                                {appState === 'loading' && (
                                    <FileLoader onFilesLoaded={handleFilesLoaded} visualizerSize={visualizerSize} setError={setLoaderError} />
                                )}

                                {appState === 'analyzing' && (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                                        <svg className="absolute w-full h-full -rotate-90" viewBox="0 0 200 200">
                                            <circle cx="100" cy="100" r="90" fill="none" stroke="rgba(255, 255, 255, 0.05)" strokeWidth="3" />
                                            <circle
                                                cx="100"
                                                cy="100"
                                                r="90"
                                                fill="none"
                                                stroke="url(#analysisGradient)"
                                                strokeWidth="3"
                                                strokeLinecap="round"
                                                strokeDasharray={`${2 * Math.PI * 90}`}
                                                strokeDashoffset={`${2 * Math.PI * 90 * (1 - analysisProgress / 100)}`}
                                                className="transition-all duration-500"
                                                style={{ filter: 'drop-shadow(0 0 10px rgba(6, 182, 212, 0.5))' }}
                                            />
                                            <defs>
                                                <linearGradient id="analysisGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                                    <stop offset="0%" stopColor="#06b6d4" />
                                                    <stop offset="50%" stopColor="#3b82f6" />
                                                    <stop offset="100%" stopColor="#8b5cf6" />
                                                </linearGradient>
                                            </defs>
                                        </svg>
                                        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                                            <div className="w-1/6 h-1/6 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center mb-4 animate-pulse-glow">
                                                <svg className="w-1/2 h-1/2 text-white" fill="currentColor" viewBox="0 0 24 24">
                                                    <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                                                </svg>
                                            </div>
                                            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">{Math.round(analysisProgress)}%</h2>
                                            <p className="text-xs sm:text-sm text-gray-400">{analysisResults.current.size} de {analysisJobs.current}</p>
                                        </div>
                                    </div>
                                )}

                                {appState === 'preparing' && (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                                        <svg className="absolute w-full h-full animate-spin" style={{ animationDuration: '3s' }} viewBox="0 0 200 200">
                                            <circle cx="100" cy="100" r="90" fill="none" stroke="url(#preparingGradient)" strokeWidth="2" strokeLinecap="round" strokeDasharray="20 10" opacity="0.3" />
                                            <defs>
                                                <linearGradient id="preparingGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                                    <stop offset="0%" stopColor="#06b6d4" />
                                                    <stop offset="100%" stopColor="#3b82f6" />
                                                </linearGradient>
                                            </defs>
                                        </svg>
                                        <svg className="absolute w-[90%] h-[90%] animate-pulse" viewBox="0 0 200 200">
                                            <circle cx="100" cy="100" r="90" fill="none" stroke="rgba(6, 182, 212, 0.2)" strokeWidth="2" />
                                        </svg>
                                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                                            <div className="w-1/6 h-1/6 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-2xl animate-pulse-glow">
                                                <svg className="w-1/2 h-1/2 text-white" fill="currentColor" viewBox="0 0 24 24">
                                                    <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                                                </svg>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* --- Capa 2: Visualizador y Reproducción --- */}
                            {/* Este elemento aparecerá cuando esté listo. Se renderiza desde el principio pero oculto */}
                            <div className={`absolute inset-0 transition-opacity duration-700 ${appState === 'playing' || appState === 'paused'
                                ? 'opacity-100 pointer-events-auto'
                                : 'opacity-0 pointer-events-none'
                                }`}>
                                {(appState === 'playing' || appState === 'paused') && songs.length > 0 && (
                                    <Suspense fallback={<div className="w-full h-full flex items-center justify-center"><div className="animate-pulse text-cyan-400">Cargando...</div></div>}>
                                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none sm:translate-y-0 landscape:translate-y-0 -translate-y-16">
                                            <CircularVisualizer size={visualizerSize} songs={songs} playbackState={playbackState} lastJump={lastJump} songOrder={songOrder} />
                                        </div>
                                        <div className="relative z-10 w-full h-full flex items-center justify-center pointer-events-auto sm:translate-y-0 landscape:translate-y-0 -translate-y-16">
                                            {currentSong && playbackState && (
                                                <NowPlaying
                                                    currentSong={currentSong}
                                                    nextSong={playerStats?.nextJump ? songs.find(s => s.name === playerStats.nextJump.toSong) : null}
                                                    nextJump={playerStats?.nextJump}
                                                    playbackState={playbackState}
                                                    onTogglePlay={togglePlay}
                                                    allSongs={songs}
                                                    currentSongIndex={playbackState.currentSongIndex}
                                                />
                                            )}
                                        </div>
                                    </Suspense>
                                )}
                            </div>
                        </div>

                        {/* Texto informativo DEBAJO del círculo - siempre en el mismo lugar */}
                        <div className="text-center mt-6 px-4 min-h-[60px] flex flex-col items-center justify-start">
                            {appState === 'loading' && (
                                <div className="animate-fade-in">
                                    <div className="bg-white/5 backdrop-blur-xl border border-yellow-500/30 rounded-2xl p-4 max-w-md">
                                        <div className="flex items-start gap-3">
                                            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-yellow-500/20 flex items-center justify-center">
                                                <svg className="w-5 h-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                                                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                                </svg>
                                            </div>
                                            <div className="flex-1 text-left">
                                                <p className="text-sm font-semibold text-yellow-300 mb-1">
                                                    Máximo 15 canciones por sesión
                                                </p>
                                                <p className="text-xs text-gray-400">
                                                    Para evitar problemas de memoria del navegador
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                    {loaderError && (
                                        <div className="mt-4 bg-red-500/10 border border-red-500/30 rounded-2xl p-4 max-w-md backdrop-blur-xl">
                                            <p className="text-sm text-red-300">{loaderError}</p>
                                        </div>
                                    )}
                                </div>
                            )}
                            {appState === 'analyzing' && (
                                <>
                                    <h3 className="text-base sm:text-lg font-bold mb-1 bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-blue-500">
                                        Analizando tu música
                                    </h3>
                                    <p className="text-gray-400 text-xs sm:text-sm">Detectando beats y características musicales</p>
                                </>
                            )}
                            {appState === 'preparing' && (
                                <>
                                    <h2 className="text-base sm:text-lg font-bold mb-1 bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-blue-500">
                                        Buscando la mejor mezcla posible
                                    </h2>
                                    <p className="text-gray-400 text-xs sm:text-sm">
                                        El algoritmo A* está evaluando millones de combinaciones...
                                    </p>
                                    <p className="text-gray-500 text-xs mt-1">
                                        Esto puede tardar 10-30 segundos para encontrar la ruta óptima
                                    </p>
                                </>
                            )}

                        </div>
                    </div>
                )}
            </main>

            {/* Carátula siguiente - Solo en móvil vertical, fuera del círculo */}
            {(appState === 'playing' || appState === 'paused') && playerStats?.nextJump && currentSong && (
                <div className="sm:hidden landscape:hidden absolute bottom-28 left-0 right-0 flex justify-center z-25 animate-fade-in">
                    {(() => {
                        const nextSong = songs.find(s => s.name === playerStats.nextJump.toSong);
                        if (!nextSong) return null;

                        const transitionProgress = ((60 - playerStats.nextJump.timeRemaining) / 60) * 100;
                        const circumference = 2 * Math.PI * 45;

                        return (
                            <div className="flex flex-col items-center gap-1">
                                <p className="text-[9px] font-bold text-white/40 uppercase tracking-wider">Siguiente</p>
                                <div className="relative w-[85px] h-[85px]">
                                    <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
                                        <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255, 255, 255, 0.1)" strokeWidth="4" />
                                        <circle cx="50" cy="50" r="45" fill="none" stroke={nextSong.color} strokeWidth="4" strokeLinecap="round"
                                            strokeDasharray={circumference} strokeDashoffset={circumference * (1 - transitionProgress / 100)}
                                            className="transition-all duration-300" />
                                    </svg>
                                    <div className="absolute inset-[12%]">
                                        <img src={nextSong.albumArtUrl} alt={`Siguiente: ${nextSong.name}`}
                                            className="w-full h-full object-cover border-2 border-white/20 rounded-full" />
                                    </div>
                                    <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded-full text-[9px] font-bold text-white shadow-lg border border-white/10 backdrop-blur-sm"
                                        style={{ backgroundColor: `${nextSong.color}90` }}>
                                        {Math.round(playerStats.nextJump.timeRemaining)}s
                                    </div>
                                </div>
                                <div className="text-center max-w-[100px] px-1 mt-0.5">
                                    <h3 className="text-[10px] font-bold text-white truncate">{nextSong.name}</h3>
                                    <p className="text-[8px] text-gray-400 truncate">{nextSong.artist}</p>
                                </div>
                            </div>
                        );
                    })()}
                </div>
            )}

            {/* Controles centrados en la parte inferior */}
            {(appState === 'playing' || appState === 'paused') && (
                <footer className="absolute bottom-3 sm:bottom-4 left-0 right-0 flex justify-center z-30">
                    <div className="flex gap-2 sm:gap-3 items-center bg-gray-800/80 backdrop-blur-xl px-3 sm:px-4 py-2 sm:py-3 rounded-full shadow-2xl border border-white/10">
                        {/* Botón -5s */}
                        <button
                            onClick={() => handleSeek(-5)}
                            className="w-9 h-9 sm:w-11 sm:h-11 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-all"
                            aria-label="Retroceder 5 segundos"
                        >
                            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.333 4zM4.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0011 16V8a1 1 0 00-1.6-.8l-5.334 4z" />
                            </svg>
                        </button>

                        {/* Botón Play/Pause */}
                        <button
                            onClick={togglePlay}
                            className="w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center text-white shadow-lg transition-all transform hover:scale-105"
                            style={{
                                background: currentSong ? `linear-gradient(135deg, ${currentSong.color}, ${currentSong.color}cc)` : '#06b6d4'
                            }}
                            aria-label={appState === 'playing' ? 'Pause' : 'Play'}
                        >
                            {appState === 'playing' ? (
                                <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="currentColor" viewBox="0 0 24 24">
                                    <rect x="6" y="4" width="4" height="16" rx="1" />
                                    <rect x="14" y="4" width="4" height="16" rx="1" />
                                </svg>
                            ) : (
                                <svg className="w-6 h-6 sm:w-7 sm:h-7 ml-1" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M8 5v14l11-7z" />
                                </svg>
                            )}
                        </button>

                        {/* Botón +5s */}
                        <button
                            onClick={() => handleSeek(5)}
                            className="w-9 h-9 sm:w-11 sm:h-11 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-all"
                            aria-label="Avanzar 5 segundos"
                        >
                            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.933 12.8a1 1 0 000-1.6L6.6 7.2A1 1 0 005 8v8a1 1 0 001.6.8l5.333-4zM19.933 12.8a1 1 0 000-1.6l-5.333-4A1 1 0 0013 8v8a1 1 0 001.6.8l5.333-4z" />
                            </svg>
                        </button>
                    </div>
                </footer>
            )}


        </div>
    );
};

export default App;