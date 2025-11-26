-- ===================================================================
-- MIGRACIÓN 011: DJ-CENTRIC SCHEMA
-- ===================================================================
-- Elimina transcripción palabra por palabra (letras_ts)
-- Agrega estructura DJ-céntrica (vocales_clave, loops_transicion)
-- ===================================================================

BEGIN;

-- Agregar nuevas columnas para análisis DJ
ALTER TABLE canciones_analizadas 
ADD COLUMN IF NOT EXISTS vocales_clave JSONB NOT NULL DEFAULT '[]',
ADD COLUMN IF NOT EXISTS loops_transicion JSONB NOT NULL DEFAULT '[]';

-- Comentar las nuevas columnas
COMMENT ON COLUMN canciones_analizadas.vocales_clave IS 'Bloques de voz (verso/coro/adlib) con timestamps en ms';
COMMENT ON COLUMN canciones_analizadas.loops_transicion IS 'Frases repetitivas ideales para loops con score de idoneidad';

-- Eliminar columna obsoleta (transcripción palabra por palabra)
ALTER TABLE canciones_analizadas DROP COLUMN IF EXISTS letras_ts;

-- Verificar que la migración fue exitosa
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'canciones_analizadas' 
    AND column_name = 'vocales_clave'
  ) THEN
    RAISE EXCEPTION 'Migration failed: vocales_clave column not created';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'canciones_analizadas' 
    AND column_name = 'loops_transicion'
  ) THEN
    RAISE EXCEPTION 'Migration failed: loops_transicion column not created';
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'canciones_analizadas' 
    AND column_name = 'letras_ts'
  ) THEN
    RAISE EXCEPTION 'Migration failed: letras_ts column still exists';
  END IF;
  
  RAISE NOTICE 'Migration 011 completed successfully';
END $$;

COMMIT;

-- ===================================================================
-- NOTAS DE MIGRACIÓN
-- ===================================================================
-- • Los datos antiguos de letras_ts se pierden permanentemente
-- • Las canciones existentes tendrán vocales_clave y loops_transicion vacíos []
-- • Se requiere re-análisis con Gemini para poblar los nuevos campos
-- ===================================================================
