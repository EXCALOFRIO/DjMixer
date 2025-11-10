import React from 'react';
import type { Song } from '../types';

interface PrePlaySettingsProps {
    isOpen: boolean;
    onStart: () => void;
    onCancel: () => void;
    songs: Song[];
    totalTransitions?: number; // Total de transiciones disponibles
}

const PrePlaySettings: React.FC<PrePlaySettingsProps> = ({ isOpen, onStart, onCancel, songs, totalTransitions }) => {
    if (!isOpen) return null;

    // Calcular duración promedio de las canciones
    const avgSongDuration = songs.length > 0 
        ? songs.reduce((sum, song) => sum + song.duration, 0) / songs.length 
        : 180; // 3 minutos por defecto

    // El número de cambios es siempre N-1 (todas las canciones, sin repeticiones)
    const totalJumps = songs.length - 1;

    const getEstimatedDuration = () => {
        // Estimación: cada canción suena aproximadamente el 70% de su duración
        const avgPlayTimePerSong = avgSongDuration * 0.7;
        // Total de canciones = songs.length (todas se reproducen una vez)
        const totalSeconds = Math.floor(songs.length * avgPlayTimePerSong);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return { minutes, seconds, totalSeconds };
    };

    const duration = getEstimatedDuration();

    return (
        <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="bg-gray-900 rounded-2xl shadow-2xl max-w-xl w-full my-auto border-2 border-cyan-500 max-h-[95vh] overflow-y-auto">
                {/* Header */}
                <div className="bg-gradient-to-r from-cyan-600 to-blue-600 p-4 sm:p-6 rounded-t-2xl sticky top-0 z-10">
                    <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">🎯 Sesión Golden Path</h2>
                    <p className="text-cyan-100 text-xs sm:text-sm">
                        La mejor ruta posible para escuchar todas tus canciones una vez
                    </p>
                </div>

                <div className="p-4 sm:p-8">
                    {/* Info principal */}
                    <div className="bg-gradient-to-br from-cyan-900 to-blue-900 rounded-xl p-4 sm:p-6 mb-4 sm:mb-6 border-2 border-cyan-500">
                        <div className="text-center mb-4">
                            <div className="text-5xl sm:text-6xl mb-3">🎵</div>
                            <h3 className="text-xl sm:text-2xl font-bold text-white mb-2">
                                {songs.length} Canciones
                            </h3>
                            <p className="text-cyan-200 text-sm">
                                Sin repeticiones • Ruta optimizada
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-3 sm:gap-4">
                            <div className="bg-black bg-opacity-30 rounded-lg p-3 sm:p-4">
                                <div className="text-xs text-cyan-300 mb-1">🔄 Cambios</div>
                                <div className="text-2xl sm:text-3xl font-bold text-white">
                                    {totalJumps}
                                </div>
                                <div className="text-xs text-gray-400 mt-1">
                                    transiciones
                                </div>
                            </div>

                            <div className="bg-black bg-opacity-30 rounded-lg p-3 sm:p-4">
                                <div className="text-xs text-cyan-300 mb-1">⏱️ Duración</div>
                                <div className="text-2xl sm:text-3xl font-bold text-white">
                                    {duration.minutes}:{duration.seconds.toString().padStart(2, '0')}
                                </div>
                                <div className="text-xs text-gray-400 mt-1">
                                    estimada
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Estadísticas detalladas */}
                    <div className="bg-gray-800 rounded-lg p-3 sm:p-4 mb-4 sm:mb-6 border border-gray-700">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs sm:text-sm text-gray-300">🎵 Canciones totales:</span>
                            <span className="text-base sm:text-lg font-bold text-cyan-400">{songs.length}</span>
                        </div>
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs sm:text-sm text-gray-300">⏱️ Duración promedio:</span>
                            <span className="text-base sm:text-lg font-bold text-green-400">{Math.floor(avgSongDuration)}s</span>
                        </div>
                        {totalTransitions && (
                            <div className="flex items-center justify-between">
                                <span className="text-xs sm:text-sm text-gray-300">✨ Transiciones disponibles:</span>
                                <span className="text-base sm:text-lg font-bold text-purple-400">{totalTransitions}</span>
                            </div>
                        )}
                    </div>

                    {/* Advertencia para sesiones grandes */}
                    {songs.length > 20 && (
                        <div className="bg-yellow-900 bg-opacity-30 border border-yellow-600 rounded-lg p-3 sm:p-4 mb-4 sm:mb-6">
                            <div className="flex items-start gap-2 sm:gap-3">
                                <span className="text-xl sm:text-2xl">⚠️</span>
                                <div>
                                    <h4 className="text-yellow-400 font-bold mb-1 text-sm sm:text-base">Sesión Grande</h4>
                                    <p className="text-yellow-100 text-xs sm:text-sm">
                                        Con {songs.length} canciones, el cálculo de la ruta óptima puede tardar unos minutos. 
                                        El algoritmo está optimizado para encontrar la mejor mezcla posible.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}



                    {/* Botones de acción */}
                    <div className="flex gap-2 sm:gap-4">
                        <button
                            onClick={onCancel}
                            className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-semibold py-3 sm:py-4 px-4 sm:px-6 rounded-lg transition-all text-sm sm:text-base"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={onStart}
                            className="flex-1 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold py-3 sm:py-4 px-4 sm:px-6 rounded-lg transition-all shadow-lg text-sm sm:text-base"
                        >
                            🎯 Iniciar Golden Path
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PrePlaySettings;
