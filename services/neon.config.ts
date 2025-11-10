/**
 * Configuración de Neon Database
 * 
 * Suprime warnings de seguridad porque:
 * 1. Solo guardamos análisis de Gemini (no datos sensibles)
 * 2. No hay datos de usuarios
 * 3. Es solo un cache de análisis musicales
 * 4. La base de datos está protegida por credenciales
 */

import { neon, NeonQueryFunction, neonConfig } from '@neondatabase/serverless';

// Suprimir warnings de seguridad en el navegador
// Esto es seguro porque solo usamos la DB para cache de análisis musicales
neonConfig.disableWarningInBrowsers = true;

export function createNeonClient(databaseUrl: string): NeonQueryFunction<false, false> {
    const sql = neon(databaseUrl, {
        fullResults: false,
        arrayMode: false,
        fetchOptions: {
            cache: 'no-store'
        }
    });

    return sql;
}
