
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env') });

async function fixJobsSchema() {
    console.log('🔧 Reparando schema de analysis_jobs...\n');

    const { sql } = await import('../src/lib/db.js');

    try {
        await sql`
      ALTER TABLE analysis_jobs 
      ADD COLUMN IF NOT EXISTS result JSONB,
      ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;
    `;

        console.log('✅ Columnas result y completed_at agregadas correctamente.');
    } catch (error) {
        console.error('❌ Error reparando schema:', error);
    }
}

fixJobsSchema();
