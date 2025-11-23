/**
 * Sistema de Health Check para API Keys de Gemini
 * Verifica al inicio que las keys están operativas
 * Usa localStorage para cachear resultados por 24 horas
 */

import { GoogleGenAI } from '@google/genai';
import { getGeminiApiKeys } from './gemini-keys';

export interface ApiKeyStatus {
    key: string;
    keyIndex: number;
    isOperational: boolean;
    error?: string;
    responseTime?: number;
}

export interface HealthCheckCache {
    results: ApiKeyStatus[];
    timestamp: number;
    operationalCount: number;
    totalCount: number;
}

const STORAGE_KEY = 'gemini-health-check-cache';
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 horas

/**
 * Obtiene el caché de localStorage
 */
function getCache(): HealthCheckCache | null {
    if (typeof window === 'undefined') return null;

    try {
        const cached = localStorage.getItem(STORAGE_KEY);
        if (!cached) return null;

        const data = JSON.parse(cached) as HealthCheckCache;
        const now = Date.now();

        // Verificar si el caché ha expirado (24 horas)
        if (now - data.timestamp > CACHE_DURATION_MS) {
            localStorage.removeItem(STORAGE_KEY);
            return null;
        }

        return data;
    } catch (error) {
        console.warn('Error leyendo caché de health check:', error);
        return null;
    }
}

/**
 * Guarda el caché en localStorage
 */
function saveCache(results: ApiKeyStatus[]): void {
    if (typeof window === 'undefined') return;

    try {
        const operational = results.filter(r => r.isOperational);
        const cache: HealthCheckCache = {
            results,
            timestamp: Date.now(),
            operationalCount: operational.length,
            totalCount: results.length,
        };

        localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
    } catch (error) {
        console.warn('Error guardando caché de health check:', error);
    }
}

/**
 * Prueba una API key individual con el modelo más simple
 */
async function testSingleApiKey(key: string, keyIndex: number): Promise<ApiKeyStatus> {
    const startTime = Date.now();

    try {
        const ai = new GoogleGenAI({ apiKey: key });

        // Usar el modelo más simple y rápido para el test
        const response = await ai.models.generateContent({
            model: 'models/gemini-flash-lite-latest',
            contents: [{
                role: 'user',
                parts: [{ text: 'OK' }] // Prompt más corto
            }],
            config: {
                temperature: 0,
                maxOutputTokens: 5,
            }
        });

        const responseTime = Date.now() - startTime;
        const text = response.text?.trim() || '';

        // Verificar que la respuesta es válida
        if (text.length > 0) {
            return {
                key: `Key #${keyIndex + 1}`,
                keyIndex,
                isOperational: true,
                responseTime,
            };
        } else {
            return {
                key: `Key #${keyIndex + 1}`,
                keyIndex,
                isOperational: false,
                error: 'Respuesta vacía',
            };
        }
    } catch (error: any) {
        // Detectar error de cuota específicamente
        const errorMsg = error?.message || String(error);
        const isQuotaError = errorMsg.includes('quota') || errorMsg.includes('429') || errorMsg.includes('RESOURCE_EXHAUSTED');

        return {
            key: `Key #${keyIndex + 1}`,
            keyIndex,
            isOperational: false,
            error: isQuotaError ? 'Cuota excedida' : (errorMsg.substring(0, 50) + '...'),
        };
    }
}

/**
 * Prueba todas las API keys disponibles
 */
export async function testAllApiKeys(forceRefresh = false): Promise<ApiKeyStatus[]> {
    // Intentar usar caché primero
    if (!forceRefresh) {
        const cached = getCache();
        if (cached) {
            console.log(`📦 Usando caché de health check (${getTimeAgo(cached.timestamp)})`);
            console.log(`   ${cached.operationalCount}/${cached.totalCount} API keys operativas`);
            return cached.results;
        }
    }

    const allKeys = getGeminiApiKeys();

    if (allKeys.length === 0) {
        console.warn('⚠️ No se encontraron API keys de Gemini');
        return [];
    }

    console.log(`🔍 Probando ${allKeys.length} API keys de Gemini...`);

    // Probar todas las keys en paralelo
    const results = await Promise.all(
        allKeys.map((key, index) => testSingleApiKey(key, index))
    );

    // Guardar en caché
    saveCache(results);

    // Mostrar resultados
    const operational = results.filter(r => r.isOperational);
    const failed = results.filter(r => !r.isOperational);

    console.log(`✅ ${operational.length}/${allKeys.length} API keys operativas`);

    if (operational.length > 0) {
        const avgResponseTime = operational.reduce((sum, r) => sum + (r.responseTime || 0), 0) / operational.length;
        console.log(`   Tiempo promedio: ${avgResponseTime.toFixed(0)}ms`);
    }

    if (failed.length > 0) {
        console.warn(`❌ ${failed.length} API keys fallidas:`);
        failed.forEach(f => {
            console.warn(`   ${f.key}: ${f.error}`);
        });
    }

    return results;
}

/**
 * Obtiene el estado del health check (desde caché o ejecuta nuevo)
 */
export function getHealthCheckStatus(): HealthCheckCache | null {
    return getCache();
}

/**
 * Formatea el tiempo transcurrido
 */
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

export { getTimeAgo };
