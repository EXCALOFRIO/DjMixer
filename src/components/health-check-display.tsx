/**
 * Componente para mostrar el estado del health check de API keys
 * Muestra un indicador sutil en consola con el estado y última comprobación
/**
 * Componente para mostrar el estado del health check de API keys
 * Muestra un indicador sutil en consola con el estado y última comprobación
 */

'use client';

import { useEffect } from 'react';

interface ApiKeyStatus {
    keyIndex: number;
    isOperational: boolean;
    error?: string;
    responseTime?: number;
}

interface HealthCheckDisplayProps {
    loading: boolean;
    operationalCount: number;
    totalCount: number;
    lastCheck?: string;
    results?: ApiKeyStatus[];
}

export function HealthCheckDisplay({ loading, operationalCount, totalCount, lastCheck, results }: HealthCheckDisplayProps) {
    useEffect(() => {
        if (loading) {
            console.log('%c🏥 Gemini API Health Check', 'font-size: 12px; color: #6b7280');
            console.log('%c   Verificando estado...', 'color: #9ca3af; font-size: 11px');
        } else {
            const allOperational = operationalCount === totalCount;
            const someOperational = operationalCount > 0 && operationalCount < totalCount;
            const noneOperational = operationalCount === 0;

            // Mostrar de forma compacta y sutil
            if (allOperational) {
                console.log(
                    `%c🏥 Gemini API Keys: %c${operationalCount}/${totalCount} operativas %c${lastCheck ? `· ${lastCheck}` : ''}`,
                    'color: #6b7280; font-size: 11px',
                    'color: #10b981; font-weight: bold; font-size: 11px',
                    'color: #9ca3af; font-size: 10px'
                );
            } else if (someOperational) {
                console.log(
                    `%c⚠️ Gemini API Keys: %c${operationalCount}/${totalCount} operativas %c${lastCheck ? `· ${lastCheck}` : ''}`,
                    'color: #6b7280; font-size: 11px',
                    'color: #f59e0b; font-weight: bold; font-size: 11px',
                    'color: #9ca3af; font-size: 10px'
                );

                // Mostrar detalles de las keys no operativas
                if (results) {
                    const failed = results.filter(r => !r.isOperational);
                    if (failed.length > 0) {
                        console.log(`%c   Keys no operativas:`, 'color: #f59e0b; font-size: 10px; font-weight: bold');
                        failed.forEach(key => {
                            console.log(
                                `%c   • GEMINI_API_KEY${key.keyIndex}: %c${key.error || 'Error desconocido'}`,
                                'color: #9ca3af; font-size: 10px',
                                'color: #ef4444; font-size: 10px'
                            );
                        });
                    }
                }
            } else if (noneOperational) {
                console.log(
                    `%c❌ Gemini API Keys: %c0/${totalCount} operativas %c${lastCheck ? `· ${lastCheck}` : ''}`,
                    'color: #6b7280; font-size: 11px',
                    'color: #ef4444; font-weight: bold; font-size: 11px',
                    'color: #9ca3af; font-size: 10px'
                );
                console.log('%c   Verifica las API keys en .env', 'color: #ef4444; font-size: 10px');
            }
        }
    }, [loading, operationalCount, totalCount, lastCheck, results]);

    return null; // Este componente solo muestra en consola
}
