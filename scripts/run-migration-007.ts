import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

async function runMigration007() {
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL no está definida. Agrega la cadena de conexión en .env.local');
    process.exit(1);
  }

  try {
    const sql = neon(process.env.DATABASE_URL);
    console.log('🔄 Ejecutando migración 007: TODOS los campos avanzados de Essentia.js');

    // ===================================================================
    // 1. RITMO AVANZADO
    // ===================================================================
    console.log('  📊 Añadiendo campos de ritmo avanzado...');
    await sql`ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS onset_rate FLOAT DEFAULT 0`;
    await sql`ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS beats_loudness JSONB DEFAULT '[]'::jsonb`;
    await sql`ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS danceability FLOAT DEFAULT 0`;
    await sql`ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS dynamic_complexity FLOAT DEFAULT 0`;
    await sql`ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS bpm_histogram JSONB DEFAULT '[]'::jsonb`;
    await sql`ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS transientes_ritmicos_ts_ms JSONB DEFAULT '[]'::jsonb`;

    // ===================================================================
    // 2. TONAL AVANZADO
    // ===================================================================
    console.log('  🎵 Añadiendo campos de análisis tonal...');
    await sql`ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS key_detected VARCHAR(50) DEFAULT 'C major'`;
    await sql`ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS scale_detected VARCHAR(20) DEFAULT 'major'`;
    await sql`ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS key_strength FLOAT DEFAULT 0`;
    await sql`ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS chords JSONB DEFAULT '[]'::jsonb`;
    await sql`ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS tuning_frequency FLOAT DEFAULT 440`;
    await sql`ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS harmonic_complexity FLOAT DEFAULT 0`;
    await sql`ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS dissonance FLOAT DEFAULT 0`;

    // ===================================================================
    // 3. ESPECTRAL
    // ===================================================================
    console.log('  🌊 Añadiendo campos espectrales...');
    await sql`ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS spectral_centroid FLOAT DEFAULT 0`;
    await sql`ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS spectral_rolloff FLOAT DEFAULT 0`;
    await sql`ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS spectral_flux FLOAT DEFAULT 0`;
    await sql`ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS spectral_complexity FLOAT DEFAULT 0`;
    await sql`ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS spectral_contrast JSONB DEFAULT '[]'::jsonb`;
    await sql`ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS zero_crossing_rate FLOAT DEFAULT 0`;

    // ===================================================================
    // 4. TIMBRE
    // ===================================================================
    console.log('  🎨 Añadiendo campos de timbre...');
    await sql`ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS mfcc JSONB DEFAULT '[]'::jsonb`;
    await sql`ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS brightness FLOAT DEFAULT 0`;
    await sql`ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS roughness FLOAT DEFAULT 0`;
    await sql`ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS warmth FLOAT DEFAULT 0`;
    await sql`ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS sharpness FLOAT DEFAULT 0`;

    // ===================================================================
    // 5. LOUDNESS (LUFS)
    // ===================================================================
    console.log('  🔊 Añadiendo campos de loudness...');
    await sql`ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS integrated_loudness FLOAT DEFAULT -14`;
    await sql`ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS momentary_loudness JSONB DEFAULT '[]'::jsonb`;
    await sql`ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS short_term_loudness JSONB DEFAULT '[]'::jsonb`;
    await sql`ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS dynamic_range FLOAT DEFAULT 0`;
    await sql`ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS loudness_range FLOAT DEFAULT 0`;
    await sql`ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS replay_gain_db FLOAT DEFAULT 0`;

    // ===================================================================
    // 6. CLASIFICACIÓN DE MOOD
    // ===================================================================
    console.log('  😊 Añadiendo campos de clasificación de mood...');
    await sql`ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS mood_acoustic FLOAT DEFAULT 0.5`;
    await sql`ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS mood_electronic FLOAT DEFAULT 0.5`;
    await sql`ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS mood_aggressive FLOAT DEFAULT 0`;
    await sql`ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS mood_relaxed FLOAT DEFAULT 1`;
    await sql`ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS mood_happy FLOAT DEFAULT 0.5`;
    await sql`ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS mood_sad FLOAT DEFAULT 0.5`;
    await sql`ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS mood_party FLOAT DEFAULT 0`;
    await sql`ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS voice_instrumental_confidence FLOAT DEFAULT 0.5`;

    // ===================================================================
    // 7. ESTRUCTURA
    // ===================================================================
    console.log('  🏗️ Añadiendo campos de estructura...');
    await sql`ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS segmentos_estructura JSONB DEFAULT '[]'::jsonb`;
    await sql`ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS intro_duration_ms INTEGER DEFAULT 0`;
    await sql`ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS outro_duration_ms INTEGER DEFAULT 0`;
    await sql`ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS fade_in_duration_ms INTEGER DEFAULT 0`;
    await sql`ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS fade_out_duration_ms INTEGER DEFAULT 0`;

    // ===================================================================
    // 8. CAMPOS TÉCNICOS FALTANTES
    // ===================================================================
    console.log('  🔧 Añadiendo campos técnicos faltantes...');
    await sql`ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS bpm_rango_min FLOAT DEFAULT 0`;
    await sql`ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS bpm_rango_max FLOAT DEFAULT 0`;
    await sql`ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS perfil_energia_rms JSONB DEFAULT '[]'::jsonb`;

    // ===================================================================
    // 9. CREAR ÍNDICES
    // ===================================================================
    console.log('  🔍 Creando índices para búsquedas rápidas...');
    await sql`CREATE INDEX IF NOT EXISTS idx_danceability ON canciones_analizadas(danceability)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_integrated_loudness ON canciones_analizadas(integrated_loudness)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_key_detected ON canciones_analizadas(key_detected)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_key_strength ON canciones_analizadas(key_strength)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_mood_happy ON canciones_analizadas(mood_happy)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_mood_party ON canciones_analizadas(mood_party)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_brightness ON canciones_analizadas(brightness)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_warmth ON canciones_analizadas(warmth)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_replay_gain ON canciones_analizadas(replay_gain_db)`;

    console.log('✅ Migración 007 completada: 55 campos añadidos + 9 índices');
    
    // Verificar columnas
    const result = await sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'canciones_analizadas' 
        AND column_name IN (
          'onset_rate', 'danceability', 'key_detected', 'spectral_centroid',
          'brightness', 'warmth', 'integrated_loudness', 'replay_gain_db',
          'mood_party', 'mood_happy'
        )
      ORDER BY column_name
    `;
    
    console.log('\n📊 Campos verificados:');
    result.forEach((row: any) => {
      console.log(`   ✓ ${row.column_name}: ${row.data_type}`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error en migración 007:', error);
    process.exit(1);
  }
}

runMigration007();
