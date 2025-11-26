
// Tipos de estrategias de mezcla para saber CÓMO mezclar
export type CueStrategy =
    | 'INTRO_SIMPLE'      // Entrada limpia en intro/hueco instrumental
    | 'DROP_SWAP'         // Swap en drop/caída de bajo (con build-up)
    | 'IMPACT_ENTRY'      // Entrada directa en drop (sin build-up, corte seco)
    | 'OUTRO_FADE'        // Fade out clásico en outro
    | 'BREAKDOWN_ENTRY'   // Entrada en breakdown/melodía
    | 'LOOP_ANCHOR'       // Punto de anclaje para loops
    | 'EVENT_SYNC';       // Sincronización con evento DJ

// Tipos de curva de crossfade para el reproductor
export type CrossfadeCurve =
    | 'LINEAR'            // Fade lineal estándar
    | 'BASS_SWAP'         // Swap de bajos (cortar bajos de A al entrar B)
    | 'CUT'               // Corte seco sin crossfade
    | 'POWER_MIX';        // Mezcla con ambos tracks a volumen alto

export type VocalType =
    | 'NONE'               // Instrumental puro
    | 'MELODIC_VOCAL'      // Verso/Estribillo (PELIGRO DE CHOQUE)
    | 'RHYTHMIC_CHANT';    // "Pla pla pla", "Put your hands up" (PERMISIVO)

export type FrequencyFocus =
    | 'LOW'    // Dominado por el bajo (Drop)
    | 'MID'    // Dominado por voces/sintetizadores
    | 'HIGH'   // Hi-hats, percusión ligera (Intro/Outro)
    | 'FULL';  // Espectro completo

export interface CuePoint {
    trackId: string;
    hash: string;
    title: string;
    pointMs: number;
    type: 'IN' | 'OUT';
    strategy: CueStrategy;
    score: number;

    // Metadatos cruciales para la transición
    safeDurationMs: number;    // Cuánto tiempo limpio tenemos
    hasVocalOverlap: boolean;  // Si choca con voces
    alignedToPhrase: boolean;  // Si cae en un inicio de frase exacto
    alignedToBar: boolean;     // Si cae en inicio de compás (4 beats)
    alignedTo8BarGrid: boolean; // Si cae en bloque de 8 compases (32 beats)
    eventLink?: string;        // Link a evento DJ si aplica
    sectionType?: string;      // Tipo de sección musical
    suggestedCurve?: CrossfadeCurve; // Curva recomendada para esta entrada/salida

    // Nuevos campos para God Level Mixing
    vocalType: VocalType;       // ¿Qué tipo de voz hay AQUÍ?
    freqFocus: FrequencyFocus;  // ¿Qué frecuencias dominan?

    // Campos para Loops
    isLoopable?: boolean;      // ¿Podemos activar un loop aquí?
    loopLengthMs?: number;     // Longitud del loop (ej: 2000ms para 4 beats a 120BPM)
    loopType?: '1_BAR' | '4_BAR' | '8_BAR' | 'NONE';
}
