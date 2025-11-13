import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';
import { join } from 'path';

async function runMigration005() {
  try {
    const sql = neon(process.env.DATABASE_URL!);
    
    console.log('🔄 INICIANDO MIGRACIÓN 005: SISTEMA DE JOBS ASÍNCRONOS\n');

    console.log('📋 Creando tabla analysis_jobs...');
    
    // Ejecutar la migración - ejecutar comandos SQL individualmente
    await sql`
      CREATE TABLE IF NOT EXISTS analysis_jobs (
        id TEXT PRIMARY KEY,
        hash TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
        progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
        current_step TEXT,
        error_message TEXT,
        result JSONB,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMP WITH TIME ZONE
      )
    `;
    
    await sql`CREATE INDEX IF NOT EXISTS idx_analysis_jobs_hash ON analysis_jobs(hash)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_analysis_jobs_status ON analysis_jobs(status)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_analysis_jobs_created_at ON analysis_jobs(created_at)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_analysis_jobs_updated_at ON analysis_jobs(updated_at)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_analysis_jobs_cleanup ON analysis_jobs(status, updated_at)`;
    
    console.log('   ✅ Tabla analysis_jobs creada\n');

    // Verificar la tabla
    console.log('🔍 Verificando estructura de la tabla...\n');
    
    const tableInfo = await sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'analysis_jobs'
      ORDER BY ordinal_position
    `;

    console.log('📊 Columnas de analysis_jobs:');
    tableInfo.forEach((col: any, idx: number) => {
      console.log(`  ${idx + 1}. ${col.column_name} - ${col.data_type} (${col.is_nullable === 'YES' ? 'nullable' : 'NOT NULL'})`);
    });

    // Verificar índices
    const indexes = await sql`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'analysis_jobs'
    `;

    console.log(`\n📊 Índices creados: ${indexes.length}`);
    indexes.forEach((idx: any) => {
      console.log(`  - ${idx.indexname}`);
    });

    console.log('\n✅ MIGRACIÓN 005 COMPLETADA EXITOSAMENTE\n');
    console.log('✨ Sistema de jobs asíncronos listo para usar!');
    console.log('   - Los análisis pueden procesarse en segundo plano');
    console.log('   - Endpoint de estado: GET /api/analyze/status?jobId=<hash>');
    console.log('   - Modo asíncrono: POST /api/analyze con async=true\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ ERROR EN MIGRACIÓN 005:', error);
    process.exit(1);
  }
}

runMigration005();
