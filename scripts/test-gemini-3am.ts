/**
 * Script de prueba: Analizar el track "3_Am" con logs detallados de Gemini
 * 
 * Uso:
 *   pnpm tsx scripts/test-gemini-3am.ts
 * 
 * Este script:
 * 1. Busca el track "3_Am" en la base de datos
 * 2. Re-analiza con Gemini mostrando logs detallados
 * 3. Muestra la respuesta cruda de Gemini
 * 4. Compara antes/después de la sanitización
 */

import { sql } from '@/lib/db';

async function testGemini3Am() {
  console.log('🔍 SCRIPT DE PRUEBA: Análisis Gemini para "3_Am"\n');

  try {
    // 1. Buscar el track en la base de datos
    console.log('📀 Buscando track "3_Am" en la base de datos...');
    const cancion = await sql`
      SELECT 
        hash_archivo,
        titulo,
        bpm,
        duracion_ms,
        segmentos_voz,
        perfil_energia_rms,
        letras_ts,
        estructura_ts,
        analisis_contenido
      FROM canciones_analizadas
      WHERE titulo = '3_Am'
      ORDER BY fecha_analisis DESC
      LIMIT 1
    `;

    if (cancion.length === 0) {
      console.error('❌ No se encontró el track "3_Am" en la base de datos');
      process.exit(1);
    }

    const track = cancion[0];
    console.log('✅ Track encontrado:');
    console.log('   - Hash:', track.hash_archivo);
    console.log('   - Título:', track.titulo);
    console.log('   - BPM:', track.bpm);
    console.log('   - Duración:', track.duracion_ms, 'ms');
    console.log('   - Segmentos VAD:', track.segmentos_voz.length);
    console.log('   - RMS points:', track.perfil_energia_rms?.length || 0);
    console.log('   - Letras actuales:', track.letras_ts?.length || 0, 'palabras');
    console.log('   - Estructura actual:', track.estructura_ts?.length || 0, 'secciones');
    console.log('   - Análisis contenido:', track.analisis_contenido ? '✅ Existe' : '❌ No existe');

    // 2. Recuperar análisis técnico completo
    console.log('\n📊 Recuperando análisis técnico completo...');
    const analisisCompleto = await sql`
      SELECT 
        bpm, bpm_rango, tonalidad_camelot, tonalidad_compatible,
        energia, bailabilidad, animo_general, compas, duracion_ms,
        downbeats_ts_ms, beats_ts_ms, frases_ts_ms, transientes_ritmicos_ts_ms,
        ritmo_avanzado, tonal_avanzado, loudness, estructura
      FROM canciones_analizadas
      WHERE hash_archivo = ${track.hash_archivo}
    `;

    if (analisisCompleto.length === 0) {
      console.error('❌ No se pudo recuperar el análisis técnico');
      process.exit(1);
    }

    const analisis = analisisCompleto[0];
    console.log('✅ Análisis técnico recuperado:');
    console.log('   - Beats:', analisis.beats_ts_ms?.length || 0);
    console.log('   - Downbeats:', analisis.downbeats_ts_ms?.length || 0);
    console.log('   - Frases:', analisis.frases_ts_ms?.length || 0);
    console.log('   - Transientes:', analisis.transientes_ritmicos_ts_ms?.length || 0);

    // 3. Preparar parámetros para Gemini
    console.log('\n🤖 Preparando análisis con Gemini...');
    
    const params = {
      analisisTecnico: {
        bpm: analisis.bpm,
        bpm_rango: analisis.bpm_rango,
        tonalidad_camelot: analisis.tonalidad_camelot,
        tonalidad_compatible: analisis.tonalidad_compatible,
        energia: analisis.energia,
        bailabilidad: analisis.bailabilidad,
        animo_general: analisis.animo_general,
        compas: analisis.compas,
        duracion_ms: analisis.duracion_ms,
        downbeats_ts_ms: analisis.downbeats_ts_ms,
        beats_ts_ms: analisis.beats_ts_ms,
        frases_ts_ms: analisis.frases_ts_ms,
        transientes_ritmicos_ts_ms: analisis.transientes_ritmicos_ts_ms,
        ritmo_avanzado: analisis.ritmo_avanzado,
        tonal_avanzado: analisis.tonal_avanzado,
        loudness: analisis.loudness,
        estructura: analisis.estructura,
      },
      segmentosVoz: track.segmentos_voz || [],
      perfilEnergiaRMS: track.perfil_energia_rms || [],
    };

    console.log('\n📋 RESUMEN PRE-GEMINI:');
    console.log('   - Segmentos VAD:', params.segmentosVoz.length);
    console.log('   - Perfil RMS:', params.perfilEnergiaRMS.length, 'puntos');
    console.log('   - Beats disponibles:', params.analisisTecnico.beats_ts_ms?.length || 0);
    console.log('   - Beats Loudness:', params.analisisTecnico.ritmo_avanzado?.beats_loudness?.length || 0);

    // 4. Verificar si es instrumental
    const esInstrumental = params.segmentosVoz.length === 0;
    if (esInstrumental) {
      console.log('\n⚠️  ADVERTENCIA: Este track se detectó como INSTRUMENTAL');
      console.log('    Gemini DEBE usar RMS + Beats Loudness para generar estructura');
    } else {
      console.log('\n✅ Track con voz detectada (' + params.segmentosVoz.length + ' segmentos)');
    }

    console.log('\n🚀 Ejecutando análisis Gemini con logs detallados...');
    console.log('━'.repeat(80));

    // Nota: No podemos ejecutar Gemini aquí porque necesita el archivo de audio
    // Este script solo muestra el estado actual y prepara los datos
    
    console.log('\n📌 SIGUIENTE PASO:');
    console.log('   1. Ejecuta este comando para re-analizar:');
    console.log('      curl -X POST http://localhost:9002/api/analyze-batch \\');
    console.log('        -F "file=@/ruta/a/3_Am.mp3"');
    console.log('');
    console.log('   2. Busca en los logs los siguientes mensajes:');
    console.log('      🔍 RESPUESTA CRUDA GEMINI:');
    console.log('         - Palabras recibidas: X');
    console.log('         - Estructura recibida: X');
    console.log('         - Eventos DJ recibidos: X');
    console.log('');
    console.log('   3. Si "Estructura recibida: 0", el problema está en el PROMPT de Gemini');
    console.log('   4. Si "Estructura recibida: >0", el problema está en la SANITIZACIÓN');

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testGemini3Am();
