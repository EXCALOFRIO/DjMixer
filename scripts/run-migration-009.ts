import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

async function runMigration009() {
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL no está definida. Agrega la cadena de conexión en .env');
    process.exit(1);
  }

  const sql = neon(process.env.DATABASE_URL);

  try {
    console.log('🚀 Ejecutando migración 009: Eliminar perfil_energia_rms...\n');

    console.log('📋 Eliminando columna perfil_energia_rms...');
    
    await sql`
      DO $$ BEGIN
        ALTER TABLE canciones_analizadas DROP COLUMN perfil_energia_rms;
      EXCEPTION
        WHEN undefined_column THEN NULL;
      END $$;
    `;

    console.log('✅ Migración 009 completada exitosamente');
    console.log('\n📊 Resumen:');
    console.log('   - Eliminada: perfil_energia_rms');
    console.log('   - Razón: Se generará dinámicamente en frontend cuando sea necesario');

  } catch (error) {
    console.error('❌ Error ejecutando migración 009:', error);
    process.exit(1);
  }
}

runMigration009();
