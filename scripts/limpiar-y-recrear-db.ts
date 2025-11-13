import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

async function limpiarYRecrearTabla() {
  try {
    const sql = neon(process.env.DATABASE_URL!);
    
    console.log('🗑️  LIMPIANDO BASE DE DATOS...\n');
    
    // Paso 1: Eliminar tabla antigua completamente
    console.log('1️⃣  Eliminando tabla antigua y todos sus índices...');
    await sql`DROP TABLE IF EXISTS canciones_analizadas CASCADE`;
    await sql`DROP TABLE IF EXISTS canciones_analizadas_new CASCADE`;
    console.log('   ✅ Tabla eliminada\n');
    
    // Paso 2: Crear tabla nueva con estructura correcta
    console.log('2️⃣  Creando tabla nueva con 41 campos avanzados...');
    
    await sql`
      CREATE TABLE canciones_analizadas (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        hash_archivo VARCHAR(256) UNIQUE NOT NULL,
        titulo TEXT NOT NULL,
        artista TEXT NOT NULL,
        duracion_ms INTEGER NOT NULL,
        
        -- MÉTRICAS BÁSICAS
        bpm FLOAT,
        tonalidad_camelot VARCHAR(3),
        tonalidad_compatible JSONB,
        energia FLOAT CHECK (energia >= 0 AND energia <= 1),
        bailabilidad FLOAT CHECK (bailabilidad >= 0 AND bailabilidad <= 1),
        animo_general VARCHAR(50),
        compas JSONB,
        
        -- TIMING Y ESTRUCTURA DEL ANÁLISIS
        beats_ts_ms JSONB,
        downbeats_ts_ms JSONB,
        frases_ts_ms JSONB,
        
        -- ANÁLISIS AVANZADO DE RITMO (Essentia)
        ritmo_onset_rate FLOAT,
        ritmo_beats_loudness JSONB,
        ritmo_danceability FLOAT,
        ritmo_dynamic_complexity FLOAT,
        ritmo_bpm_histogram JSONB,
        
        -- ANÁLISIS TONAL AVANZADO (Essentia)
        tonal_key VARCHAR(20),
        tonal_scale VARCHAR(20),
        tonal_key_strength FLOAT,
        tonal_chords JSONB,
        tonal_tuning_frequency FLOAT,
        tonal_harmonic_complexity FLOAT,
        tonal_dissonance FLOAT,
        
        -- ANÁLISIS ESPECTRAL (Essentia)
        espectral_centroid FLOAT,
        espectral_rolloff FLOAT,
        espectral_flux FLOAT,
        espectral_complexity FLOAT,
        espectral_contrast JSONB,
        espectral_zero_crossing_rate FLOAT,
        
        -- ANÁLISIS DE TIMBRE (Essentia)
        timbre_mfcc JSONB,
        timbre_brightness FLOAT,
        timbre_roughness FLOAT,
        timbre_warmth FLOAT,
        timbre_sharpness FLOAT,
        
        -- ANÁLISIS DE LOUDNESS (Essentia)
        loudness_integrated FLOAT,
        loudness_momentary JSONB,
        loudness_short_term JSONB,
        loudness_dynamic_range FLOAT,
        loudness_range FLOAT,
        
        -- CLASIFICACIÓN Y MOOD (Essentia)
        mood_acoustic FLOAT,
        mood_electronic FLOAT,
        mood_aggressive FLOAT,
        mood_relaxed FLOAT,
        mood_happy FLOAT,
        mood_sad FLOAT,
        mood_party FLOAT,
        mood_voice_instrumental FLOAT,
        
        -- ESTRUCTURA DE LA CANCIÓN (Essentia)
        estructura_segmentos JSONB,
        estructura_intro_ms INTEGER,
        estructura_outro_ms INTEGER,
        estructura_fade_in_ms INTEGER,
        estructura_fade_out_ms INTEGER,
        
        -- DATOS DE GEMINI (letras, estructura, contenido)
        letras_ts JSONB,
        estructura_ts JSONB,
        analisis_contenido JSONB,
        
        -- METADATOS
        fecha_procesado TIMESTAMPTZ DEFAULT NOW(),
        
        -- CONSTRAINTS DE VALIDACIÓN
        CONSTRAINT valid_bpm CHECK (bpm IS NULL OR (bpm > 0 AND bpm < 300)),
        CONSTRAINT valid_duration CHECK (duracion_ms > 0)
      )
    `;
    
    console.log('   ✅ Tabla creada\n');
    
    // Paso 3: Crear índices
    console.log('3️⃣  Creando índices para optimizar consultas...');
    
    await sql`CREATE INDEX idx_hash_archivo ON canciones_analizadas(hash_archivo)`;
    await sql`CREATE INDEX idx_artista ON canciones_analizadas(artista)`;
    await sql`CREATE INDEX idx_bpm ON canciones_analizadas(bpm)`;
    await sql`CREATE INDEX idx_tonalidad ON canciones_analizadas(tonalidad_camelot)`;
    await sql`CREATE INDEX idx_energia ON canciones_analizadas(energia)`;
    await sql`CREATE INDEX idx_bailabilidad ON canciones_analizadas(bailabilidad)`;
    await sql`CREATE INDEX idx_fecha_procesado ON canciones_analizadas(fecha_procesado)`;
    
    console.log('   ✅ Índices creados\n');
    
    // Verificar resultado
    console.log('4️⃣  Verificando estructura final...');
    const columns = await sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'canciones_analizadas' 
      ORDER BY ordinal_position
    `;
    
    console.log(`   ✅ Total de columnas: ${columns.length}\n`);
    
    // Contar por categoría
    const ritmo = columns.filter((c: any) => c.column_name.startsWith('ritmo_')).length;
    const tonal = columns.filter((c: any) => c.column_name.startsWith('tonal_')).length;
    const espectral = columns.filter((c: any) => c.column_name.startsWith('espectral_')).length;
    const timbre = columns.filter((c: any) => c.column_name.startsWith('timbre_')).length;
    const loudness = columns.filter((c: any) => c.column_name.startsWith('loudness_')).length;
    const mood = columns.filter((c: any) => c.column_name.startsWith('mood_')).length;
    const estructura = columns.filter((c: any) => c.column_name.startsWith('estructura_')).length;
    
    console.log('📊 RESUMEN DE COLUMNAS:\n');
    console.log('   🔹 Básicas y métricas: 13');
    console.log('   🔹 Timing: 3');
    console.log(`   🥁 Ritmo avanzado: ${ritmo} (esperado: 5)`);
    console.log(`   🎹 Tonal avanzado: ${tonal} (esperado: 7)`);
    console.log(`   🌈 Espectral: ${espectral} (esperado: 6)`);
    console.log(`   🎨 Timbre: ${timbre} (esperado: 5)`);
    console.log(`   🔊 Loudness: ${loudness} (esperado: 5)`);
    console.log(`   😊 Mood: ${mood} (esperado: 8)`);
    console.log(`   🎭 Estructura: ${estructura} (esperado: 5)`);
    console.log('   📝 Gemini: 3');
    console.log('   📅 Metadatos: 1\n');
    
    console.log('✨ ¡BASE DE DATOS LIMPIA Y RECREADA EXITOSAMENTE!\n');
    console.log('🗑️  ELIMINADO:');
    console.log('   ❌ presencia_vocal_ts');
    console.log('   ❌ mix_in_point, mix_out_point');
    console.log('   ❌ cue_points');
    console.log('   ❌ analisis_espectral\n');
    
    console.log('✅ AGREGADO:');
    console.log(`   ✨ ${ritmo + tonal + espectral + timbre + loudness + mood + estructura} campos de análisis avanzado\n`);
    
    console.log('⚠️  NOTA: Todos los datos anteriores fueron eliminados');
    console.log('   Las canciones deberán ser analizadas de nuevo\n');
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

limpiarYRecrearTabla();
