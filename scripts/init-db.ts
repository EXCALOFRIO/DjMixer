import { neon } from '@neondatabase/serverless';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Cargar variables de entorno desde .env
dotenv.config();

async function initDatabase() {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL no está definida en .env o .env.local');
    console.error('💡 Asegúrate de tener un archivo .env.local con:');
    console.error('   DATABASE_URL=postgresql://...');
    process.exit(1);
  }

  console.log('🔄 Conectando a la base de datos Neon...');
  const sql = neon(databaseUrl);

  try {
    // 1. Listar todas las tablas existentes
    console.log('\n📋 Verificando tablas existentes...');
    const existingTables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;

    if (existingTables.length > 0) {
      console.log('📦 Tablas encontradas:');
      existingTables.forEach((table: any) => {
        console.log(`   - ${table.table_name}`);
      });

      // 2. Eliminar todas las tablas existentes
      console.log('\n🗑️  Eliminando tablas antiguas...');
      for (const table of existingTables) {
        const tableName = table.table_name;
        await sql.unsafe(`DROP TABLE IF EXISTS "${tableName}" CASCADE`);
        console.log(`   ✓ Eliminada: ${tableName}`);
      }
    } else {
      console.log('   ℹ️  No hay tablas existentes');
    }

    // 3. Crear la tabla directamente (ESQUEMA OPTIMIZADO)
    console.log('\n🔄 Creando tabla canciones_analizadas...');
    
    await sql`
      CREATE TABLE IF NOT EXISTS canciones_analizadas (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        hash_archivo VARCHAR(256) UNIQUE NOT NULL,
        titulo TEXT NOT NULL,
        duracion_ms INTEGER NOT NULL,
        
        -- MÉTRICAS BÁSICAS (ESENCIALES PARA MIX)
        bpm FLOAT NOT NULL CHECK (bpm > 0 AND bpm < 300),
        tonalidad_camelot VARCHAR(3) NOT NULL,
        tonalidad_compatible JSONB NOT NULL DEFAULT '[]',
        energia FLOAT NOT NULL CHECK (energia >= 0 AND energia <= 1),
        bailabilidad FLOAT NOT NULL CHECK (bailabilidad >= 0 AND bailabilidad <= 1),
        animo_general VARCHAR(50) NOT NULL,
        compas JSONB NOT NULL DEFAULT '{"numerador": 4, "denominador": 4}',
        
        -- TIMING Y ESTRUCTURA (LO ESENCIAL PARA MIX)
        beats_ts_ms JSONB NOT NULL DEFAULT '[]',
        downbeats_ts_ms JSONB NOT NULL DEFAULT '[]',
        frases_ts_ms JSONB NOT NULL DEFAULT '[]',
        
        -- DATOS DE GEMINI (LETRAS Y ESTRUCTURA)
        letras_ts JSONB NOT NULL DEFAULT '[]',
        estructura_ts JSONB NOT NULL DEFAULT '[]',
        analisis_contenido JSONB NOT NULL DEFAULT '{"tema": {"resumen": "", "palabras_clave": [], "emocion": "neutral"}, "eventos_dj": []}',
        
        -- DATOS TÉCNICOS (VAD + RMS)
        segmentos_voz JSONB NOT NULL DEFAULT '[]',
        huecos_analizados JSONB NOT NULL DEFAULT '[]',
        
        -- METADATOS
        fecha_procesado TIMESTAMPTZ DEFAULT NOW(),
        
        -- CONSTRAINTS DE VALIDACIÓN
        CONSTRAINT valid_duration CHECK (duracion_ms > 0)
      )
    `;
    
    console.log('✅ Tabla creada con esquema optimizado');
    
    // Crear tabla de jobs para análisis asíncrono
    console.log('\n🔄 Creando tabla analysis_jobs...');
    
    await sql`
      CREATE TABLE IF NOT EXISTS analysis_jobs (
        id VARCHAR(256) PRIMARY KEY,
        hash VARCHAR(256) NOT NULL,
        status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
        progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
        current_step TEXT,
        error_message TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        completed_at TIMESTAMPTZ,
        result JSONB
      )
    `;
    
    console.log('✅ Tabla analysis_jobs creada');
    
    // Crear índices
    console.log('\n🔄 Creando índices...');
    
    await sql`CREATE INDEX IF NOT EXISTS idx_hash_archivo ON canciones_analizadas(hash_archivo)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_bpm ON canciones_analizadas(bpm)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_tonalidad ON canciones_analizadas(tonalidad_camelot)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_energia ON canciones_analizadas(energia)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_bailabilidad ON canciones_analizadas(bailabilidad)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_fecha_procesado ON canciones_analizadas(fecha_procesado)`;
    
    await sql`CREATE INDEX IF NOT EXISTS idx_job_hash ON analysis_jobs(hash)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_job_status ON analysis_jobs(status)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_job_created_at ON analysis_jobs(created_at)`;
    
    console.log('✅ Índices creados');

    // 4. Verificar la nueva tabla
    console.log('\n🔍 Verificando tabla creada...');
    
    // Listar todas las tablas después de crear
    const allTables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;
    
    console.log('📦 Tablas actuales en la base de datos:');
    allTables.forEach((table: any) => {
      console.log(`   - ${table.table_name}`);
    });
    
    const result = await sql`
      SELECT table_name, 
             (SELECT COUNT(*) FROM information_schema.columns 
              WHERE table_name = t.table_name AND table_schema = 'public') as column_count
      FROM information_schema.tables t
      WHERE table_schema = 'public' 
      AND table_name = 'canciones_analizadas'
    `;

    if (result.length > 0) {
      console.log('✅ Tabla "canciones_analizadas" creada exitosamente');
      console.log(`   📊 Columnas: ${result[0].column_count}`);
      
      // Listar columnas
      const columns = await sql`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'canciones_analizadas' 
        AND table_schema = 'public'
        ORDER BY ordinal_position
      `;
      
      console.log('\n📋 Estructura de la tabla:');
      columns.forEach((col: any) => {
        console.log(`   - ${col.column_name}: ${col.data_type}`);
      });

      // Verificar índices
      const indexes = await sql`
        SELECT indexname 
        FROM pg_indexes 
        WHERE tablename = 'canciones_analizadas'
        AND schemaname = 'public'
      `;
      
      console.log(`\n🔑 Índices creados: ${indexes.length}`);
      indexes.forEach((idx: any) => {
        console.log(`   - ${idx.indexname}`);
      });

      console.log('\n✨ ¡Base de datos lista para usar!');
      console.log('💡 Ahora puedes ejecutar: npm run dev');
    } else {
      console.error('❌ Error: La tabla no se creó correctamente');
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ Error al inicializar la base de datos:');
    console.error(error);
    console.error('\n💡 Verifica que:');
    console.error('   1. La DATABASE_URL sea correcta');
    console.error('   2. Tengas permisos en la base de datos');
    console.error('   3. La conexión a Neon esté activa');
    process.exit(1);
  }
}

console.log('🎵 Inicializador de Base de Datos - Sistema de Análisis Musical\n');
initDatabase();
