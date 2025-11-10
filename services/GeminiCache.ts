/**
 * Cache local para análisis de Gemini
 * Evita repetir análisis de las mismas canciones
 * 
 * Usa archivos JSON locales en lugar de IndexedDB para mejor rendimiento
 */

export interface CachedGeminiAnalysis {
    songName: string;
    fileSize: number;
    duration: number;
    analysis: any;
    timestamp: number;
}

interface CacheIndex {
    [key: string]: CachedGeminiAnalysis;
}

class GeminiCache {
    private cacheKey = 'auraloop_gemini_cache';
    private cache: CacheIndex = {};
    private initialized = false;

    async init(): Promise<void> {
        if (this.initialized) return;

        try {
            const stored = localStorage.getItem(this.cacheKey);
            if (stored) {
                this.cache = JSON.parse(stored);
                console.log(`💾 Cache cargado: ${Object.keys(this.cache).length} análisis`);
            }
            this.initialized = true;
        } catch (error) {
            console.warn('⚠️ Error cargando cache, iniciando limpio');
            this.cache = {};
            this.initialized = true;
        }
    }

    private generateKey(songName: string, fileSize: number, duration: number): string {
        // Normalizar nombre (sin extensión, lowercase)
        const normalized = songName.toLowerCase().replace(/\.(mp3|wav|flac|m4a|ogg)$/i, '');
        return `${normalized}_${fileSize}_${Math.floor(duration)}`;
    }

    async get(songName: string, fileSize: number, duration: number): Promise<any | null> {
        if (!this.initialized) await this.init();

        const key = this.generateKey(songName, fileSize, duration);
        const cached = this.cache[key];

        if (cached) {
            console.log(`✅ Cache hit: ${songName}`);
            return cached.analysis;
        }

        return null;
    }

    async set(songName: string, fileSize: number, duration: number, analysis: any): Promise<void> {
        if (!this.initialized) await this.init();

        const key = this.generateKey(songName, fileSize, duration);
        this.cache[key] = {
            songName,
            fileSize,
            duration,
            analysis,
            timestamp: Date.now()
        };

        // Guardar en localStorage
        try {
            localStorage.setItem(this.cacheKey, JSON.stringify(this.cache));
            console.log(`💾 Cached: ${songName}`);
        } catch (error) {
            console.warn('⚠️ Error guardando cache (localStorage lleno?)');
            // Si está lleno, limpiar entradas antiguas
            await this.cleanOldEntries(10);
            try {
                localStorage.setItem(this.cacheKey, JSON.stringify(this.cache));
            } catch {
                console.error('❌ No se pudo guardar en cache');
            }
        }
    }

    async clear(): Promise<void> {
        this.cache = {};
        localStorage.removeItem(this.cacheKey);
        console.log('🗑️ Cache limpiado');
    }

    private async cleanOldEntries(keepCount: number): Promise<void> {
        const entries = Object.entries(this.cache);
        entries.sort((a, b) => b[1].timestamp - a[1].timestamp);
        
        const toKeep = entries.slice(0, keepCount);
        this.cache = Object.fromEntries(toKeep);
        
        console.log(`🧹 Cache reducido a ${keepCount} entradas más recientes`);
    }

    async getStats(): Promise<{ count: number; oldestTimestamp: number; totalSize: string }> {
        if (!this.initialized) await this.init();

        const entries = Object.values(this.cache);
        const count = entries.length;
        const oldestTimestamp = entries.length > 0 
            ? Math.min(...entries.map(e => e.timestamp))
            : Date.now();

        // Calcular tamaño aproximado
        const sizeBytes = new Blob([JSON.stringify(this.cache)]).size;
        const totalSize = `${(sizeBytes / 1024).toFixed(2)} KB`;

        return { count, oldestTimestamp, totalSize };
    }
}

export const geminiCache = new GeminiCache();
