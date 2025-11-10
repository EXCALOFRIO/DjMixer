/**
 * Database Service - PostgreSQL (Neon)
 * 
 * Almacena análisis de Gemini en la nube para:
 * - Compartir análisis entre sesiones
 * - Evitar repetir peticiones a Gemini
 * - Persistencia permanente
 */

import type { GeminiAnalysisResult } from './GeminiAnalyzer';
import { createNeonClient } from './neon.config';

interface SongAnalysisRecord {
    id: string;
    song_name: string;
    file_size: number;
    duration: number;
    analysis: any;
    created_at: Date;
    updated_at: Date;
}

import type { NeonQueryFunction } from '@neondatabase/serverless';

class DatabaseService {
    private sql: NeonQueryFunction<false, false> | null = null;
    private isInitialized = false;
    private isInitializing = false;

    async init(retries = 3, delay = 1000): Promise<void> {
        if (this.isInitialized || this.isInitializing) return;
        
        this.isInitializing = true;

        const databaseUrl = (import.meta as any).env?.VITE_DATABASE_URL;

        if (!databaseUrl || databaseUrl.trim() === '') {
            console.warn('⚠️ VITE_DATABASE_URL no configurada, usando solo cache local');
            this.isInitializing = false;
            return;
        }

        for (let i = 0; i < retries; i++) {
            try {
                this.sql = createNeonClient(databaseUrl);
                await this.createSchema();
                this.isInitialized = true;
                this.isInitializing = false;
                console.log('✅ Base de datos conectada');
                return;
            } catch (error: any) {
                console.error(`❌ Intento ${i + 1}/${retries} fallido para conectar a la DB:`, error);
                if (i < retries - 1) {
                    await new Promise(res => setTimeout(res, delay));
                } else {
                    console.error('❌ No se pudo conectar a la base de datos tras varios intentos.');
                    console.warn('⚠️ Continuando con cache local solamente');
                    this.isInitializing = false;
                }
            }
        }
    }

    private async createSchema(): Promise<void> {
        if (!this.sql) return;

        try {
            // Crear tabla si no existe
            await this.sql`
                CREATE TABLE IF NOT EXISTS song_analyses (
                    id TEXT PRIMARY KEY,
                    song_name TEXT NOT NULL,
                    file_size BIGINT NOT NULL,
                    duration REAL NOT NULL,
                    analysis JSONB NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `;

            // Crear índices para búsqueda rápida
            await this.sql`
                CREATE INDEX IF NOT EXISTS idx_song_name 
                ON song_analyses(song_name)
            `;

            await this.sql`
                CREATE INDEX IF NOT EXISTS idx_file_size 
                ON song_analyses(file_size)
            `;

            await this.sql`
                CREATE INDEX IF NOT EXISTS idx_created_at 
                ON song_analyses(created_at DESC)
            `;

            console.log('✅ Schema de base de datos creado');
        } catch (error: any) {
            console.error('❌ Error creando schema:', error);
            throw error;
        }
    }

    generateKey(songName: string, fileSize: number, duration: number): string {
        // Normalizar nombre (sin extensión, lowercase)
        const normalized = songName.toLowerCase().replace(/\.(mp3|wav|flac|m4a|ogg)$/i, '');
        return `${normalized}_${fileSize}_${Math.floor(duration)}`;
    }

    async get(songName: string, fileSize: number, duration: number): Promise<GeminiAnalysisResult | null> {
        if (!this.sql) {
            await this.init();
            if (!this.sql) return null;
        }

        try {
            // Normalizar nombre para búsqueda (sin extensión, lowercase)
            const normalizedName = songName.toLowerCase().replace(/\.(mp3|wav|flac|m4a|ogg)$/i, '');
            
            console.log(`🔍 DB lookup por nombre: ${songName} → normalized: ${normalizedName}`);
            
            // Buscar por song_name Y file_size (más preciso que solo nombre)
            const result = await this.sql`
                SELECT analysis 
                FROM song_analyses 
                WHERE LOWER(REPLACE(song_name, '.mp3', '')) = ${normalizedName}
                AND file_size = ${fileSize}
                ORDER BY created_at DESC
                LIMIT 1
            `;

            if (Array.isArray(result) && result.length > 0) {
                console.log(`✅ DB hit: ${songName}`);
                const row: any = result[0];
                return row.analysis as GeminiAnalysisResult;
            }

            console.log(`❌ DB miss: ${songName}`);
            return null;
        } catch (error: any) {
            console.error('❌ Error leyendo de DB:', error);
            return null;
        }
    }

    /**
     * Verificar múltiples canciones de una vez (OPTIMIZADO)
     * Retorna un Map con los análisis encontrados
     */
    async getBatch(songs: Array<{ name: string; size: number; duration: number }>): Promise<Map<string, GeminiAnalysisResult>> {
        if (!this.sql) {
            await this.init();
            if (!this.sql) return new Map();
        }

        if (songs.length === 0) return new Map();

        try {
            console.log(`🔍 Verificando ${songs.length} canciones en DB por nombre...`);

            // Crear pares de (nombre normalizado, file_size) para búsqueda
            const searchPairs = songs.map(s => ({
                normalizedName: s.name.toLowerCase().replace(/\.(mp3|wav|flac|m4a|ogg)$/i, ''),
                fileSize: s.size,
                originalName: s.name
            }));

            // Buscar todas las canciones por nombre y tamaño
            const normalizedNames = searchPairs.map(p => p.normalizedName);
            const fileSizes = searchPairs.map(p => p.fileSize);

            const result = await this.sql`
                SELECT song_name, file_size, analysis 
                FROM song_analyses 
                WHERE LOWER(REPLACE(song_name, '.mp3', '')) = ANY(${normalizedNames})
            `;

            // Crear Map de resultados usando nombre original como clave
            const resultsMap = new Map<string, GeminiAnalysisResult>();

            if (Array.isArray(result)) {
                result.forEach((row: any) => {
                    const normalizedRowName = row.song_name.toLowerCase().replace(/\.(mp3|wav|flac|m4a|ogg)$/i, '');
                    
                    // Encontrar el nombre original correspondiente
                    const match = searchPairs.find(p => 
                        p.normalizedName === normalizedRowName && 
                        p.fileSize === row.file_size
                    );
                    
                    if (match) {
                        const key = this.generateKey(match.originalName, match.fileSize, 0);
                        resultsMap.set(key, row.analysis as GeminiAnalysisResult);
                    }
                });
            }

            const hits = resultsMap.size;
            const misses = songs.length - hits;

            console.log(`✅ DB: ${hits} encontradas, ${misses} nuevas`);

            return resultsMap;
        } catch (error: any) {
            console.error('❌ Error en batch DB:', error);
            return new Map();
        }
    }

    /**
     * Guardar múltiples análisis de una vez (OPTIMIZADO)
     */
    async setBatch(analyses: Array<{
        name: string;
        size: number;
        duration: number;
        analysis: GeminiAnalysisResult;
    }>): Promise<void> {
        if (!this.sql) {
            await this.init();
            if (!this.sql) return;
        }

        if (analyses.length === 0) return;

        try {
            // Preparar datos para inserción masiva
            const values = analyses.map(a => ({
                id: this.generateKey(a.name, a.size, a.duration),
                song_name: a.name,
                file_size: a.size,
                duration: a.duration,
                analysis: JSON.stringify(a.analysis)
            }));

            // Inserción masiva con ON CONFLICT
            for (const value of values) {
                await this.sql`
                    INSERT INTO song_analyses (id, song_name, file_size, duration, analysis, updated_at)
                    VALUES (
                        ${value.id},
                        ${value.song_name},
                        ${value.file_size},
                        ${value.duration},
                        ${value.analysis},
                        CURRENT_TIMESTAMP
                    )
                    ON CONFLICT (id) 
                    DO UPDATE SET 
                        analysis = ${value.analysis},
                        updated_at = CURRENT_TIMESTAMP
                `;
            }

            console.log(`💾 DB: ${analyses.length} análisis guardados`);
        } catch (error: any) {
            console.error('❌ Error guardando batch en DB:', error);
        }
    }

    async set(
        songName: string,
        fileSize: number,
        duration: number,
        analysis: GeminiAnalysisResult
    ): Promise<void> {
        if (!this.sql) {
            await this.init();
            if (!this.sql) return;
        }

        try {
            const key = this.generateKey(songName, fileSize, duration);

            await this.sql`
                INSERT INTO song_analyses (id, song_name, file_size, duration, analysis, updated_at)
                VALUES (
                    ${key},
                    ${songName},
                    ${fileSize},
                    ${duration},
                    ${JSON.stringify(analysis)},
                    CURRENT_TIMESTAMP
                )
                ON CONFLICT (id) 
                DO UPDATE SET 
                    analysis = ${JSON.stringify(analysis)},
                    updated_at = CURRENT_TIMESTAMP
            `;

            console.log(`💾 DB saved: ${songName}`);
        } catch (error: any) {
            console.error('❌ Error guardando en DB:', error);
        }
    }

    async getStats(): Promise<{ count: number; oldestDate: Date | null; totalSize: string }> {
        if (!this.sql) {
            await this.init();
            if (!this.sql) return { count: 0, oldestDate: null, totalSize: '0 KB' };
        }

        try {
            const result = await this.sql`
                SELECT 
                    COUNT(*) as count,
                    MIN(created_at) as oldest_date,
                    pg_size_pretty(pg_total_relation_size('song_analyses')) as total_size
                FROM song_analyses
            `;

            return {
                count: parseInt(result[0].count),
                oldestDate: result[0].oldest_date,
                totalSize: result[0].total_size || '0 KB'
            };
        } catch (error: any) {
            console.error('❌ Error obteniendo stats:', error);
            return { count: 0, oldestDate: null, totalSize: '0 KB' };
        }
    }

    async clear(): Promise<void> {
        if (!this.sql) return;

        try {
            await this.sql`TRUNCATE TABLE song_analyses`;
            console.log('🗑️ Base de datos limpiada');
        } catch (error: any) {
            console.error('❌ Error limpiando DB:', error);
        }
    }

    isReady(): boolean {
        return this.isInitialized && this.sql !== null;
    }
}

export const databaseService = new DatabaseService();
