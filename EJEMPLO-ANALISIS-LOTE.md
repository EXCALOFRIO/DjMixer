# 📊 Análisis de Audio por Lotes - Documentación

## 🎯 Nueva Funcionalidad: Procesamiento Paralelo

Se ha implementado la función `analizarAudiosEnLote()` que permite procesar **hasta 10 canciones simultáneamente**, respetando el límite de Gemini de 10 peticiones por minuto.

## 📦 Uso Básico

### Importar la Función

```typescript
import { analizarAudiosEnLote } from '@/lib/audio-analyzer-unified';
```

### Ejemplo Simple

```typescript
// Array de canciones a analizar
const canciones = [
  { id: 'cancion1', buffer: buffer1 },
  { id: 'cancion2', buffer: buffer2 },
  { id: 'cancion3', buffer: buffer3 },
  // ... hasta 100 canciones
];

// Analizar todas (se procesarán de 10 en 10)
const resultados = await analizarAudiosEnLote(canciones);

// Ver resultados
resultados.forEach(({ id, analisis, error }) => {
  if (error) {
    console.error(`❌ ${id}: ${error}`);
  } else {
    console.log(`✅ ${id}: BPM ${analisis.bpm}, Tonalidad ${analisis.tonalidad_camelot}`);
  }
});
```

## 📊 Ejemplo con Callback de Progreso

```typescript
const resultados = await analizarAudiosEnLote(
  canciones,
  (completados, total, resultado) => {
    // Actualizar UI con progreso
    const porcentaje = (completados / total) * 100;
    console.log(`🎵 Progreso: ${completados}/${total} (${porcentaje.toFixed(1)}%)`);
    console.log(`   ✅ ${resultado.id}: BPM ${resultado.analisis.bpm}`);
    
    // Ejemplo: Actualizar barra de progreso en UI
    // setProgress(porcentaje);
    // addResultado(resultado);
  }
);
```

## 🔧 Ejemplo con Configuración Personalizada

```typescript
const canciones = [
  { 
    id: 'cancion1', 
    buffer: buffer1,
    config: {
      normalize: { targetLUFS: -14 },
      disable: { djCues: false }
    }
  },
  { 
    id: 'cancion2', 
    buffer: buffer2,
    config: {
      disable: { tonalidad: true } // Saltar detección de tonalidad
    }
  },
];

const resultados = await analizarAudiosEnLote(canciones);
```

## 🚀 Integración con API Route

### Ejemplo: Endpoint para Análisis Masivo

```typescript
// src/app/api/analyze-batch/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { analizarAudiosEnLote } from '@/lib/audio-analyzer-unified';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];
    
    if (files.length === 0) {
      return NextResponse.json({ error: 'No se proporcionaron archivos' }, { status: 400 });
    }

    // Convertir archivos a buffers
    const canciones = await Promise.all(
      files.map(async (file, index) => ({
        id: file.name,
        buffer: Buffer.from(await file.arrayBuffer())
      }))
    );

    // Analizar en lotes de 10
    const resultados = await analizarAudiosEnLote(
      canciones,
      (completados, total, resultado) => {
        console.log(`📊 ${completados}/${total}: ${resultado.id} completado`);
      }
    );

    // Guardar resultados en BD, etc.
    // ...

    return NextResponse.json({
      success: true,
      total: resultados.length,
      exitosos: resultados.filter(r => !r.error).length,
      fallidos: resultados.filter(r => r.error).length,
      resultados
    });
  } catch (error) {
    console.error('Error en análisis por lotes:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error desconocido' },
      { status: 500 }
    );
  }
}
```

## 📈 Características

### ✅ Ventajas

- **Paralelización**: Procesa hasta 10 canciones simultáneamente
- **Control de Concurrencia**: Respeta límites de API (10 req/min de Gemini)
- **Callback de Progreso**: Actualización en tiempo real
- **Manejo de Errores**: Continúa aunque fallen algunas canciones
- **Logs Detallados**: Información de progreso por lotes

### 📊 Rendimiento

- **1-10 canciones**: Procesamiento paralelo inmediato
- **11-100 canciones**: Procesamiento en lotes de 10 (delay 1s entre lotes)
- **100+ canciones**: Procesamiento escalonado con control de memoria

### ⚡ Tiempos Estimados

| Canciones | Duración Promedio | Tiempo Total Estimado |
|-----------|-------------------|----------------------|
| 10        | ~30s por canción  | ~30-40s total        |
| 50        | ~30s por canción  | ~3-4 minutos         |
| 100       | ~30s por canción  | ~6-8 minutos         |

## 🛠️ Funciones Disponibles

### `analizarAudiosEnLote()`

```typescript
analizarAudiosEnLote(
  buffers: Array<{
    id: string;
    buffer: Buffer;
    config?: AnalisisConfig;
  }>,
  onProgress?: (
    completados: number,
    total: number,
    resultado: { id: string; analisis: AnalisisCompleto }
  ) => void
): Promise<Array<{
  id: string;
  analisis: AnalisisCompleto;
  error?: string;
}>>
```

**Parámetros:**
- `buffers`: Array de objetos con `id`, `buffer` y opcionalmente `config`
- `onProgress`: Callback opcional para seguimiento del progreso

**Retorna:**
- Array de resultados con `id`, `analisis` y opcionalmente `error`

### `analizarAudioCompleto()` (existente)

Para análisis individual, sigue disponible:

```typescript
const analisis = await analizarAudioCompleto(buffer, config);
```

## 🔄 Migración desde Análisis Individual

### Antes (Análisis Secuencial)

```typescript
// ❌ LENTO: Procesa una por una
for (const cancion of canciones) {
  const analisis = await analizarAudioCompleto(cancion.buffer);
  // procesar resultado...
}
```

### Después (Análisis por Lotes)

```typescript
// ✅ RÁPIDO: Procesa 10 en paralelo
const resultados = await analizarAudiosEnLote(
  canciones.map(c => ({ id: c.nombre, buffer: c.buffer }))
);
```

## 📝 Notas Importantes

1. **Límite de Gemini**: La función respeta automáticamente el límite de 10 peticiones/minuto
2. **Memoria**: Para archivos grandes (>50MB cada uno), considera procesar en grupos más pequeños
3. **Timeout**: El análisis de cada canción puede tomar 20-60 segundos dependiendo de la duración
4. **Errores**: Los errores individuales no detienen el procesamiento completo
5. **Logs**: Cada lote y canción registra su progreso en la consola

## 🎯 Casos de Uso

- **Importación Masiva**: Analizar biblioteca completa de DJ
- **Playlist Automation**: Análisis automático de nuevas canciones
- **Batch Processing**: Procesamiento nocturno de archivos
- **Music Discovery**: Análisis de colección para recomendaciones
