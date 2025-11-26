
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env') });

async function checkConstraints() {
    console.log('🔍 Verificando constraints de analysis_jobs...\n');

    const { sql } = await import('../src/lib/db.js');

    try {
        const constraints = await sql`
      SELECT conname, pg_get_constraintdef(c.oid)
      FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE conrelid = 'analysis_jobs'::regclass
    `;

        console.log('Constraints:', constraints);
    } catch (error) {
        console.error('Error:', error);
    }
}

checkConstraints();
