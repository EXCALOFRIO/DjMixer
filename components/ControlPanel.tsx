import React, { useState, useEffect } from 'react';

interface ControlPanelProps {
    isOpen: boolean;
    onToggle: () => void;
    settings: {
        mixIntensity: number;
        similarityThreshold: number;
    };
    onSettingsChange: (settings: { mixIntensity: number; similarityThreshold: number }) => void;
    stats: {
        beatsPlayed: number;
        currentBranchChance: number;
        nextJumpIn: number | null;
        nextJumpTo: string | null;
        totalJumps: number;
        songsVisited: Set<number>;
        totalPlannedJumps?: number;
        currentRouteProgress?: number;
    } | null;
}

const ControlPanel: React.FC<ControlPanelProps> = ({ 
    isOpen, 
    onToggle, 
    settings, 
    onSettingsChange,
    stats 
}) => {
    const [localSettings, setLocalSettings] = useState(settings);

    useEffect(() => {
        setLocalSettings(settings);
    }, [settings]);

    const handleMixIntensityChange = (value: number) => {
        const newSettings = { ...localSettings, mixIntensity: value };
        setLocalSettings(newSettings);
        onSettingsChange(newSettings);
    };

    const handleSimilarityChange = (value: number) => {
        const newSettings = { ...localSettings, similarityThreshold: value };
        setLocalSettings(newSettings);
        onSettingsChange(newSettings);
    };

    const getMixIntensityLabel = (value: number) => {
        if (value <= 3) return 'Muy Bajo';
        if (value <= 5) return 'Bajo';
        if (value <= 7) return 'Medio';
        if (value <= 9) return 'Alto';
        return 'Muy Alto';
    };

    const getSimilarityLabel = (value: number) => {
        if (value <= 2) return 'Cualquiera';
        if (value <= 4) return 'Flexible';
        if (value <= 6) return 'Moderado';
        if (value <= 8) return 'Estricto';
        return 'Muy Estricto';
    };

    return (
        <>
            {/* Botón flotante para abrir/cerrar */}
            <button
                onClick={onToggle}
                className="fixed top-4 right-4 z-50 bg-gray-800 hover:bg-gray-700 text-white rounded-full p-3 shadow-lg transition-all"
                aria-label="Toggle control panel"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
            </button>

            {/* Panel lateral */}
            <div className={`fixed top-0 right-0 h-full w-80 bg-gray-900 border-l border-gray-700 shadow-2xl transform transition-transform duration-300 z-40 ${
                isOpen ? 'translate-x-0' : 'translate-x-full'
            }`}>
                <div className="p-6 h-full overflow-y-auto">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-xl font-bold text-white">🎛️ Control de Mezcla</h2>
                        <button
                            onClick={onToggle}
                            className="text-gray-400 hover:text-white"
                        >
                            ✕
                        </button>
                    </div>

                    {/* Intensidad de Mezcla */}
                    <div className="mb-8">
                        <label className="block text-sm font-semibold text-gray-300 mb-2">
                            Intensidad de Mezcla
                        </label>
                        <div className="flex items-center gap-3 mb-2">
                            <span className="text-2xl">🐌</span>
                            <input
                                type="range"
                                min="1"
                                max="10"
                                value={localSettings.mixIntensity}
                                onChange={(e) => handleMixIntensityChange(Number(e.target.value))}
                                className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                            />
                            <span className="text-2xl">🚀</span>
                        </div>
                        <div className="flex justify-between text-xs text-gray-400">
                            <span>Menos cambios</span>
                            <span className="text-cyan-400 font-semibold">
                                {getMixIntensityLabel(localSettings.mixIntensity)}
                            </span>
                            <span>Más cambios</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-2">
                            Controla qué tan seguido cambia la música
                        </p>
                    </div>

                    {/* Similitud de Cambios */}
                    <div className="mb-8">
                        <label className="block text-sm font-semibold text-gray-300 mb-2">
                            Similitud de Cambios
                        </label>
                        <div className="flex items-center gap-3 mb-2">
                            <span className="text-2xl">🎲</span>
                            <input
                                type="range"
                                min="1"
                                max="10"
                                value={localSettings.similarityThreshold}
                                onChange={(e) => handleSimilarityChange(Number(e.target.value))}
                                className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-green-500"
                            />
                            <span className="text-2xl">🎯</span>
                        </div>
                        <div className="flex justify-between text-xs text-gray-400">
                            <span>Cualquiera</span>
                            <span className="text-green-400 font-semibold">
                                {getSimilarityLabel(localSettings.similarityThreshold)}
                            </span>
                            <span>Muy Similar</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-2">
                            Controla qué tan parecidos deben ser los cambios
                        </p>
                    </div>

                    {/* Próximo Salto */}
                    {stats && (
                        <>
                            <div className="bg-gray-800 rounded-lg p-4 mb-6">
                                <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                                    <span>⏱️</span>
                                    Próximo Cambio Planificado
                                </h3>
                                
                                <div className="space-y-3">
                                    {/* Canción destino */}
                                    {stats.nextJumpTo && (
                                        <div className="bg-gray-700 rounded p-2 mb-2">
                                            <div className="text-xs text-gray-400 mb-1">Próxima canción:</div>
                                            <div className="text-sm font-semibold text-green-400 truncate">
                                                🎵 {stats.nextJumpTo}
                                            </div>
                                        </div>
                                    )}

                                    {/* Tiempo estimado */}
                                    <div>
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="text-xs text-gray-400">En:</span>
                                            <span className="text-2xl font-bold text-cyan-400">
                                                {stats.nextJumpIn !== null && stats.nextJumpIn > 0 
                                                    ? `${stats.nextJumpIn.toFixed(1)}s` 
                                                    : '---'}
                                            </span>
                                        </div>
                                        {stats.nextJumpIn !== null && stats.nextJumpIn > 0 && (
                                            <div className="w-full h-3 bg-gray-700 rounded-full overflow-hidden">
                                                <div 
                                                    className="h-full bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500 transition-all duration-1000 animate-pulse"
                                                    style={{ width: `${Math.max(0, 100 - (stats.nextJumpIn / 20 * 100))}%` }}
                                                ></div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Certeza (siempre 100% porque está planificado) */}
                                    <div>
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="text-xs text-gray-400">Certeza:</span>
                                            <span className="text-sm font-semibold text-green-400 flex items-center gap-1">
                                                ✓ 100%
                                            </span>
                                        </div>
                                        <div className="text-xs text-gray-500 italic">
                                            Cambio pre-calculado y garantizado
                                        </div>
                                    </div>

                                    {/* Progreso en la ruta */}
                                    {stats.totalPlannedJumps && stats.currentRouteProgress !== undefined && (
                                        <div className="flex justify-between items-center pt-2 border-t border-gray-700">
                                            <span className="text-xs text-gray-400">Progreso de ruta:</span>
                                            <span className="text-sm font-semibold text-purple-400">
                                                {stats.currentRouteProgress}/{stats.totalPlannedJumps}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Estadísticas */}
                            <div className="bg-gray-800 rounded-lg p-4">
                                <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                                    <span>📊</span>
                                    Estadísticas
                                </h3>
                                
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-gray-400">Total de cambios:</span>
                                        <span className="text-white font-semibold">{stats.totalJumps}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-400">Canciones visitadas:</span>
                                        <span className="text-green-400 font-semibold">{stats.songsVisited.size}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-400">Promedio por canción:</span>
                                        <span className="text-cyan-400 font-semibold">
                                            {stats.totalJumps > 0 ? (stats.totalJumps / stats.songsVisited.size).toFixed(1) : '0'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}

                    {/* Info */}
                    <div className="mt-6 p-3 bg-gray-800 rounded-lg border border-gray-700">
                        <p className="text-xs text-gray-400 mb-2">
                            💡 <span className="font-semibold">Modo DJ:</span> Cada cambio va a una canción diferente, como un mix real.
                        </p>
                        <p className="text-xs text-gray-400">
                            🎯 <span className="font-semibold">Tip:</span> Aumenta la similitud para transiciones más suaves.
                        </p>
                    </div>
                </div>
            </div>

            {/* Overlay cuando está abierto */}
            {isOpen && (
                <div 
                    className="fixed inset-0 bg-black bg-opacity-50 z-30"
                    onClick={onToggle}
                ></div>
            )}
        </>
    );
};

export default ControlPanel;
