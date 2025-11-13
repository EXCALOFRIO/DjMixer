// ============================================================================
// ENDPOINT DE ANÁLISIS MASIVO CON PROCESAMIENTO POR LOTES
// ============================================================================
// Procesa hasta 10 canciones simultáneamente respetando límites de Gemini
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { sql } from '@/lib/db';
import * as musicMetadata from 'music-metadata';
import { analizarAudiosEnLote } from '@/lib/audio-analyzer-unified';

const ai = new GoogleGenAI({
  apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY,
});

// Calcular hash SHA-256
async function calcularHashArchivo(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

interface ArchivoConMetadata {
  id: string;
  nombre: string;
  buffer: Buffer;
  arrayBuffer: ArrayBuffer;
  hash: string;
  metadata: any;
  duracionMs: number;
  titulo: string;
  artista: string;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];
    
    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: 'No se proporcionaron archivos' },
        { status: 400 }
      );
    }

    console.log(`\n📦 Recibidos ${files.length} archivos para análisis masivo`);

    // ========================================================================
    // FASE 1: Preparar archivos y verificar caché
    // ========================================================================
    
    const archivosPreparados: ArchivoConMetadata[] = [];
    const resultadosCache: any[] = [];

    for (const file of files) {
      const arrayBuffer = await file.arrayBuffer();
      const hash = await calcularHashArchivo(arrayBuffer);

      // Verificar caché
      const existente = await sql`
        SELECT * FROM canciones_analizadas WHERE hash_archivo = ${hash}
      `;

      if (existente.length > 0) {
        console.log(`✅ ${file.name}: Recuperado de caché`);
        resultadosCache.push(existente[0]);
        continue;
      }

      // Extraer metadatos
      const buffer = Buffer.from(arrayBuffer);
      const metadata = await musicMetadata.parseBuffer(buffer);
      const { common, format } = metadata;

      const duracionMs = Math.round((format.duration || 180) * 1000);
      const titulo = common.title || file.name.replace(/\.[^/.]+$/, '');
      const artista = common.artist || 'Artista Desconocido';

      archivosPreparados.push({
        id: file.name,
        nombre: file.name,
        buffer,
        arrayBuffer,
        hash,
        metadata,
        duracionMs,
        titulo,
        artista
      });
    }

    console.log(`📊 Archivos a analizar: ${archivosPreparados.length}`);
    console.log(`💾 Archivos en caché: ${resultadosCache.length}`);

    // ========================================================================
    // FASE 2: Análisis técnico por lotes (10 en paralelo)
    // ========================================================================
    
    const archivosParaAnalizar = archivosPreparados.map(archivo => ({
      id: archivo.id,
      buffer: archivo.buffer
    }));

    const resultadosAnalisis = await analizarAudiosEnLote(
      archivosParaAnalizar,
      (completados, total, resultado) => {
        const porcentaje = ((completados / total) * 100).toFixed(1);
        console.log(`\n🎵 Progreso del análisis técnico: ${completados}/${total} (${porcentaje}%)`);
        console.log(`   ✅ ${resultado.id}:`);
        console.log(`      - BPM: ${resultado.analisis.bpm}`);
        console.log(`      - Tonalidad: ${resultado.analisis.tonalidad_camelot}`);
        console.log(`      - Downbeats: ${resultado.analisis.downbeats_ts_ms.length}`);
        console.log(`      - Beats: ${resultado.analisis.beats_ts_ms.length}`);
      }
    );

    // ========================================================================
    // FASE 3: Análisis con Gemini (también por lotes de 10)
    // ========================================================================
    
    console.log('\n📤 Iniciando análisis con Gemini (10 en paralelo)...');
    
    const resultadosFinales: any[] = [...resultadosCache];
    const BATCH_SIZE = 10;

    for (let i = 0; i < archivosPreparados.length; i += BATCH_SIZE) {
      const lote = archivosPreparados.slice(i, i + BATCH_SIZE);
      const numeroLote = Math.floor(i / BATCH_SIZE) + 1;
      const totalLotes = Math.ceil(archivosPreparados.length / BATCH_SIZE);
      
      console.log(`\n🤖 Procesando lote Gemini ${numeroLote}/${totalLotes} (${lote.length} archivos)...`);

      // Procesar lote en paralelo
      const promesasGemini = lote.map(async (archivo) => {
        try {
          // Buscar análisis técnico
          const analisisTecnico = resultadosAnalisis.find(r => r.id === archivo.id);
          
          if (analisisTecnico?.error) {
            throw new Error(`Error en análisis técnico: ${analisisTecnico.error}`);
          }

          // Subir a Gemini
          console.log(`📤 ${archivo.nombre}: Subiendo a Gemini...`);
          const myfile = await ai.files.upload({
            file: new Blob([archivo.arrayBuffer], { type: 'audio/mpeg' }),
            config: { 
              mimeType: 'audio/mp3',
              displayName: archivo.nombre 
            },
          });

          // Esperar procesamiento
          await new Promise(resolve => setTimeout(resolve, 3000));

          // Análisis con Gemini (aquí iría tu schema y prompt)
          console.log(`🤖 ${archivo.nombre}: Analizando con Gemini...`);
          
          // ... tu código de análisis de Gemini aquí ...
          // const analisisGemini = await ai.models.generate(...);

          if (!analisisTecnico?.analisis) {
            throw new Error('No se pudo obtener análisis técnico');
          }

          // Guardar en BD
          const resultado = {
            hash_archivo: archivo.hash,
            titulo: archivo.titulo,
            artista: archivo.artista,
            ...analisisTecnico.analisis,
            // ...analisisGemini,
            fecha_analisis: new Date().toISOString()
          };

          await sql`
            INSERT INTO canciones_analizadas ${sql([resultado])}
          `;

          console.log(`✅ ${archivo.nombre}: Análisis completo y guardado`);
          return resultado;

        } catch (error) {
          console.error(`❌ ${archivo.nombre}: Error en análisis Gemini:`, error);
          return {
            error: true,
            nombre: archivo.nombre,
            mensaje: error instanceof Error ? error.message : 'Error desconocido'
          };
        }
      });

      const resultadosLote = await Promise.all(promesasGemini);
      resultadosFinales.push(...resultadosLote);

      console.log(`✅ Lote Gemini ${numeroLote}/${totalLotes} completado`);
      
      // Delay entre lotes para respetar límite de Gemini
      if (i + BATCH_SIZE < archivosPreparados.length) {
        console.log('⏳ Esperando 6 segundos antes del siguiente lote Gemini...');
        await new Promise(resolve => setTimeout(resolve, 6000));
      }
    }

    // ========================================================================
    // FASE 4: Resumen y respuesta
    // ========================================================================
    
    const exitosos = resultadosFinales.filter(r => !r.error).length;
    const fallidos = resultadosFinales.filter(r => r.error).length;
    const cache = resultadosCache.length;

    console.log('\n✅ Análisis masivo completado:');
    console.log(`   - Total: ${files.length} archivos`);
    console.log(`   - Caché: ${cache}`);
    console.log(`   - Analizados: ${archivosPreparados.length}`);
    console.log(`   - Exitosos: ${exitosos}`);
    console.log(`   - Fallidos: ${fallidos}`);

    return NextResponse.json({
      success: true,
      resumen: {
        total: files.length,
        cache,
        analizados: archivosPreparados.length,
        exitosos,
        fallidos
      },
      resultados: resultadosFinales
    });

  } catch (error) {
    console.error('❌ Error en análisis masivo:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Error desconocido',
        stack: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}
