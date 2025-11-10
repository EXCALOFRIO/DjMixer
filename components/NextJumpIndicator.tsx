import React, { useState, useEffect } from 'react';

interface NextJumpIndicatorProps {
    stats: {
        currentSong?: string;
        nextJump?: {
            fromSong: string;
            toSong: string;
            type: string;
            timeRemaining: number;
        } | null;
        isPlaying?: boolean;
    } | null;
}

const NextJumpIndicator: React.FC<NextJumpIndicatorProps> = ({ stats }) => {
    const [coverUrl, setCoverUrl] = useState<string | null>(null);

    if (!stats?.nextJump) return null;

    const { nextJump } = stats;
    const timeRemaining = nextJump.timeRemaining;

    // Extraer nombre y artista del nombre del archivo
    const getTrackInfo = (filename: string) => {
        // Remover extensión
        const nameWithoutExt = filename.replace(/\.(mp3|wav|flac|m4a|ogg)$/i, '');
        
        // Intentar separar por " - " (formato común: Artista - Canción)
        const parts = nameWithoutExt.split(' - ');
        if (parts.length >= 2) {
            return {
                artist: parts[0].trim(),
                title: parts.slice(1).join(' - ').trim()
            };
        }
        
        // Si no hay separador, todo es el título
        return {
            artist: 'Artista Desconocido',
            title: nameWithoutExt
        };
    };

    const trackInfo = getTrackInfo(nextJump.toSong);

    const formatTime = (seconds: number) => {
        if (seconds < 0) return '0s';
        if (seconds < 10) return `${seconds.toFixed(1)}s`;
        return `${Math.round(seconds)}s`;
    };

    // Calcular progreso (0-100%)
    // Asumimos que el tiempo máximo es el tiempo inicial del salto
    // Para simplificar, usamos 60 segundos como referencia
    const maxTime = 60;
    const progress = Math.max(0, Math.min(100, ((maxTime - timeRemaining) / maxTime) * 100));

    // Color según el tiempo restante
    const getColor = () => {
        if (timeRemaining < 5) return { from: '#ef4444', to: '#f97316' }; // red → orange
        if (timeRemaining < 15) return { from: '#f97316', to: '#eab308' }; // orange → yellow
        return { from: '#06b6d4', to: '#3b82f6' }; // cyan → blue
    };

    const colors = getColor();

    // Tipo de transición con emoji
    const getTransitionIcon = (type: string) => {
        switch (type) {
            case 'crossfade': return '🎵';
            case 'cut': return '✂️';
            case 'quickfade': return '⚡';
            case 'bassSwap': return '🔊';
            case 'echoOut': return '🌊';
            default: return '🎶';
        }
    };

    return (
        <div className="flex flex-col items-center gap-4 mt-6">
            {/* Carátula con barra circular */}
            <div className="relative">
                {/* SVG Círculo de progreso */}
                <svg className="w-48 h-48 transform -rotate-90" viewBox="0 0 200 200">
                    {/* Fondo del círculo */}
                    <circle
                        cx="100"
                        cy="100"
                        r="90"
                        fill="none"
                        stroke="rgba(55, 65, 81, 0.3)"
                        strokeWidth="12"
                    />
                    {/* Progreso */}
                    <circle
                        cx="100"
                        cy="100"
                        r="90"
                        fill="none"
                        stroke={`url(#gradient-${timeRemaining})`}
                        strokeWidth="12"
                        strokeLinecap="round"
                        strokeDasharray={`${2 * Math.PI * 90}`}
                        strokeDashoffset={`${2 * Math.PI * 90 * (1 - progress / 100)}`}
                        className="transition-all duration-1000 ease-out"
                        style={{
                            filter: timeRemaining < 10 ? 'drop-shadow(0 0 8px rgba(239, 68, 68, 0.6))' : 'none'
                        }}
                    />
                    <defs>
                        <linearGradient id={`gradient-${timeRemaining}`} x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor={colors.from} />
                            <stop offset="100%" stopColor={colors.to} />
                        </linearGradient>
                    </defs>
                </svg>

                {/* Carátula en el centro */}
                <div className="absolute inset-0 flex items-center justify-center p-8">
                    <div className="w-full h-full rounded-full overflow-hidden shadow-2xl bg-gradient-to-br from-purple-500 via-pink-500 to-red-500 flex items-center justify-center">
                        {coverUrl ? (
                            <img 
                                src={coverUrl} 
                                alt={trackInfo.title}
                                className="w-full h-full object-cover"
                            />
                        ) : (
                            <span className="text-6xl">🎵</span>
                        )}
                    </div>
                </div>

                {/* Tiempo restante flotante */}
                <div className="absolute -top-2 -right-2 bg-gray-900 border-2 border-gray-700 rounded-full px-4 py-2 shadow-xl">
                    <span 
                        className="text-2xl font-bold"
                        style={{
                            background: `linear-gradient(135deg, ${colors.from}, ${colors.to})`,
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            backgroundClip: 'text'
                        }}
                    >
                        {formatTime(timeRemaining)}
                    </span>
                </div>

                {/* Icono de transición */}
                <div className="absolute -bottom-2 -left-2 w-12 h-12 bg-gray-900 border-2 border-gray-700 rounded-full flex items-center justify-center shadow-xl">
                    <span className="text-2xl">{getTransitionIcon(nextJump.type)}</span>
                </div>
            </div>

            {/* Información de la canción */}
            <div className="text-center max-w-xs">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">
                    Próximo Cambio
                </p>
                <h3 className="text-lg font-bold text-white mb-1 truncate">
                    {trackInfo.title}
                </h3>
                <p className="text-sm text-gray-400 truncate">
                    {trackInfo.artist}
                </p>
            </div>

            {/* Alerta de urgencia */}
            {timeRemaining < 10 && (
                <div className="flex items-center gap-2 animate-pulse">
                    <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                    <span className="text-xs font-semibold text-red-400 uppercase tracking-wide">
                        Cambio inminente
                    </span>
                    <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                </div>
            )}
        </div>
    );
};

export default NextJumpIndicator;
