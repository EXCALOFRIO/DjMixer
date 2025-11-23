/**
 * Hook para ejecutar health check de API keys al montar el componente
 * Usa endpoint API del servidor y caché de localStorage (24 horas)
 */

'use client';

import { useEffect, useState } from 'react';

interface ApiKeyStatus {
    keyIndex: number;
    isOperational: boolean;
    error?: string;
    responseTime?: number;
}

interface HealthCheckCache {
    results: ApiKeyStatus[];
    timestamp: number;
    operationalCount: number;
    totalCount: number;
}

const STORAGE_KEY = 'gemini-health-check-cache';
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 horas

function getTimeAgo(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;

    const minutes = Math.floor(diff / (60 * 1000));
    const hours = Math.floor(diff / (60 * 60 * 1000));
    const days = Math.floor(diff / (24 * 60 * 60 * 1000));

    if (days > 0) return `hace ${days} día${days > 1 ? 's' : ''}`;
    if (hours > 0) return `hace ${hours} hora${hours > 1 ? 's' : ''}`;
    if (minutes > 0) return `hace ${minutes} minuto${minutes > 1 ? 's' : ''}`;
    return 'hace un momento';
}

export function useApiHealthCheck() {
    const [healthCheckStatus, setHealthCheckStatus] = useState<{
        loading: boolean;
        results: ApiKeyStatus[];
        operationalCount: number;
        totalCount: number;
        lastCheck?: string;
    }>({
        loading: true,
        results: [],
        operationalCount: 0,
        totalCount: 0,
    });

    useEffect(() => {
        let mounted = true;

        async function runHealthCheck() {
            // Intentar obtener del caché primero
            try {
                const cached = localStorage.getItem(STORAGE_KEY);
                if (cached) {
                    const data = JSON.parse(cached) as HealthCheckCache;
                    const now = Date.now();

                    // Verificar si el caché ha expirado
                    if (now - data.timestamp <= CACHE_DURATION_MS) {
                        if (!mounted) return;

                        setHealthCheckStatus({
                            loading: false,
                            results: data.results,
                            operationalCount: data.operationalCount,
                            totalCount: data.totalCount,
                            lastCheck: getTimeAgo(data.timestamp),
                        });

                        console.log(`📦 Health check desde caché: ${data.operationalCount}/${data.totalCount} keys operativas (${getTimeAgo(data.timestamp)})`);
                        return;
                    }
                }
            } catch (error) {
                console.warn('Error leyendo caché:', error);
            }

            // No hay caché válido, llamar al endpoint API
            console.log('🏥 Ejecutando health check desde servidor...');

            try {
                const response = await fetch('/api/health-check-gemini');

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const data = await response.json();

                if (!mounted) return;

                if (data.success) {
                    const cache: HealthCheckCache = {
                        results: data.keys,
                        timestamp: data.timestamp || Date.now(),
                        operationalCount: data.summary.operational,
                        totalCount: data.summary.total,
                    };

                    // Guardar en localStorage
                    try {
                        localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
                    } catch (error) {
                        console.warn('Error guardando caché:', error);
                    }

                    setHealthCheckStatus({
                        loading: false,
                        results: data.keys,
                        operationalCount: data.summary.operational,
                        totalCount: data.summary.total,
                        lastCheck: 'hace un momento',
                    });

                    console.log(`✅ Health check completado: ${data.summary.operational}/${data.summary.total} keys operativas`);
                } else {
                    throw new Error(data.error || 'Error desconocido');
                }
            } catch (error) {
                console.error('❌ Error en health check:', error);

                if (!mounted) return;

                setHealthCheckStatus({
                    loading: false,
                    results: [],
                    operationalCount: 0,
                    totalCount: 0,
                });
            }
        }

        runHealthCheck();

        return () => {
            mounted = false;
        };
    }, []);

    return healthCheckStatus;
}
