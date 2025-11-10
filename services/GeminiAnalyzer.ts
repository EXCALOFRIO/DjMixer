/**
 * Gemini Analyzer - Análisis semántico con IA
 * 
 * Usa Gemini 2.5 Flash para extraer:
 * - Transcripción con timestamps
 * - Estructura musical (intro, verso, estribillo, outro)
 * - Temas y emociones
 * - Puntos óptimos para transiciones de DJ
 * 
 * Optimizaciones:
 * - Cache local con localStorage (evita análisis repetidos)
 * - Análisis por lotes (hasta 10 canciones por petición)
 */

import { GoogleGenAI } from '@google/genai';
import { geminiCache } from './GeminiCache';
import { databaseService } from './DatabaseService';

export interface LyricSegment {
    text: string;
    startTime: number; // segundos
    endTime: number;   // segundos
    type: 'intro' | 'verse' | 'pre-chorus' | 'chorus' | 'bridge' | 'outro' | 'instrumental';
}

export interface MusicStructure {
    sections: LyricSegment[];
    themes: string[]; // Palabras clave temáticas
    mood: {
        energy: 'low' | 'medium' | 'high';
        emotion: 'happy' | 'sad' | 'angry' | 'calm' | 'excited' | 'romantic';
    };
    transitionPoints: {
        time: number;
        reason: string; // Por qué es un buen punto de transición
        quality: 'excellent' | 'good' | 'fair';
    }[];
    // Nuevos campos de análisis avanzado
    vocals?: {
        gender: 'male' | 'female' | 'mixed' | 'none';
        style: 'rap' | 'singing' | 'spoken' | 'mixed';
        intensity: 'soft' | 'medium' | 'powerful';
        language: string;
    };
    instrumentation?: {
        dominantInstruments: string[];
        hasLiveInstruments: boolean;
        isElectronic: boolean;
    };
    dynamics?: {
        hasDrops: boolean;
        hasBuildups: boolean;
        energyCurve: 'ascending' | 'descending' | 'stable' | 'varied';
    };
    subgenre?: {
        primary: string;
        secondary: string[];
    };
}

export interface GeminiAnalysisResult {
    transcription: string;
    structure: MusicStructure;
    rawResponse: any;
}

export class GeminiAnalyzer {
    private client: GoogleGenAI;
    private isInitialized = false;
    private requestQueue: Array<{ file: File; duration: number; resolve: Function; reject: Function }> = [];
    private isProcessingBatch = false;
    private readonly BATCH_SIZE = 10; // Analizar hasta 10 canciones por petición
    private readonly BATCH_DELAY = 2000; // Esperar 2s antes de procesar lote

    constructor() {
        const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY;
        
        if (!apiKey || apiKey.trim() === '') {
            console.warn('⚠️ VITE_GEMINI_API_KEY no encontrada o vacía');
            console.warn('   Verifica tu archivo .env');
            throw new Error('Gemini API key no configurada');
        }

        // Verificar formato básico de la API key
        if (!apiKey.startsWith('AIza')) {
            console.warn('⚠️ API key no parece válida (debe empezar con "AIza")');
        }

        try {
            this.client = new GoogleGenAI({ apiKey });
            this.isInitialized = true;
            console.log('✅ Gemini inicializado (modo batch)');
        } catch (error: any) {
            console.error('❌ Error inicializando Gemini:', error);
            throw new Error(`Error al inicializar Gemini: ${error.message}`);
        }
    }

    /**
     * Analizar canción (con cola de lotes automática)
     */
    async analyzeSong(audioFile: File, duration: number = 0): Promise<GeminiAnalysisResult> {
        // 1. Verificar cache local primero (más rápido)
        const localCached = await geminiCache.get(audioFile.name, audioFile.size, duration);
        if (localCached) {
            return localCached;
        }

        // 2. Verificar base de datos (persistente)
        const dbCached = await databaseService.get(audioFile.name, audioFile.size, duration);
        if (dbCached) {
            // Guardar en cache local para próxima vez
            await geminiCache.set(audioFile.name, audioFile.size, duration, dbCached);
            return dbCached;
        }

        // 3. Agregar a la cola de lotes para análisis nuevo
        return new Promise((resolve, reject) => {
            this.requestQueue.push({ file: audioFile, duration, resolve, reject });
            this.scheduleBatchProcessing();
        });
    }

    /**
     * Verificar múltiples canciones de una vez (OPTIMIZADO)
     * Retorna solo las que necesitan análisis
     */
    async checkBatch(files: Array<{ file: File; duration: number }>): Promise<{
        cached: Map<string, GeminiAnalysisResult>;
        needAnalysis: Array<{ file: File; duration: number }>;
    }> {
        const cached = new Map<string, GeminiAnalysisResult>();
        const needAnalysis: Array<{ file: File; duration: number }> = [];

        // 1. Verificar cache local (instantáneo)
        console.log(`🔍 Verificando ${files.length} canciones en cache local...`);
        for (const item of files) {
            const localCached = await geminiCache.get(item.file.name, item.file.size, item.duration);
            if (localCached) {
                cached.set(item.file.name, localCached);
            }
        }

        const localHits = cached.size;
        console.log(`✅ Cache local: ${localHits} encontradas`);

        // 2. Verificar DB para las que no están en cache local (una sola query)
        const notInLocal = files.filter(f => !cached.has(f.file.name));
        
        if (notInLocal.length > 0) {
            const dbResults = await databaseService.getBatch(
                notInLocal.map(f => ({
                    name: f.file.name,
                    size: f.file.size,
                    duration: f.duration
                }))
            );

            // Guardar hits de DB en cache local
            for (const [key, analysis] of dbResults) {
                const file = notInLocal.find(f => 
                    databaseService['generateKey'](f.file.name, f.file.size, f.duration) === key
                );
                if (file) {
                    cached.set(file.file.name, analysis);
                    // Guardar en cache local para próxima vez
                    await geminiCache.set(file.file.name, file.file.size, file.duration, analysis);
                }
            }
        }

        // 3. Identificar las que necesitan análisis
        for (const item of files) {
            if (!cached.has(item.file.name)) {
                needAnalysis.push(item);
            }
        }

        const totalHits = cached.size;
        console.log(`📊 Total: ${totalHits} en cache, ${needAnalysis.length} necesitan análisis`);

        return { cached, needAnalysis };
    }

    /**
     * Programar procesamiento por lotes
     */
    private scheduleBatchProcessing() {
        if (this.isProcessingBatch) return;

        // Si la cola está llena, procesar inmediatamente
        if (this.requestQueue.length >= this.BATCH_SIZE) {
            this.processBatch();
            return;
        }

        // Si no, esperar un poco por si llegan más
        setTimeout(() => {
            if (this.requestQueue.length > 0 && !this.isProcessingBatch) {
                this.processBatch();
            }
        }, this.BATCH_DELAY);
    }

    /**
     * Procesar lote de canciones
     */
    private async processBatch() {
        if (this.requestQueue.length === 0 || this.isProcessingBatch) return;

        this.isProcessingBatch = true;
        const batch = this.requestQueue.splice(0, this.BATCH_SIZE);

        console.log(`\n🎵 Procesando lote de ${batch.length} canciones con Gemini`);

        try {
            const results = await this.analyzeBatch(batch.map(b => ({ file: b.file, duration: b.duration })));

            // Resolver promesas
            batch.forEach((item, index) => {
                const result = results[index];
                if (result.success) {
                    item.resolve(result.data);
                } else {
                    item.reject(new Error(result.error || 'Error desconocido'));
                }
            });

        } catch (error: any) {
            console.error('❌ Error procesando lote:', error);
            batch.forEach(item => item.reject(error));
        } finally {
            this.isProcessingBatch = false;

            // Si quedan más en la cola, programar siguiente lote
            if (this.requestQueue.length > 0) {
                setTimeout(() => this.scheduleBatchProcessing(), 1000);
            }
        }
    }

    /**
     * Analizar múltiples canciones en una sola petición
     */
    private async analyzeBatch(audioFiles: Array<{ file: File; duration: number }>): Promise<Array<{ success: boolean; data?: any; error?: string }>> {
        const results: Array<{ success: boolean; data?: any; error?: string }> = [];

        // 🔍 VERIFICAR CACHÉ ANTES DE SUBIR (por si acaso)
        console.log(`🔍 Verificando caché para ${audioFiles.length} archivos...`);
        const filesToAnalyze: Array<{ file: File; duration: number; originalIndex: number }> = [];
        
        for (let i = 0; i < audioFiles.length; i++) {
            const item = audioFiles[i];
            
            // Verificar cache local
            let cached = await geminiCache.get(item.file.name, item.file.size, item.duration);
            
            // Si no está en local, verificar DB
            if (!cached) {
                cached = await databaseService.get(item.file.name, item.file.size, item.duration);
                if (cached) {
                    // Guardar en cache local
                    await geminiCache.set(item.file.name, item.file.size, item.duration, cached);
                }
            }
            
            if (cached) {
                console.log(`   ✅ ${item.file.name}: encontrado en caché`);
                results[i] = { success: true, data: cached };
            } else {
                const key = databaseService['generateKey'](item.file.name, item.file.size, item.duration);
                console.log(`   ⚠️  ${item.file.name}: necesita análisis (key: ${key})`);
                filesToAnalyze.push({ ...item, originalIndex: i });
            }
        }
        
        // Si todos están en caché, retornar inmediatamente
        if (filesToAnalyze.length === 0) {
            console.log(`✅ Todos los archivos estaban en caché`);
            return results;
        }
        
        console.log(`📤 Subiendo ${filesToAnalyze.length} archivos nuevos...`);

        // Subir solo los archivos que necesitan análisis
        const uploadedFiles: Array<{ file: File; uploaded: any; duration: number; originalIndex: number } | null> = [];
        for (const item of filesToAnalyze) {
            try {
                // Verificar tamaño
                const maxSize = 20 * 1024 * 1024;
                if (item.file.size > maxSize) {
                    uploadedFiles.push(null);
                    results[item.originalIndex] = { 
                        success: false, 
                        error: `Archivo muy grande (${(item.file.size / 1024 / 1024).toFixed(2)} MB > 20 MB)` 
                    };
                    continue;
                }

                const uploaded = await this.client.files.upload({
                    file: item.file,
                    config: { mimeType: item.file.type || 'audio/mpeg' }
                });

                uploadedFiles.push({ file: item.file, uploaded, duration: item.duration, originalIndex: item.originalIndex });
            } catch (error: any) {
                uploadedFiles.push(null);
                results[item.originalIndex] = { success: false, error: error.message };
            }
        }

        console.log(`✅ ${uploadedFiles.filter(f => f !== null).length}/${filesToAnalyze.length} archivos subidos`);

        // Esperar procesamiento de todos
        console.log('⏳ Esperando procesamiento...');
        for (let i = 0; i < uploadedFiles.length; i++) {
            const item = uploadedFiles[i];
            if (!item) continue;

            try {
                await this.waitForFileProcessing(item.uploaded.name);
            } catch (error: any) {
                results[i] = { success: false, error: error.message };
                uploadedFiles[i] = null;
            }
        }

        // Analizar todos en una sola petición
        console.log('🧠 Analizando lote...');
        const validFiles = uploadedFiles.filter(f => f !== null) as Array<{ file: File; uploaded: any; duration: number; originalIndex: number }>;

        if (validFiles.length === 0) {
            return results;
        }

        try {
            const batchAnalysis = await this.analyzeBatchWithStructuredOutput(validFiles);

            // Mapear resultados usando los índices originales
            const toSaveInDB: Array<{ name: string; size: number; duration: number; analysis: any }> = [];
            
            for (let i = 0; i < validFiles.length; i++) {
                const fileInfo = validFiles[i];
                const analysis = batchAnalysis[i];
                const originalIndex = fileInfo.originalIndex;
                
                results[originalIndex] = { success: true, data: analysis };

                // Guardar en cache local
                await geminiCache.set(fileInfo.file.name, fileInfo.file.size, fileInfo.duration, analysis);
                
                // Preparar para guardar en DB (batch)
                toSaveInDB.push({
                    name: fileInfo.file.name,
                    size: fileInfo.file.size,
                    duration: fileInfo.duration,
                    analysis
                });
            }

            // Guardar todos en DB de una vez (más eficiente)
            if (toSaveInDB.length > 0) {
                await databaseService.setBatch(toSaveInDB);
            }

            console.log(`✅ Lote completado: ${validFiles.length} análisis`);

        } catch (error: any) {
            console.error('⚠️ Error en Gemini (usando caché si está disponible):', error.message);
            // Marcar todos los pendientes como error
            for (const fileInfo of validFiles) {
                if (!results[fileInfo.originalIndex] || results[fileInfo.originalIndex].success === undefined) {
                    results[fileInfo.originalIndex] = { success: false, error: error.message };
                }
            }
        }

        return results;
    }

    /**
     * Analizar lote con structured output
     */
    private async analyzeBatchWithStructuredOutput(
        files: Array<{ file: File; uploaded: any; duration?: number }>
    ): Promise<GeminiAnalysisResult[]> {
        // Schema para lote (array de análisis)
        const batchSchema = {
            type: 'object',
            properties: {
                songs: {
                    type: 'array',
                    description: 'Análisis de cada canción',
                    items: {
                        type: 'object',
                        properties: {
                            songIndex: { type: 'number', description: 'Índice de la canción (0-based)' },
                            transcription: { type: 'string', description: 'Transcripción completa' },
                            structure: {
                                type: 'object',
                                properties: {
                                    sections: {
                                        type: 'array',
                                        items: {
                                            type: 'object',
                                            properties: {
                                                text: { type: 'string' },
                                                startTime: { type: 'number' },
                                                endTime: { type: 'number' },
                                                type: { 
                                                    type: 'string', 
                                                    enum: ['intro', 'verse', 'pre-chorus', 'chorus', 'bridge', 'outro', 'instrumental']
                                                }
                                            },
                                            required: ['text', 'startTime', 'endTime', 'type']
                                        }
                                    },
                                    themes: { type: 'array', items: { type: 'string' } },
                                    mood: {
                                        type: 'object',
                                        properties: {
                                            energy: { type: 'string', enum: ['low', 'medium', 'high'] },
                                            emotion: { type: 'string', enum: ['happy', 'sad', 'angry', 'calm', 'excited', 'romantic'] }
                                        },
                                        required: ['energy', 'emotion']
                                    },
                                    vocals: {
                                        type: 'object',
                                        properties: {
                                            gender: { type: 'string', enum: ['male', 'female', 'mixed', 'none'] },
                                            style: { type: 'string', enum: ['rap', 'singing', 'spoken', 'mixed'] },
                                            intensity: { type: 'string', enum: ['soft', 'medium', 'powerful'] },
                                            language: { type: 'string' }
                                        }
                                    },
                                    instrumentation: {
                                        type: 'object',
                                        properties: {
                                            dominantInstruments: { type: 'array', items: { type: 'string' } },
                                            hasLiveInstruments: { type: 'boolean' },
                                            isElectronic: { type: 'boolean' }
                                        }
                                    },
                                    dynamics: {
                                        type: 'object',
                                        properties: {
                                            hasDrops: { type: 'boolean' },
                                            hasBuildups: { type: 'boolean' },
                                            energyCurve: { type: 'string', enum: ['ascending', 'descending', 'stable', 'varied'] }
                                        }
                                    },
                                    subgenre: {
                                        type: 'object',
                                        properties: {
                                            primary: { type: 'string' },
                                            secondary: { type: 'array', items: { type: 'string' } }
                                        }
                                    },
                                    transitionPoints: {
                                        type: 'array',
                                        items: {
                                            type: 'object',
                                            properties: {
                                                time: { type: 'number' },
                                                reason: { type: 'string' },
                                                quality: { type: 'string', enum: ['excellent', 'good', 'fair'] }
                                            },
                                            required: ['time', 'reason', 'quality']
                                        }
                                    }
                                },
                                required: ['sections', 'themes', 'mood', 'transitionPoints']
                            }
                        },
                        required: ['songIndex', 'transcription', 'structure']
                    }
                }
            },
            required: ['songs']
        };

        const songList = files.map((f, i) => {
            const durationStr = f.duration ? ` (duración: ${Math.floor(f.duration / 60)}:${String(Math.floor(f.duration % 60)).padStart(2, '0')})` : '';
            return `${i}. ${f.file.name}${durationStr}`;
        }).join('\n');
        
        const prompt = `Eres un DJ experto y productor musical. Analiza estas ${files.length} canciones en detalle:

${songList}

⚠️ IMPORTANTE: Los timestamps deben estar dentro de la duración de cada canción. NO inventes timestamps que excedan la duración real.

Para CADA canción, proporciona un análisis COMPLETO:

1. TRANSCRIPCIÓN con timestamps (en segundos, dentro de la duración)

2. ESTRUCTURA: Secciones (intro, verso, estribillo, puente, outro, instrumental) con timestamps PRECISOS

3. TEMAS: 5-10 palabras clave que describan el contenido lírico

4. MOOD: 
   - Energía (low/medium/high)
   - Emoción (happy/sad/angry/calm/excited/romantic)

5. VOCALES:
   - Género (male/female/mixed/none)
   - Estilo (rap/singing/spoken/mixed)
   - Intensidad (soft/medium/powerful)
   - Idioma

6. INSTRUMENTACIÓN:
   - Instrumentos dominantes (ej: ["guitar", "drums", "synth"])
   - ¿Tiene instrumentos en vivo? (true/false)
   - ¿Es electrónica? (true/false)

7. DINÁMICA:
   - ¿Tiene drops/caídas? (true/false)
   - ¿Tiene build-ups? (true/false)
   - Curva de energía (ascending/descending/stable/varied)

8. SUBGÉNERO:
   - Subgénero principal (ej: "reggaeton", "indie rock", "deep house")
   - Subgéneros secundarios (array)

9. PUNTOS DE TRANSICIÓN: 3-5 mejores momentos para mezclar (timestamps dentro de la duración)

Responde con un array de análisis, uno por canción, en el mismo orden.`;

        try {
            // Construir contenido con todos los archivos
            const contents: any[] = [prompt];
            for (const item of files) {
                contents.push({
                    fileData: {
                        mimeType: item.uploaded.mimeType,
                        fileUri: item.uploaded.uri
                    }
                });
            }

            const response = await this.client.models.generateContent({
                model: 'gemini-2.5-flash',
                contents,
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: batchSchema
                }
            });

            if (!response || !response.text) {
                throw new Error('Respuesta vacía de Gemini');
            }

            const result = JSON.parse(response.text);
            
            if (!result.songs || !Array.isArray(result.songs)) {
                throw new Error('Respuesta incompleta de Gemini');
            }

            // Convertir a formato individual y validar timestamps
            return result.songs.map((song: any, index: number) => {
                const duration = files[index]?.duration || 0;
                
                // Validar y corregir timestamps
                const validatedStructure = this.validateAndFixTimestamps(song.structure, duration);
                
                return {
                    transcription: song.transcription,
                    structure: validatedStructure,
                    rawResponse: song
                };
            });

        } catch (error: any) {
            // Log silencioso, no bloquear
            console.warn('⚠️ Error en Gemini (usando caché si está disponible):', error.message);
            
            if (error.message?.includes('quota')) {
                throw new Error('Cuota de API excedida');
            }
            
            if (error.message?.includes('API key')) {
                throw new Error('API key inválida');
            }
            
            throw new Error(`Error: ${error.message}`);
        }
    }

    /**
     * Validar y corregir timestamps que excedan la duración de la canción
     */
    private validateAndFixTimestamps(structure: MusicStructure, duration: number): MusicStructure {
        if (!duration || duration <= 0) {
            console.warn('⚠️ Duración no disponible, no se pueden validar timestamps');
            return structure;
        }

        let hasInvalidTimestamps = false;

        // Validar y corregir secciones
        const validatedSections = structure.sections.map(section => {
            if (section.startTime > duration || section.endTime > duration) {
                hasInvalidTimestamps = true;
                console.warn(`⚠️ Timestamp inválido en sección ${section.type}: ${section.startTime}s-${section.endTime}s (duración: ${duration}s)`);
                
                return {
                    ...section,
                    startTime: Math.min(section.startTime, duration),
                    endTime: Math.min(section.endTime, duration)
                };
            }
            return section;
        }).filter(section => section.startTime < duration); // Eliminar secciones completamente fuera de rango

        // Validar y corregir puntos de transición
        const validatedTransitionPoints = structure.transitionPoints
            .map(point => {
                if (point.time > duration) {
                    hasInvalidTimestamps = true;
                    console.warn(`⚠️ Punto de transición inválido: ${point.time}s (duración: ${duration}s)`);
                    return {
                        ...point,
                        time: Math.min(point.time, duration * 0.95) // Mover al 95% de la duración
                    };
                }
                return point;
            })
            .filter(point => point.time < duration); // Eliminar puntos fuera de rango

        if (hasInvalidTimestamps) {
            console.warn(`⚠️ Se corrigieron timestamps inválidos (duración real: ${duration.toFixed(1)}s)`);
        }

        return {
            ...structure,
            sections: validatedSections,
            transitionPoints: validatedTransitionPoints
        };
    }

    private async waitForFileProcessing(fileName: string, maxAttempts = 30): Promise<void> {
        for (let i = 0; i < maxAttempts; i++) {
            try {
                const file = await this.client.files.get({ name: fileName });
                
                if (file.state === 'ACTIVE') {
                    console.log('   ✅ Archivo listo');
                    return;
                }
                
                if (file.state === 'FAILED') {
                    throw new Error(`Procesamiento falló: ${file.error?.message || 'Error desconocido'}`);
                }

                console.log(`   ⏳ Estado: ${file.state} (${i + 1}/${maxAttempts})`);
                await new Promise(resolve => setTimeout(resolve, 2000));
            } catch (error: any) {
                if (i === maxAttempts - 1) {
                    throw new Error(`Error verificando estado del archivo: ${error.message}`);
                }
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }

        throw new Error('Timeout esperando procesamiento del archivo');
    }

    async findThematicConnections(
        song1: GeminiAnalysisResult,
        song2: GeminiAnalysisResult
    ): Promise<{ sharedThemes: string[]; connectionStrength: number; suggestedTransition: string }> {
        const sharedThemes = song1.structure.themes.filter(theme =>
            song2.structure.themes.includes(theme)
        );

        const connectionStrength = sharedThemes.length / 
            Math.max(song1.structure.themes.length, song2.structure.themes.length);

        let suggestedTransition = 'Transición estándar';
        if (connectionStrength > 0.5) {
            suggestedTransition = `Fuerte: ${sharedThemes.join(', ')}`;
        } else if (connectionStrength > 0.3) {
            suggestedTransition = `Moderada: ${sharedThemes.join(', ')}`;
        }

        return { sharedThemes, connectionStrength, suggestedTransition };
    }

    isReady(): boolean {
        return this.isInitialized;
    }
}

export const geminiAnalyzer = new GeminiAnalyzer();
