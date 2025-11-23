-- ===================================================================
-- MIGRACIÓN 008: ELIMINAR CAMPOS COSTOSOS E INNECESARIOS
-- ===================================================================
-- Elimina análisis de alto costo computacional y baja relevancia para DJs:
-- - MFCC (Coeficientes Cepstrales)
-- - Análisis Espectral Completo (Centroid, Rolloff, Flux, Complexity, Contrast, ZCR)
-- - Timbre Detallado (Brightness, Roughness, Warmth, Sharpness)
-- - Clasificación de Mood (se obtiene mejor con Gemini AI)
-- - Acordes, Tuning Frequency, Harmonic Complexity, Dissonance
-- - Dynamic Complexity, BPM Histogram
-- 
-- Resultado: ~70% más rápido, solo mantiene lo esencial para DJs
-- ===================================================================

-- ===================================================================
-- 1. ELIMINAR CAMPOS DE RITMO AVANZADO INNECESARIOS
-- ===================================================================
DO $$ BEGIN
    ALTER TABLE canciones_analizadas DROP COLUMN dynamic_complexity;
EXCEPTION
    WHEN undefined_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE canciones_analizadas DROP COLUMN bpm_histogram;
EXCEPTION
    WHEN undefined_column THEN NULL;
END $$;

-- ===================================================================
-- 2. ELIMINAR CAMPOS DE ANÁLISIS TONAL INNECESARIOS
-- ===================================================================
DO $$ BEGIN
    ALTER TABLE canciones_analizadas DROP COLUMN chords;
EXCEPTION
    WHEN undefined_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE canciones_analizadas DROP COLUMN tuning_frequency;
EXCEPTION
    WHEN undefined_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE canciones_analizadas DROP COLUMN harmonic_complexity;
EXCEPTION
    WHEN undefined_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE canciones_analizadas DROP COLUMN dissonance;
EXCEPTION
    WHEN undefined_column THEN NULL;
END $$;

-- ===================================================================
-- 3. ELIMINAR TODOS LOS CAMPOS DE ANÁLISIS ESPECTRAL
-- ===================================================================
DO $$ BEGIN
    ALTER TABLE canciones_analizadas DROP COLUMN spectral_centroid;
EXCEPTION
    WHEN undefined_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE canciones_analizadas DROP COLUMN spectral_rolloff;
EXCEPTION
    WHEN undefined_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE canciones_analizadas DROP COLUMN spectral_flux;
EXCEPTION
    WHEN undefined_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE canciones_analizadas DROP COLUMN spectral_complexity;
EXCEPTION
    WHEN undefined_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE canciones_analizadas DROP COLUMN spectral_contrast;
EXCEPTION
    WHEN undefined_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE canciones_analizadas DROP COLUMN zero_crossing_rate;
EXCEPTION
    WHEN undefined_column THEN NULL;
END $$;

-- ===================================================================
-- 4. ELIMINAR TODOS LOS CAMPOS DE TIMBRE
-- ===================================================================
DO $$ BEGIN
    ALTER TABLE canciones_analizadas DROP COLUMN mfcc;
EXCEPTION
    WHEN undefined_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE canciones_analizadas DROP COLUMN brightness;
EXCEPTION
    WHEN undefined_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE canciones_analizadas DROP COLUMN roughness;
EXCEPTION
    WHEN undefined_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE canciones_analizadas DROP COLUMN warmth;
EXCEPTION
    WHEN undefined_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE canciones_analizadas DROP COLUMN sharpness;
EXCEPTION
    WHEN undefined_column THEN NULL;
END $$;

-- ===================================================================
-- 5. ELIMINAR CAMPOS DE CLASIFICACIÓN DE MOOD
-- ===================================================================
-- Gemini AI proporciona clasificación mucho más rica y precisa
DO $$ BEGIN
    ALTER TABLE canciones_analizadas DROP COLUMN mood_acoustic;
EXCEPTION
    WHEN undefined_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE canciones_analizadas DROP COLUMN mood_electronic;
EXCEPTION
    WHEN undefined_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE canciones_analizadas DROP COLUMN mood_aggressive;
EXCEPTION
    WHEN undefined_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE canciones_analizadas DROP COLUMN mood_relaxed;
EXCEPTION
    WHEN undefined_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE canciones_analizadas DROP COLUMN mood_happy;
EXCEPTION
    WHEN undefined_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE canciones_analizadas DROP COLUMN mood_sad;
EXCEPTION
    WHEN undefined_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE canciones_analizadas DROP COLUMN mood_party;
EXCEPTION
    WHEN undefined_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE canciones_analizadas DROP COLUMN voice_instrumental_confidence;
EXCEPTION
    WHEN undefined_column THEN NULL;
END $$;

-- ===================================================================
-- 6. ELIMINAR ÍNDICES OBSOLETOS
-- ===================================================================
DROP INDEX IF EXISTS idx_mood_happy;
DROP INDEX IF EXISTS idx_mood_party;
DROP INDEX IF EXISTS idx_brightness;
DROP INDEX IF EXISTS idx_warmth;

-- ===================================================================
-- 7. CAMPOS QUE SE MANTIENEN (ÚTILES PARA DJS)
-- ===================================================================
-- ✅ onset_rate - Tasa de ataques (útil para detectar percusión)
-- ✅ beats_loudness - Intensidad de cada beat (útil para mezclas)
-- ✅ danceability - Bailabilidad (métrica esencial para DJs)
-- ✅ transientes_ritmicos_ts_ms - Onsets detectados (útil para sync)
-- ✅ key_detected, scale_detected, key_strength - Tonalidad (mezcla armónica)
-- ✅ integrated_loudness, dynamic_range, loudness_range - Loudness (normalización)
-- ✅ replay_gain_db - ReplayGain (normalización de volumen entre tracks)
-- ✅ segmentos_estructura - Estructura de la canción (intro/outro/drops)
-- ✅ intro_duration_ms, outro_duration_ms - Duración de intro/outro (mezclas)
-- ✅ fade_in_duration_ms, fade_out_duration_ms - Fades (transiciones)

-- ===================================================================
-- FIN DE MIGRACIÓN 008
-- ===================================================================
