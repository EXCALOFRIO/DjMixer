import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

async function runMigration010() {
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL no está definida. Agrega la cadena de conexión en .env');
    process.exit(1);
  }

  const sql = neon(process.env.DATABASE_URL);

  try {
    console.log('🚀 Ejecutando migración 010: Eliminar beats_loudness...\n');

    console.log('📋 Eliminando columna beats_loudness...');
    
    await sql`
      DO $$ BEGIN
        ALTER TABLE canciones_analizadas DROP COLUMN beats_loudness;
      EXCEPTION
        WHEN undefined_column THEN NULL;
      END $$;
    `;

    console.log('✅ Migración 010 completada exitosamente');
    console.log('\n📊 Resumen:');
    console.log('   - Eliminada: beats_loudness');
    console.log('   - Razón: Se calculará dinámicamente en frontend cuando sea necesario');

  } catch (error) {
    console.error('❌ Error ejecutando migración 010:', error);
    process.exit(1);
  }
}

runMigration010();
