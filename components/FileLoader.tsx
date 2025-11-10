import React, { useState, useCallback } from 'react';
import type { LoadedSongData } from '../types';

declare const window: any;

interface FileLoaderProps {
    onFilesLoaded: (songs: LoadedSongData[]) => void;
    visualizerSize?: number;
    setError: (message: string | null) => void;
}

const colorExtractor = (imageUrl: string): Promise<string> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.src = imageUrl;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            if (!context) return resolve('#334155'); // slate-700

            // OPTIMIZACIÓN: Reducir la imagen a 50x50 píxeles para análisis rápido
            const sampleSize = 50;
            canvas.width = sampleSize;
            canvas.height = sampleSize;
            context.drawImage(img, 0, 0, sampleSize, sampleSize);

            // Obtener solo los píxeles del centro (más representativos)
            const centerSize = 30;
            const offset = (sampleSize - centerSize) / 2;
            const data = context.getImageData(offset, offset, centerSize, centerSize).data;

            const colorCounts: { [key: string]: number } = {};
            let maxCount = 0;
            let dominantColor = '#334155'; // slate-700

            // Muestrear cada 4 píxeles para mayor velocidad
            for (let i = 0; i < data.length; i += 16) { // Saltar de 4 en 4 píxeles
                // Ignorar píxeles transparentes, blancos y negros
                if (data[i + 3] < 255 ||
                    (data[i] > 250 && data[i + 1] > 250 && data[i + 2] > 250) ||
                    (data[i] < 5 && data[i + 1] < 5 && data[i + 2] < 5)) {
                    continue;
                }

                // Agrupar colores similares (reducir precisión para mejor rendimiento)
                const r = Math.floor(data[i] / 10) * 10;
                const g = Math.floor(data[i + 1] / 10) * 10;
                const b = Math.floor(data[i + 2] / 10) * 10;
                const rgb = `rgb(${r},${g},${b})`;

                colorCounts[rgb] = (colorCounts[rgb] || 0) + 1;
                if (colorCounts[rgb] > maxCount) {
                    maxCount = colorCounts[rgb];
                    dominantColor = rgb;
                }
            }
            resolve(dominantColor);
        };
        img.onerror = () => resolve('#334155');
    });
};

const FileLoader: React.FC<FileLoaderProps> = (props) => {
    const { onFilesLoaded, setError } = props;
    const [isDragging, setIsDragging] = useState(false);

    const processFiles = useCallback(async (files: FileList) => {
        setIsDragging(false);
        setError(null);

        const audioFiles = Array.from(files).filter(file => file.type.startsWith('audio/'));

        if (audioFiles.length === 0) {
            setError("No se encontraron archivos de audio. Por favor, arrastra archivos MP3, WAV, etc.");
            return;
        }

        const songPromises = audioFiles.map(audioFile => {
            return new Promise<LoadedSongData | null>((resolve) => {
                window.jsmediatags.read(audioFile, {
                    onSuccess: async (tag: any) => {
                        const { artist, title, picture } = tag.tags;
                        let albumArtUrl = '/placeholder.png'; // A default placeholder
                        if (picture) {
                            const blob = new Blob([new Uint8Array(picture.data)], { type: picture.format });
                            albumArtUrl = URL.createObjectURL(blob);
                        }

                        const color = await colorExtractor(albumArtUrl);
                        const songName = title || audioFile.name.substring(0, audioFile.name.lastIndexOf('.')) || 'Unknown Track';
                        const songArtist = artist || 'Unknown Artist';

                        resolve({
                            id: `${songName}-${songArtist}-${audioFile.size}`,
                            name: songName,
                            artist: songArtist,
                            albumArtUrl,
                            color,
                            audioFile,
                        });
                    },
                    onError: async (error: any) => {
                        console.warn('jsmediatags error, creating song with filename:', error);
                        const songName = audioFile.name.substring(0, audioFile.name.lastIndexOf('.')) || 'Unknown Track';
                        const color = await colorExtractor('/placeholder.png');
                        resolve({
                            id: `${songName}-unknown-${audioFile.size}`,
                            name: songName,
                            artist: 'Unknown Artist',
                            albumArtUrl: '/placeholder.png',
                            color: color,
                            audioFile: audioFile
                        });
                    }
                });
            });
        });

        const loadedSongs = (await Promise.all(songPromises)).filter((s): s is LoadedSongData => s !== null);

        if (loadedSongs.length > 0) {
            onFilesLoaded(loadedSongs);
        } else {
            setError("No se pudieron procesar los archivos. Pueden estar corruptos o no tener metadatos.");
        }
    }, [onFilesLoaded, setError]);

    const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    };
    const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    };
    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
    };
    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        processFiles(e.dataTransfer.files);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            processFiles(e.target.files);
        }
    };

    return (
        <div
            className="w-full h-full relative flex items-center justify-center"
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
        >
            {/* Círculo exterior decorativo */}
            <svg className="absolute w-[95%] h-[95%] pointer-events-none" viewBox="0 0 200 200">
                <circle
                    cx="100"
                    cy="100"
                    r="95"
                    fill="none"
                    stroke={isDragging ? "rgba(6, 182, 212, 0.4)" : "rgba(255, 255, 255, 0.05)"}
                    strokeWidth="2"
                    strokeDasharray="10 5"
                    className="transition-all duration-300"
                />
            </svg>

            {/* Input oculto */}
            <input
                type="file"
                id="file-upload"
                className="hidden"
                multiple
                onChange={handleFileChange}
                accept="audio/*"
            />

            {/* Label clickeable que ocupa el 90% del espacio */}
            <label
                htmlFor="file-upload"
                className={`w-[90%] h-[90%] cursor-pointer rounded-full flex flex-col items-center justify-center transition-all duration-300 ${isDragging
                    ? 'bg-cyan-500/20 border-4 border-cyan-400 shadow-2xl scale-105'
                    : 'bg-white/5 border-2 border-white/10 hover:bg-white/10 hover:border-cyan-400/50'
                    } backdrop-blur-xl`}
            >
                {/* Icono central */}
                <div className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full mb-4 flex items-center justify-center transition-all duration-300 ${isDragging ? 'bg-cyan-500 scale-110' : 'bg-gradient-to-br from-cyan-500 to-blue-600'
                    }`}>
                    <svg className="w-8 h-8 sm:w-10 sm:h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                </div>

                {/* Texto */}
                <h2 className="text-lg sm:text-xl font-bold text-white mb-2 px-8 text-center">
                    {isDragging ? '¡Suelta aquí!' : 'Arrastra tu música'}
                </h2>
                <p className="text-xs sm:text-sm text-gray-400 px-8 text-center">
                    {isDragging ? 'Suelta los archivos' : 'O haz click para seleccionar'}
                </p>
            </label>
        </div>
    );
};

export default FileLoader;
