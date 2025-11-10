import React from 'react';
import type { Song } from '../types';

interface NowPlayingProps {
    currentSong: Song;
    nextSong?: Song | null;
    nextJump?: {
        toSong: string;
        timeRemaining: number;
        type: string;
    } | null;
    playbackState: any;
    onTogglePlay?: () => void;
    allSongs: Song[];
    currentSongIndex: number;
}

const NowPlaying: React.FC<NowPlayingProps> = ({
    currentSong,
    nextSong,
    nextJump,
    playbackState,
    onTogglePlay
}) => {
    if (!currentSong) return null;

    // Progreso para el aro de la SIGUIENTE canción (0-100)
    const transitionProgress = nextJump ? ((60 - nextJump.timeRemaining) / 60) * 100 : 0;
    const circumference = 2 * Math.PI * 45;

    return (
        <>
            {/* En móvil: solo carátula actual dentro del círculo */}
            {/* En desktop: ambas carátulas dentro del círculo */}
            <div className="w-full h-full flex flex-col items-center justify-center gap-3 sm:gap-6 py-4 sm:py-6" style={{ overflow: 'visible' }}>
                {/* Carátula de la canción actual */}
                <div className="flex flex-col items-center gap-1.5 sm:gap-2" style={{ overflow: 'visible' }}>
                <div className="relative w-[170px] h-[170px] sm:w-[260px] sm:h-[260px] group cursor-pointer" style={{ overflow: 'visible' }} onClick={onTogglePlay}>
                    {/* Efecto de brillo - más sutil */}
                    <div
                        className="absolute -inset-3 rounded-full blur-xl opacity-25 transition-all duration-500 group-hover:opacity-40"
                        style={{ backgroundColor: currentSong.color }}
                    />

                    {/* Imagen */}
                    <img
                        src={currentSong.albumArtUrl}
                        alt={currentSong.name}
                        className="relative w-full h-full object-cover rounded-full shadow-2xl border-4 border-white/10 transition-transform duration-300 group-hover:scale-105"
                    />

                    {/* Overlay de Play/Pause */}
                    <div className="absolute inset-0 bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                        <div className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center backdrop-blur-sm">
                            {playbackState ? (
                                <svg className="w-8 h-8 text-gray-900" fill="currentColor" viewBox="0 0 24 24">
                                    <rect x="6" y="4" width="4" height="16" rx="1" />
                                    <rect x="14" y="4" width="4" height="16" rx="1" />
                                </svg>
                            ) : (
                                <svg className="w-8 h-8 text-gray-900 ml-1" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M8 5v14l11-7z" />
                                </svg>
                            )}
                        </div>
                    </div>
                </div>

                {/* Información de la canción actual */}
                <div className="text-center animate-fade-in max-w-[200px] sm:max-w-[280px] px-2 sm:px-4">
                    <h2 className="text-sm sm:text-lg font-bold text-white truncate mb-0.5">{currentSong.name}</h2>
                    <p className="text-xs sm:text-sm text-gray-400 truncate">{currentSong.artist}</p>
                </div>
            </div>

                {/* Carátula de la siguiente canción - Desktop y móvil horizontal */}
                {nextSong && nextJump && (
                    <div className="hidden sm:flex landscape:flex flex-col items-center gap-1.5 animate-fade-in" style={{ overflow: 'visible' }}>
                        {/* Etiqueta "SIGUIENTE" */}
                        <p className="text-[10px] font-bold text-white/40 uppercase tracking-wider">
                            Siguiente
                        </p>

                        <div className="relative w-[150px] h-[150px]" style={{ overflow: 'visible' }}>
                            {/* Efecto de brillo - más sutil */}
                            <div
                                className="absolute -inset-2 rounded-full blur-lg opacity-15 transition-all duration-500"
                                style={{ backgroundColor: nextSong.color }}
                            />

                            {/* Aro de progreso para la transición */}
                            <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
                                <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255, 255, 255, 0.1)" strokeWidth="4" />
                                <circle
                                    cx="50"
                                    cy="50"
                                    r="45"
                                    fill="none"
                                    stroke={nextSong.color}
                                    strokeWidth="4"
                                    strokeLinecap="round"
                                    strokeDasharray={circumference}
                                    strokeDashoffset={circumference * (1 - transitionProgress / 100)}
                                    className="transition-all duration-300"
                                    style={{ filter: `drop-shadow(0 0 5px ${nextSong.color})` }}
                                />
                            </svg>

                            {/* Imagen de la carátula */}
                            <div className="absolute inset-[12%]">
                                <img
                                    src={nextSong.albumArtUrl}
                                    alt={`Siguiente: ${nextSong.name}`}
                                    className="w-full h-full object-cover border-2 border-white/20 rounded-full"
                                />
                            </div>

                            {/* Tiempo restante */}
                            <div
                                className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full text-[10px] font-bold text-white shadow-lg border border-white/10 backdrop-blur-sm"
                                style={{ backgroundColor: `${nextSong.color}90` }}
                            >
                                {Math.round(nextJump.timeRemaining)}s
                            </div>
                        </div>

                        {/* Información de la siguiente canción */}
                        <div className="text-center max-w-[160px] px-2 mt-0.5">
                            <h3 className="text-xs font-bold text-white truncate">{nextSong.name}</h3>
                            <p className="text-[10px] text-gray-400 truncate">{nextSong.artist}</p>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
};

export default NowPlaying;
