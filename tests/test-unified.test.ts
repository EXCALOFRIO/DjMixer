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

    it('extrae todas las métricas', () => {
      console.log(`BPM: ${result.bpm} vs ${song.spotify.bpm}`);
      console.log(`Tonalidad: ${result.tonalidad_camelot} vs ${song.spotify.key}`);
      console.log(`Energía: ${(result.energia*100).toFixed(0)}% vs ${song.spotify.energy}%`);
      console.log(`Bailabilidad: ${(result.bailabilidad*100).toFixed(0)}% vs ${song.spotify.dance}%`);
      console.log(`Loudness: ${result.loudness.integrated.toFixed(1)} vs ${song.spotify.loudness} dB`);
      console.log(`Danceability: ${result.ritmo_avanzado.danceability.toFixed(2)}`);
      console.log(`Dynamic Complexity: ${result.ritmo_avanzado.dynamic_complexity.toFixed(2)}`);
      console.log(`Key: ${result.tonal_avanzado.key} (${(result.tonal_avanzado.key_strength*100).toFixed(0)}%)`);
      console.log(`Spectral Centroid: ${result.espectral.spectral_centroid.toFixed(0)} Hz`);
      console.log(`Brightness: ${(result.timbre.brightness*100).toFixed(0)}%`);
      console.log(`Warmth: ${(result.timbre.warmth*100).toFixed(0)}%`);
      expect(result).toBeDefined();
    });
  });
});
