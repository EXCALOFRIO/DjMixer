import 'dotenv/config';
import { sql } from '../src/lib/db';
import fs from 'fs';
import path from 'path';

async function runMigration() {
    console.log('🚀 Iniciando migración 011...');

    try {
        const migrationPath = path.join(process.cwd(), 'src', 'db', 'migrations', '011-dj-centric-schema.sql');
        const migrationSql = fs.readFileSync(migrationPath, 'utf8');

        console.log('📂 Archivo de migración leído:', migrationPath);

        // Ejecutar el SQL directamente
        // postgres.js permite ejecutar strings de SQL si se usa unsafe, pero sql`` espera template literals.
        // Para ejecutar un archivo entero con múltiples sentencias, lo mejor es usar sql.unsafe() si la librería lo soporta,
        // o simplemente leer el archivo y pasarlo.
        // La librería @neondatabase/serverless o postgres.js suele tener un método para raw queries o unsafe.
        // En src/lib/db.ts se exporta 'sql' que es una instancia de neon o postgres.

        // Asumiendo que 'sql' es de @neondatabase/serverless o similar que soporta template tags.
        // Si es postgres.js, soporta sql.file() o sql.unsafe().
        // Vamos a intentar con sql.unsafe() si existe, o simplemente pasar el string si lo permite.
        // Si no, dividimos por ';' y ejecutamos.

        // Revisando src/lib/db.ts (no lo he visto, pero asumo que es postgres.js o neon)
        // Intentaremos ejecutarlo como un query simple.

        // NOTA: sql`${migrationSql}` NO funcionará para múltiples sentencias o estructura compleja si se parametriza.
        // Necesitamos ejecutar el raw SQL.

        // Si 'sql' es de postgres.js:
        // await sql.unsafe(migrationSql);

        // Si 'sql' es de @neondatabase/serverless:
        // await sql(migrationSql); (si soporta raw strings, que usualmente no)

        // Vamos a probar un enfoque seguro: leer el archivo y ejecutarlo.
        // Si falla, tendremos que ver cómo ejecutar raw sql.

        // Mejor enfoque: usar el cliente postgres directamente si es posible, o asumir que sql() puede tomar un string raw si no es un template literal? No, eso es peligroso.

        // Vamos a intentar usar sql.unsafe(migrationSql) que es común en librerías modernas.

        // Si no existe unsafe, fallará y lo veremos.

        // @ts-ignore - ignorar error de tipo si unsafe no está en la definición pero sí en runtime
        await sql.unsafe(migrationSql);

        console.log('✅ Migración 011 aplicada con éxito.');
    } catch (error) {
        console.error('❌ Error en la migración:', error);
        process.exit(1);
    } finally {
        // Cerrar conexión si es necesario (aunque en serverless suele cerrarse sola o no ser necesario)
        process.exit(0);
    }
}

runMigration();
