import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env') });

async function migrate() {
    console.log('🔧 Eliminando columna segmentos_voz...\n');

    const { sql } = await import('../src/lib/db.js');

    try {
        await sql`
      ALTER TABLE canciones_analizadas 
      DROP COLUMN IF EXISTS segmentos_voz
    `;

        console.log('✅ Columna segmentos_voz eliminada correctamente.');
    } catch (error) {
        console.error('❌ Error:', error);
    }
}

migrate();
