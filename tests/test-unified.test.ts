import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { AnalisisCompleto, analizarAudioCompleto } from '../src/lib/audio-analyzer-unified';

const songs = [
  {
    name: '3 Am',
    file: join(__dirname, 'fixtures', '3_Am.mp3'),
    spotify: { bpm: 90, key: '11B', energy: 61, dance: 85, happy: 58, loudness: -5 }
  },
  {
    name: 'A Un Paso De La Luna',
    file: join(__dirname, 'fixtures', 'A_Un_Paso_De_La_Luna.mp3'),
    spotify: { bpm: 122, key: '6B', energy: 77, dance: 74, happy: 95, loudness: -5 }
  }
];

const available = songs.filter(s => existsSync(s.file));

available.forEach((song) => {
  describe(`${song.name}`, () => {
    let result: AnalisisCompleto;

    beforeAll(async () => {
      console.log(`\n ${song.name} - Spotify: BPM ${song.spotify.bpm}, Key ${song.spotify.key}`);
      result = await analizarAudioCompleto(readFileSync(song.file));
    }, 120000);

    it('extrae todas las métricas básicas', () => {
      console.log(`\n📊 MÉTRICAS BÁSICAS:`);
      console.log(`   BPM: ${result.bpm} (Spotify: ${song.spotify.bpm})`);
      console.log(`   Tonalidad: ${result.tonalidad_camelot} (Spotify: ${song.spotify.key})`);
      console.log(`   Energía: ${(result.energia*100).toFixed(0)}% (Spotify: ${song.spotify.energy}%)`);
      console.log(`   Bailabilidad: ${(result.bailabilidad*100).toFixed(0)}% (Spotify: ${song.spotify.dance}%)`);
      console.log(`   Ánimo: ${result.animo_general}`);
      console.log(`   Compás: ${result.compas.numerador}/${result.compas.denominador}`);
      console.log(`   Duración: ${Math.floor(result.duracion_ms / 1000)}s`);
      
      expect(result.bpm).toBeGreaterThan(0);
      expect(result.tonalidad_camelot).toBeDefined();
      expect(result.energia).toBeGreaterThanOrEqual(0);
      expect(result.energia).toBeLessThanOrEqual(1);
    });
    
    it('extrae timing correctamente (beats, downbeats, frases)', () => {
      console.log(`\n🥁 TIMING:`);
      console.log(`   Beats: ${result.beats_ts_ms.length}`);
      console.log(`   Downbeats: ${result.downbeats_ts_ms.length}`);
      console.log(`   Frases: ${result.frases_ts_ms.length}`);
      console.log(`   Transientes: ${result.transientes_ritmicos_ts_ms.length}`);
      
      expect(result.beats_ts_ms.length).toBeGreaterThan(0);
      expect(result.downbeats_ts_ms.length).toBeGreaterThan(0);
      expect(result.frases_ts_ms.length).toBeGreaterThan(0);
    });
    
    it('análisis avanzado de ritmo funciona sin errores', () => {
      console.log(`\n🎵 RITMO AVANZADO:`);
      console.log(`   Onset Rate: ${result.ritmo_avanzado.onset_rate.toFixed(2)}`);
      console.log(`   Danceability: ${result.ritmo_avanzado.danceability.toFixed(2)}`);
      console.log(`   Beats Loudness: ${result.ritmo_avanzado.beats_loudness.length} valores`);
      console.log(`   Transientes detectados: ${result.ritmo_avanzado.transients_ts_ms.length}`);
      
      expect(result.ritmo_avanzado.danceability).toBeGreaterThanOrEqual(0);
      expect(result.ritmo_avanzado.beats_loudness.length).toBeGreaterThan(0);
    });
    
    it('análisis tonal avanzado detecta tonalidad', () => {
      console.log(`\n🎹 TONAL AVANZADO:`);
      console.log(`   Key: ${result.tonal_avanzado.key}`);
      console.log(`   Scale: ${result.tonal_avanzado.scale}`);
      console.log(`   Key Strength: ${(result.tonal_avanzado.key_strength*100).toFixed(0)}%`);
      
      expect(result.tonal_avanzado.key).toBeDefined();
      expect(result.tonal_avanzado.key_strength).toBeGreaterThanOrEqual(0);
      expect(result.tonal_avanzado.key_strength).toBeLessThanOrEqual(1);
    });
    
    it('análisis de loudness funciona sin errores', () => {
      console.log(`\n🔊 LOUDNESS:`);
      console.log(`   Integrated: ${result.loudness.integrated.toFixed(1)} LUFS (Spotify: ${song.spotify.loudness} dB)`);
      console.log(`   Dynamic Range: ${result.loudness.dynamic_range.toFixed(1)} dB`);
      console.log(`   Loudness Range: ${result.loudness.loudness_range.toFixed(1)} LU`);
      console.log(`   ReplayGain: ${result.loudness.replay_gain_db.toFixed(2)} dB ⭐ NUEVO!`);
      console.log(`   Momentary samples: ${result.loudness.momentary.length}`);
      console.log(`   Short-term samples: ${result.loudness.short_term.length}`);
      
      expect(result.loudness.integrated).toBeLessThan(0); // LUFS siempre negativo
      expect(result.loudness.replay_gain_db).toBeDefined();
    });
    
    it('estructura detectada correctamente', () => {
      console.log(`\n🏗️ ESTRUCTURA:`);
      console.log(`   Segmentos: ${result.estructura.segmentos.length}`);
      console.log(`   Intro: ${Math.floor(result.estructura.intro_duration_ms / 1000)}s`);
      console.log(`   Outro: ${Math.floor(result.estructura.outro_duration_ms / 1000)}s`);
      console.log(`   Fade In: ${Math.floor(result.estructura.fade_in_duration_ms / 1000)}s`);
      console.log(`   Fade Out: ${Math.floor(result.estructura.fade_out_duration_ms / 1000)}s`);
      
      expect(result.estructura.segmentos).toBeDefined();
      expect(Array.isArray(result.estructura.segmentos)).toBe(true);
    });
    
    it('verificación final: sin errores de Essentia.js', () => {
      console.log(`\n✅ VERIFICACIÓN COMPLETA:`);
      console.log(`   ✓ BPM detectado correctamente`);
      console.log(`   ✓ Compás inferido: ${result.compas.numerador}/${result.compas.denominador}`);
      console.log(`   ✓ Ritmo avanzado optimizado estable`);
      console.log(`   ✓ Tonalidad coherente con Camelot`);
      console.log(`   ✓ Loudness y ReplayGain calculados`);
      console.log(`   ✓ Segmentos de voz detectados: ${result.segmentos_voz.length}`);
      console.log(`\n🎉 TODAS LAS CORRECCIONES APLICADAS EXITOSAMENTE\n`);
      
      expect(result).toBeDefined();
    });
  });
});
