-- ===================================================================
-- MIGRACIÓN 007: AÑADIR TODOS LOS CAMPOS DE ESSENTIA.JS
-- ===================================================================
-- Añade todas las métricas avanzadas calculadas por Essentia.js
-- Incluye: ritmo avanzado, tonal avanzado, espectral, timbre, loudness,
-- clasificación de mood, estructura de canción, y ReplayGain
-- ===================================================================

-- ===================================================================
-- 1. AÑADIR CAMPOS DE RITMO AVANZADO
-- ===================================================================
ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS onset_rate FLOAT DEFAULT 0;
ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS beats_loudness JSONB DEFAULT '[]';
ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS danceability FLOAT DEFAULT 0;
ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS dynamic_complexity FLOAT DEFAULT 0;
ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS bpm_histogram JSONB DEFAULT '[]';
ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS transientes_ritmicos_ts_ms JSONB DEFAULT '[]';

-- ===================================================================
-- 2. AÑADIR CAMPOS DE ANÁLISIS TONAL AVANZADO
-- ===================================================================
ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS key_detected VARCHAR(50) DEFAULT 'C major';
ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS scale_detected VARCHAR(20) DEFAULT 'major';
ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS key_strength FLOAT DEFAULT 0 CHECK (key_strength >= 0 AND key_strength <= 1);
ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS chords JSONB DEFAULT '[]';
ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS tuning_frequency FLOAT DEFAULT 440;
ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS harmonic_complexity FLOAT DEFAULT 0;
ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS dissonance FLOAT DEFAULT 0;

-- ===================================================================
-- 3. AÑADIR CAMPOS DE ANÁLISIS ESPECTRAL
-- ===================================================================
ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS spectral_centroid FLOAT DEFAULT 0;
ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS spectral_rolloff FLOAT DEFAULT 0;
ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS spectral_flux FLOAT DEFAULT 0;
ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS spectral_complexity FLOAT DEFAULT 0;
ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS spectral_contrast JSONB DEFAULT '[]';
ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS zero_crossing_rate FLOAT DEFAULT 0;

-- ===================================================================
-- 4. AÑADIR CAMPOS DE TIMBRE
-- ===================================================================
ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS mfcc JSONB DEFAULT '[]';
ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS brightness FLOAT DEFAULT 0 CHECK (brightness >= 0 AND brightness <= 1);
ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS roughness FLOAT DEFAULT 0;
ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS warmth FLOAT DEFAULT 0 CHECK (warmth >= 0 AND warmth <= 1);
ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS sharpness FLOAT DEFAULT 0;

-- ===================================================================
-- 5. AÑADIR CAMPOS DE LOUDNESS (LUFS)
-- ===================================================================
ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS integrated_loudness FLOAT DEFAULT -14;
ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS momentary_loudness JSONB DEFAULT '[]';
ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS short_term_loudness JSONB DEFAULT '[]';
ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS dynamic_range FLOAT DEFAULT 0;
ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS loudness_range FLOAT DEFAULT 0;
ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS replay_gain_db FLOAT DEFAULT 0; -- ⭐ NUEVO: ReplayGain

-- ===================================================================
-- 6. AÑADIR CAMPOS DE CLASIFICACIÓN DE MOOD
-- ===================================================================
ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS mood_acoustic FLOAT DEFAULT 0.5 CHECK (mood_acoustic >= 0 AND mood_acoustic <= 1);
ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS mood_electronic FLOAT DEFAULT 0.5 CHECK (mood_electronic >= 0 AND mood_electronic <= 1);
ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS mood_aggressive FLOAT DEFAULT 0 CHECK (mood_aggressive >= 0 AND mood_aggressive <= 1);
ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS mood_relaxed FLOAT DEFAULT 1 CHECK (mood_relaxed >= 0 AND mood_relaxed <= 1);
ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS mood_happy FLOAT DEFAULT 0.5 CHECK (mood_happy >= 0 AND mood_happy <= 1);
ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS mood_sad FLOAT DEFAULT 0.5 CHECK (mood_sad >= 0 AND mood_sad <= 1);
ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS mood_party FLOAT DEFAULT 0 CHECK (mood_party >= 0 AND mood_party <= 1);
ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS voice_instrumental_confidence FLOAT DEFAULT 0.5 CHECK (voice_instrumental_confidence >= 0 AND voice_instrumental_confidence <= 1);

-- ===================================================================
-- 7. AÑADIR CAMPOS DE ESTRUCTURA DE CANCIÓN
-- ===================================================================
ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS segmentos_estructura JSONB DEFAULT '[]';
ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS intro_duration_ms INTEGER DEFAULT 0;
ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS outro_duration_ms INTEGER DEFAULT 0;
ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS fade_in_duration_ms INTEGER DEFAULT 0;
ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS fade_out_duration_ms INTEGER DEFAULT 0;

-- ===================================================================
-- 8. AÑADIR CAMPOS DE DATOS TÉCNICOS FALTANTES
-- ===================================================================
ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS bpm_rango_min FLOAT DEFAULT 0;
ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS bpm_rango_max FLOAT DEFAULT 0;
ALTER TABLE canciones_analizadas ADD COLUMN IF NOT EXISTS perfil_energia_rms JSONB DEFAULT '[]';

-- ===================================================================
-- 9. CREAR ÍNDICES PARA OPTIMIZAR BÚSQUEDAS
-- ===================================================================
CREATE INDEX IF NOT EXISTS idx_danceability ON canciones_analizadas(danceability);
CREATE INDEX IF NOT EXISTS idx_integrated_loudness ON canciones_analizadas(integrated_loudness);
CREATE INDEX IF NOT EXISTS idx_key_detected ON canciones_analizadas(key_detected);
CREATE INDEX IF NOT EXISTS idx_key_strength ON canciones_analizadas(key_strength);
CREATE INDEX IF NOT EXISTS idx_mood_happy ON canciones_analizadas(mood_happy);
CREATE INDEX IF NOT EXISTS idx_mood_party ON canciones_analizadas(mood_party);
CREATE INDEX IF NOT EXISTS idx_brightness ON canciones_analizadas(brightness);
CREATE INDEX IF NOT EXISTS idx_warmth ON canciones_analizadas(warmth);
CREATE INDEX IF NOT EXISTS idx_replay_gain ON canciones_analizadas(replay_gain_db);

-- ===================================================================
-- 10. COMENTARIOS EN LAS COLUMNAS PARA DOCUMENTACIÓN
-- ===================================================================
COMMENT ON COLUMN canciones_analizadas.onset_rate IS 'Tasa de ataques/onsets por segundo (Essentia)';
COMMENT ON COLUMN canciones_analizadas.danceability IS 'Bailabilidad calculada por Essentia (0-3+)';
COMMENT ON COLUMN canciones_analizadas.dynamic_complexity IS 'Complejidad dinámica del audio (0-1+)';
COMMENT ON COLUMN canciones_analizadas.key_detected IS 'Tonalidad detectada por Essentia (ej: C major, A minor)';
COMMENT ON COLUMN canciones_analizadas.key_strength IS 'Confianza de detección de tonalidad (0-1)';
COMMENT ON COLUMN canciones_analizadas.spectral_centroid IS 'Centro espectral promedio en Hz (brillantez)';
COMMENT ON COLUMN canciones_analizadas.spectral_rolloff IS 'Rolloff espectral en Hz';
COMMENT ON COLUMN canciones_analizadas.brightness IS 'Brillo del sonido (0-1)';
COMMENT ON COLUMN canciones_analizadas.warmth IS 'Calidez del sonido (0-1)';
COMMENT ON COLUMN canciones_analizadas.integrated_loudness IS 'Loudness integrado en LUFS (EBU R128)';
COMMENT ON COLUMN canciones_analizadas.replay_gain_db IS 'ReplayGain en dB para normalización de volumen';
COMMENT ON COLUMN canciones_analizadas.mood_acoustic IS 'Clasificación acústico vs electrónico (0-1)';
COMMENT ON COLUMN canciones_analizadas.mood_party IS 'Ambiente de fiesta (0-1)';

-- ===================================================================
-- FIN DE MIGRACIÓN 007
-- ===================================================================
