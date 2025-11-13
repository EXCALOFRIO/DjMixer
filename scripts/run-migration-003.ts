import fs from 'fs';
import path from 'path';
import { neon } from '@neondatabase/serverless';

async function runMigration() {
  try {
    // Obtener DATABASE_URL de argumentos o variable de entorno
    const databaseUrl = process.argv[2] || process.env.DATABASE_URL;
    
    if (!databaseUrl) {
      console.error('❌ Error: DATABASE_URL no proporcionada\n');
      console.log('Uso:');
      console.log('  npx tsx scripts/run-migration-003.ts "postgresql://user:pass@host/db"\n');
      console.log('O configura DATABASE_URL en tus variables de entorno');
      process.exit(1);
    }
    
    console.log('🔄 Iniciando migración 003...\n');
    
    // Crear cliente SQL directamente
    const sql = neon(databaseUrl);
    
    // Leer el archivo de migración
    const migrationPath = path.join(process.cwd(), 'src', 'db', 'migrations', '003-add-essentia-metrics.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');
    
    console.log('📄 Ejecutando SQL...');
    
    // Neon no soporta múltiples statements en una sola query
    // Vamos a ejecutar la migración en partes
    console.log('⚠️  Nota: Neon no soporta transacciones con BEGIN/COMMIT en una sola query');
    console.log('� Por favor, ejecuta la migración manualmente en el dashboard de Neon:');
    console.log('   1. Abre https://console.neon.tech/');
    console.log('   2. Ve a tu proyecto y abre el SQL Editor');
    console.log('   3. Copia y pega el contenido de: src/db/migrations/003-add-essentia-metrics.sql');
    console.log('   4. Ejecuta la migración\n');
    
    console.log('📄 Contenido de la migración:');
    console.log('─'.repeat(80));
    console.log(migrationSQL);
    console.log('─'.repeat(80));
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error ejecutando la migración:', error);
    process.exit(1);
  }
}

runMigration();
