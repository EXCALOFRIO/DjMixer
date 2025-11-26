import 'dotenv/config';
import { sql } from '../src/lib/db';

async function applyMigration() {
    console.log('🚀 Aplicando migración 011 manualmente...');

    try {
        // 1. Agregar vocales_clave
        console.log('📝 Agregando columna vocales_clave...');
        await sql`
      ALTER TABLE canciones_analizadas 
      ADD COLUMN IF NOT EXISTS vocales_clave JSONB NOT NULL DEFAULT '[]'
    `;

        // 2. Agregar loops_transicion
        console.log('📝 Agregando columna loops_transicion...');
        await sql`
      ALTER TABLE canciones_analizadas 
      ADD COLUMN IF NOT EXISTS loops_transicion JSONB NOT NULL DEFAULT '[]'
    `;

        // 3. Eliminar letras_ts
        console.log('🗑️  Eliminando columna letras_ts...');
        await sql`
      ALTER TABLE canciones_analizadas 
      DROP COLUMN IF EXISTS letras_ts
    `;

        // 4. Verificar
        console.log('✅ Verificando migración...');
        const columns = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'canciones_analizadas'
    `;

        const columnNames = columns.map((c: any) => c.column_name);
        const hasVocales = columnNames.includes('vocales_clave');
        const hasLoops = columnNames.includes('loops_transicion');
        const hasLetras = columnNames.includes('letras_ts');

        console.log('\n📋 Estado final:');
        console.log(`  ✅ vocales_clave: ${hasVocales ? 'CREADA' : '❌ FALTA'}`);
        console.log(`  ✅ loops_transicion: ${hasLoops ? 'CREADA' : '❌ FALTA'}`);
        console.log(`  ✅ letras_ts: ${hasLetras ? '❌ AÚN EXISTE' : 'ELIMINADA'}`);

        if (hasVocales && hasLoops && !hasLetras) {
            console.log('\n🎉 Migración 011 completada exitosamente!');
            process.exit(0);
        } else {
            console.error('\n❌ La migración no se completó correctamente');
            process.exit(1);
        }
    } catch (error) {
        console.error('❌ Error aplicando migración:', error);
        process.exit(1);
    }
}

applyMigration();
