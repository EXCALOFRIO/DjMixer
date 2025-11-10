import React, { useState, useEffect, useRef } from 'react';

interface LogEntry {
    timestamp: Date;
    level: 'info' | 'success' | 'error' | 'warning';
    message: string;
}

interface AnalysisLoggerProps {
    logs: LogEntry[];
    onClear?: () => void;
}

const AnalysisLogger: React.FC<AnalysisLoggerProps> = ({ logs, onClear }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const logContainerRef = useRef<HTMLDivElement>(null);

    // Auto-scroll al final cuando hay nuevos logs
    useEffect(() => {
        if (logContainerRef.current && isExpanded) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [logs, isExpanded]);

    const getLogIcon = (level: string) => {
        switch (level) {
            case 'success': return '✅';
            case 'error': return '❌';
            case 'warning': return '⚠️';
            default: return 'ℹ️';
        }
    };

    const getLogColor = (level: string) => {
        switch (level) {
            case 'success': return 'text-green-400';
            case 'error': return 'text-red-400';
            case 'warning': return 'text-yellow-400';
            default: return 'text-gray-300';
        }
    };

    return (
        <div className="fixed bottom-4 right-4 z-50">
            {/* Botón flotante */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="bg-gray-800 hover:bg-gray-700 text-white rounded-full p-3 shadow-lg transition-all flex items-center gap-2"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                {logs.length > 0 && (
                    <span className="bg-cyan-500 text-white text-xs rounded-full px-2 py-1">
                        {logs.length}
                    </span>
                )}
            </button>

            {/* Panel de logs expandido */}
            {isExpanded && (
                <div className="absolute bottom-16 right-0 w-96 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl overflow-hidden">
                    {/* Header */}
                    <div className="bg-gray-800 px-4 py-3 flex items-center justify-between border-b border-gray-700">
                        <h3 className="font-semibold text-white flex items-center gap-2">
                            <span>📋</span>
                            Logs de Análisis
                        </h3>
                        <div className="flex gap-2">
                            {onClear && (
                                <button
                                    onClick={onClear}
                                    className="text-gray-400 hover:text-white text-xs"
                                    title="Limpiar logs"
                                >
                                    🗑️
                                </button>
                            )}
                            <button
                                onClick={() => setIsExpanded(false)}
                                className="text-gray-400 hover:text-white"
                            >
                                ✕
                            </button>
                        </div>
                    </div>

                    {/* Logs */}
                    <div 
                        ref={logContainerRef}
                        className="max-h-96 overflow-y-auto p-4 space-y-2 bg-gray-900"
                    >
                        {logs.length === 0 ? (
                            <p className="text-gray-500 text-sm text-center py-8">
                                No hay logs todavía
                            </p>
                        ) : (
                            logs.map((log, index) => (
                                <div 
                                    key={index}
                                    className="text-xs font-mono bg-gray-800 rounded p-2 border-l-2 border-gray-700"
                                >
                                    <div className="flex items-start gap-2">
                                        <span className="text-base">{getLogIcon(log.level)}</span>
                                        <div className="flex-1">
                                            <span className="text-gray-500">
                                                {log.timestamp.toLocaleTimeString()}
                                            </span>
                                            <p className={`${getLogColor(log.level)} mt-1`}>
                                                {log.message}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default AnalysisLogger;
