import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config();

async function runCleanMigration() {
    console.log('🔄 Iniciando migración limpia de base de datos...');
    console.log('⚠️  ADVERTENCIA: Esto eliminará TODAS las tablas y datos existentes\n');

    const DATABASE_URL = process.env.DATABASE_URL;

    if (!DATABASE_URL) {
        throw new Error('DATABASE_URL no está definida en .env');
    }

    const sql = neon(DATABASE_URL);

    try {
        console.log('📝 Paso 1: Eliminando tablas existentes...');
        await sql`DROP TABLE IF EXISTS analysis_jobs CASCADE`;
        await sql`DROP TABLE IF EXISTS canciones_analizadas CASCADE`;
        console.log('✅ Tablas eliminadas\n');

        console.log('📝 Paso 2: Creando tabla canciones_analizadas...');
        await sql`
      CREATE TABLE canciones_analizadas (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        hash_archivo VARCHAR(256) UNIQUE NOT NULL,
        titulo TEXT NOT NULL,
        duracion_ms INTEGER NOT NULL CHECK (duracion_ms > 0),
        bpm FLOAT NOT NULL CHECK (bpm > 0 AND bpm < 300),
        tonalidad_camelot VARCHAR(3) NOT NULL,
        tonalidad_compatible JSONB NOT NULL DEFAULT '[]',
        bailabilidad FLOAT NOT NULL CHECK (bailabilidad >= 0 AND bailabilidad <= 1),
        compas JSONB NOT NULL DEFAULT '{"numerador": 4, "denominador": 4}',
        beats_ts_ms JSONB NOT NULL DEFAULT '[]',
        downbeats_ts_ms JSONB NOT NULL DEFAULT '[]',
        frases_ts_ms JSONB NOT NULL DEFAULT '[]',
        vocales_clave JSONB NOT NULL DEFAULT '[]',
        loops_transicion JSONB NOT NULL DEFAULT '[]',
        estructura_ts JSONB NOT NULL DEFAULT '[]',
        segmentos_voz JSONB NOT NULL DEFAULT '[]',
        huecos_analizados JSONB NOT NULL DEFAULT '[]',
        fecha_procesado TIMESTAMPTZ DEFAULT NOW()
      )
    `;
        console.log('✅ Tabla canciones_analizadas creada\n');

        console.log('📝 Paso 3: Creando tabla analysis_jobs...');
        await sql`
      CREATE TABLE analysis_jobs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        hash_archivo VARCHAR(256) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
        current_step TEXT,
        error_message TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
        console.log('✅ Tabla analysis_jobs creada\n');

        console.log('📝 Paso 4: Creando índices...');
        await sql`CREATE INDEX idx_hash_archivo ON canciones_analizadas(hash_archivo)`;
        await sql`CREATE INDEX idx_bpm ON canciones_analizadas(bpm)`;
        await sql`CREATE INDEX idx_tonalidad ON canciones_analizadas(tonalidad_camelot)`;
        await sql`CREATE INDEX idx_bailabilidad ON canciones_analizadas(bailabilidad)`;
        await sql`CREATE INDEX idx_fecha_procesado ON canciones_analizadas(fecha_procesado)`;
        await sql`CREATE INDEX idx_job_hash ON analysis_jobs(hash_archivo)`;
        await sql`CREATE INDEX idx_job_status ON analysis_jobs(status)`;
        await sql`CREATE INDEX idx_job_created ON analysis_jobs(created_at)`;
        console.log('✅ Índices creados\n');

        console.log('✅ Migración completada exitosamente');
        console.log('\n📊 Estructura final:');
        console.log('   - canciones_analizadas: 17 columnas (solo campos usados)');
        console.log('   - analysis_jobs: 7 columnas');
        console.log('\n🎉 Base de datos lista para usar');

    } catch (error) {
        console.error('❌ Error durante la migración:', error);
        throw error;
    }
}

runCleanMigration()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
