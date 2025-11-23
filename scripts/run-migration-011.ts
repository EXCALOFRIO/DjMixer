/**
 * Migración 011: Optimización de campos Gemini
 * Elimina campos innecesarios que siempre tienen el mismo valor
 */

import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL || process.env.VITE_DATABASE_URL;

if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL no está definida');
    process.exit(1);
}

const sql = neon(DATABASE_URL);

async function runMigration() {
    console.log('🔄 Ejecutando migración 011: Optimización campos Gemini...\n');

    try {
        // Nota: Los campos confianza y descripcion están en JSONB, no en columnas separadas
        // Por lo tanto, no necesitamos ALTER TABLE, solo documentamos el cambio

        console.log('📝 Migración 011 - Cambios en schema JSON:');
        console.log('   - Campo "confianza" eliminado del schema (siempre era 1)');
        console.log('   - Campo "descripcion" eliminado de huecos (no se usaba)');
        console.log('   - Campo "descripcion" eliminado de eventos_dj (no se usaba)');
        console.log('   - Campo "resumen" eliminado de tema (no se usaba)');
        console.log('\n✅ Los datos existentes en JSONB se mantendrán pero los nuevos análisis');
        console.log('   no incluirán estos campos, ahorrando espacio y tiempo de procesamiento.\n');

        // Verificar que la tabla existe
        const tablas = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'canciones_analizadas'
    `;

        if (tablas.length === 0) {
            throw new Error('La tabla canciones_analizadas no existe');
        }

        console.log('✅ Tabla canciones_analizadas verificada');

        // Contar registros actuales
        const count = await sql`SELECT COUNT(*) as total FROM canciones_analizadas`;
        console.log(`📊 Registros actuales: ${count[0].total}`);

        console.log('\n✅ Migración 011 completada exitosamente');
        console.log('💡 Los nuevos análisis usarán el schema optimizado automáticamente\n');

    } catch (error) {
        console.error('❌ Error en migración 011:', error);
        throw error;
    }
}

runMigration()
    .then(() => {
        console.log('🎉 Migración finalizada');
        process.exit(0);
    })
    .catch((error) => {
        console.error('💥 Migración fallida:', error);
        process.exit(1);
    });
