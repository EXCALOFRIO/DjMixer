import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { analizarAudioCompleto } from '../src/lib/audio-analyzer-unified';

interface TiempoAnalisis {
  fase: string;
  duracion_ms: number;
  porcentaje: number;
}

const songs = [
  {
    name: '3 Am',
    file: join(__dirname, 'fixtures', '3_Am.mp3'),
  },
  {
    name: 'A Un Paso De La Luna',
    file: join(__dirname, 'fixtures', 'A_Un_Paso_De_La_Luna.mp3'),
  }
];

const available = songs.filter(s => existsSync(s.file));

describe('⏱️ Benchmark de Análisis de Audio', () => {
  if (available.length === 0) {
    it.skip('No hay archivos de prueba disponibles', () => {});
    return;
  }

  available.forEach((song) => {
    describe(`📊 ${song.name}`, () => {
      let tiempos: TiempoAnalisis[] = [];
      let tiempoTotal = 0;

      beforeAll(async () => {
        console.log(`\n${'='.repeat(80)}`);
        console.log(`⏱️  BENCHMARK DETALLADO: ${song.name}`);
        console.log(`${'='.repeat(80)}\n`);

        const buffer = readFileSync(song.file);
        const inicioTotal = performance.now();

        // Hook para capturar console.log y medir tiempos
        const originalLog = console.log;
        let ultimoLog = inicioTotal;
        let faseActual = 'Inicio';

        console.log = (...args: any[]) => {
          const ahora = performance.now();
          const duracion = ahora - ultimoLog;

          // Detectar inicio de fases - MÁS DETALLADO
          const mensaje = args.join(' ');
          
          if (mensaje.includes('🎵 Iniciando análisis completo')) {
            faseActual = '1. Decodificación de audio (MP3→PCM)';
            ultimoLog = ahora;
          } else if (mensaje.includes('Duración:') && mensaje.includes('Hz')) {
            tiempos.push({ fase: faseActual, duracion_ms: duracion, porcentaje: 0 });
            faseActual = '2. Preparación señal Essentia';
            ultimoLog = ahora;
          } else if (mensaje.includes('🥁 Analizando ritmo')) {
            if (faseActual.includes('Preparación')) {
              tiempos.push({ fase: faseActual, duracion_ms: duracion, porcentaje: 0 });
            }
            if (mensaje.includes('Essentia')) {
              faseActual = '3a. Análisis ritmo (Essentia)';
            } else if (mensaje.includes('Realtime BPM')) {
              faseActual = '3b. Análisis ritmo (RBA)';
            } else {
              faseActual = '3c. Análisis ritmo (Heurística)';
            }
            ultimoLog = ahora;
          } else if (mensaje.includes('✓ BPM')) {
            tiempos.push({ fase: faseActual, duracion_ms: duracion, porcentaje: 0 });
            faseActual = '4. Cálculo métricas (Energía/Bailabilidad)';
            ultimoLog = ahora;
          } else if (mensaje.includes('✓ Energía')) {
            tiempos.push({ fase: faseActual, duracion_ms: duracion, porcentaje: 0 });
            faseActual = '5. Detección de tonalidad (Pitchfinder+Tonal)';
            ultimoLog = ahora;
          } else if (mensaje.includes('✓ Tonalidad')) {
            tiempos.push({ fase: faseActual, duracion_ms: duracion, porcentaje: 0 });
            faseActual = '6. Generación de cue points';
            ultimoLog = ahora;
          } else if (mensaje.includes('✅ Análisis completado')) {
            tiempos.push({ fase: faseActual, duracion_ms: duracion, porcentaje: 0 });
            faseActual = '7. Análisis avanzado Essentia';
            ultimoLog = ahora;
          } else if (mensaje.includes('🔬 Ejecutando análisis avanzados')) {
            faseActual = '7. Análisis avanzado Essentia (paralelo)';
            ultimoLog = ahora;
          } else if (mensaje.includes('✓ Análisis avanzados completados')) {
            tiempos.push({ fase: faseActual, duracion_ms: duracion, porcentaje: 0 });
            faseActual = '8. Finalización y preparación respuesta';
            ultimoLog = ahora;
          }

          originalLog.apply(console, args);
        };

        // Ejecutar análisis
        await analizarAudioCompleto(buffer);

        const finTotal = performance.now();
        tiempoTotal = finTotal - inicioTotal;

        // Restaurar console.log
        console.log = originalLog;

        // Calcular porcentajes
        tiempos = tiempos.map(t => ({
          ...t,
          porcentaje: (t.duracion_ms / tiempoTotal) * 100
        }));

        // Mostrar resultados
        console.log(`\n${'='.repeat(80)}`);
        console.log(`📊 RESULTADOS DETALLADOS: ${song.name}`);
        console.log(`${'='.repeat(80)}\n`);

        console.log(`⏱️  Tiempo total: ${(tiempoTotal / 1000).toFixed(3)}s\n`);

        // Tabla completa ordenada por duración
        const ordenados = [...tiempos].sort((a, b) => b.duracion_ms - a.duracion_ms);

        console.log('┌──┬─────────────────────────────────────────────┬──────────┬──────────┬─────────┐');
        console.log('│ #│ Fase                                        │ ms       │ segundos │ %       │');
        console.log('├──┼─────────────────────────────────────────────┼──────────┼──────────┼─────────┤');
        
        ordenados.forEach((t, index) => {
          const num = `${index + 1}`.padStart(2, ' ');
          const fase = t.fase.padEnd(43, ' ').substring(0, 43);
          const ms = `${t.duracion_ms.toFixed(0)}`.padStart(8, ' ');
          const seg = `${(t.duracion_ms / 1000).toFixed(3)}`.padStart(8, ' ');
          const porcentaje = `${t.porcentaje.toFixed(1)}%`.padStart(7, ' ');
          console.log(`│ ${num}│ ${fase} │ ${ms} │ ${seg} │ ${porcentaje} │`);
        });
        
        console.log('└──┴─────────────────────────────────────────────┴──────────┴──────────┴─────────┘\n');

        // Resumen por categorías
        console.log('📈 RESUMEN POR CATEGORÍAS:\n');
        
        const categorias = {
          'I/O (Decodificación)': ordenados.filter(t => t.fase.includes('Decodificación')),
          'Análisis de Ritmo': ordenados.filter(t => t.fase.includes('ritmo') || t.fase.includes('Análisis ritmo')),
          'Análisis Tonal': ordenados.filter(t => t.fase.includes('tonalidad')),
          'Métricas y Cálculos': ordenados.filter(t => t.fase.includes('métricas') || t.fase.includes('Cálculo')),
          'Post-procesamiento': ordenados.filter(t => t.fase.includes('cue points') || t.fase.includes('Finalización')),
          'Essentia Avanzado': ordenados.filter(t => t.fase.includes('avanzado') || t.fase.includes('Preparación'))
        };

        Object.entries(categorias).forEach(([nombre, fases]) => {
          if (fases.length > 0) {
            const totalMs = fases.reduce((sum, f) => sum + f.duracion_ms, 0);
            const porcentaje = (totalMs / tiempoTotal) * 100;
            console.log(`   ${nombre.padEnd(25, ' ')}: ${(totalMs / 1000).toFixed(3)}s (${porcentaje.toFixed(1)}%)`);
          }
        });

        console.log('');

        // Identificar cuellos de botella
        const criticalThreshold = 10; // 10% o más se considera relevante
        const cuellos = ordenados.filter(t => t.porcentaje >= criticalThreshold);
        
        if (cuellos.length > 0) {
          console.log('⚠️  FASES RELEVANTES (≥10% del tiempo total):\n');
          cuellos.forEach((t, index) => {
            const icon = t.porcentaje >= 50 ? '🚨' : t.porcentaje >= 25 ? '⚠️' : 'ℹ️';
            console.log(`   ${icon} ${index + 1}. ${t.fase}`);
            console.log(`      ${(t.duracion_ms / 1000).toFixed(3)}s (${t.porcentaje.toFixed(1)}%)`);
          });
          console.log('');
        }

        // Fases rápidas (< 1% pero importantes)
        const rapidas = ordenados.filter(t => t.porcentaje < 1 && t.porcentaje > 0);
        if (rapidas.length > 0) {
          console.log('⚡ FASES ULTRA-RÁPIDAS (<1%):\n');
          rapidas.forEach((t) => {
            console.log(`   ✓ ${t.fase}: ${t.duracion_ms.toFixed(0)}ms`);
          });
          console.log('');
        }

        // Velocidad de procesamiento
        const duracionAudioSegundos = 207; // Ajustar según la canción
        const velocidadProcesamiento = duracionAudioSegundos / (tiempoTotal / 1000);
        console.log(`🎵 VELOCIDAD DE PROCESAMIENTO:\n`);
        console.log(`   Audio: ${duracionAudioSegundos}s`);
        console.log(`   Análisis: ${(tiempoTotal / 1000).toFixed(3)}s`);
        console.log(`   Ratio: ${velocidadProcesamiento.toFixed(1)}x en tiempo real`);
        console.log(`   (Puedes analizar ${velocidadProcesamiento.toFixed(1)} canciones por cada 1 que se reproduce)\n`);

        console.log(`${'='.repeat(80)}\n`);
      }, 300000); // 5 min timeout

      it('completa el análisis', () => {
        expect(tiempos.length).toBeGreaterThan(0);
        expect(tiempoTotal).toBeGreaterThan(0);
      });

      it('identifica fases principales', () => {
        const fasesEsperadas = [
          'Decodificación',
          'ritmo',
          'tonalidad'
        ];

        fasesEsperadas.forEach(faseEsperada => {
          const existe = tiempos.some(t => 
            t.fase.toLowerCase().includes(faseEsperada.toLowerCase())
          );
          expect(existe, `Debería existir la fase: ${faseEsperada}`).toBe(true);
        });
      });

      it('todas las fases suman aproximadamente el tiempo total', () => {
        const sumaFases = tiempos.reduce((sum, t) => sum + t.duracion_ms, 0);
        const diferencia = Math.abs(sumaFases - tiempoTotal);
        const margenError = tiempoTotal * 0.15; // 15% de margen
        
        expect(diferencia).toBeLessThan(margenError);
      });
    });
  });
});
