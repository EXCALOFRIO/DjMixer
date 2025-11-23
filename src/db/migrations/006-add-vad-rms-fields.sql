-- ===================================================================
-- MIGRACIÓN 006: Agregar campos VAD, RMS y huecos analizados
-- ===================================================================
-- Fecha: 2025-11-14
-- Descripción: Añade campos para segmentos VAD, perfil RMS y análisis de huecos
-- ===================================================================

-- Agregar columna segmentos_voz (segmentos detectados por VAD)
ALTER TABLE canciones_analizadas 
ADD COLUMN IF NOT EXISTS segmentos_voz JSONB NOT NULL DEFAULT '[]';

-- Agregar columna perfil_energia_rms (perfil RMS cada 250ms)
ALTER TABLE canciones_analizadas 
ADD COLUMN IF NOT EXISTS perfil_energia_rms JSONB NOT NULL DEFAULT '[]';

-- Agregar columna huecos_analizados (análisis de huecos instrumentales)
ALTER TABLE canciones_analizadas 
ADD COLUMN IF NOT EXISTS huecos_analizados JSONB NOT NULL DEFAULT '[]';

-- Comentarios de documentación
COMMENT ON COLUMN canciones_analizadas.segmentos_voz IS 
'Segmentos de voz detectados por VAD (Voice Activity Detection). Array de objetos {start_ms, end_ms}';

COMMENT ON COLUMN canciones_analizadas.perfil_energia_rms IS 
'Perfil de energía RMS calculado cada 250ms. Array de valores normalizados (0-1)';

COMMENT ON COLUMN canciones_analizadas.huecos_analizados IS 
'Análisis de huecos instrumentales entre segmentos VAD. Array de objetos {inicio_ms, fin_ms, tipo, descripcion, energia_relativa}';

-- ===================================================================
-- Verificación de la migración
-- ===================================================================
-- Verificar que las columnas se crearon correctamente
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'canciones_analizadas' 
    AND column_name = 'segmentos_voz'
  ) THEN
    RAISE EXCEPTION 'Migración fallida: columna segmentos_voz no existe';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'canciones_analizadas' 
    AND column_name = 'perfil_energia_rms'
  ) THEN
    RAISE EXCEPTION 'Migración fallida: columna perfil_energia_rms no existe';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'canciones_analizadas' 
    AND column_name = 'huecos_analizados'
  ) THEN
    RAISE EXCEPTION 'Migración fallida: columna huecos_analizados no existe';
  END IF;
  
  RAISE NOTICE 'Migración 006 completada exitosamente';
END $$;
