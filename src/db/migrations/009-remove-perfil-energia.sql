-- Migration 009: Eliminar campo perfil_energia_rms (ya no se usa)
-- Fecha: 2025-11-19

DO $$ BEGIN
    ALTER TABLE canciones_analizadas DROP COLUMN perfil_energia_rms;
EXCEPTION
    WHEN undefined_column THEN NULL;
END $$;

-- Nota: perfil_energia_rms se generará dinámicamente en el frontend cuando sea necesario
