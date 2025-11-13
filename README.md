# 🎵 DJ Mixer - Sistema de Análisis Musical con IA

Sistema profesional de análisis de audio que utiliza **Gemini 2.5 Flash** para análisis profundo de canciones, con almacenamiento en **PostgreSQL (Neon)** y reproductor optimizado.

## ✨ Características

### 🎯 Análisis Técnico Automático
- **BPM Detection**: Detección precisa de tempo
- **Tonalidad Camelot**: Sistema de notación para mezclas armónicas
- **Energía y Bailabilidad**: Métricas calculadas del audio
- **Downbeats**: Timestamps de cada compás para sincronización perfecta

### 🤖 Análisis con Gemini AI
- **Transcripción de Letras**: Palabra por palabra con timestamps
- **Estructura Musical**: Identificación de intro, verso, estribillo, puente, etc.
- **Análisis Lírico**: Tema principal, palabras clave, evolución emocional
- **Eventos Clave DJ**: Caídas de bajo, breaks, cambios rítmicos

### ⚡ Reproductor Optimizado
- **Precarga Inteligente**: Buffer de 1-2 minutos automático
- **Navegación Fluida**: Avance/retroceso entre canciones
- **Visualización Moderna**: Anillos de progreso interactivos
- **Caché en BD**: Evita análisis duplicados

### 🚀 Procesamiento Paralelo
- **Límite de Concurrencia**: Máximo 5 peticiones simultáneas a Gemini
- **Cola Inteligente**: Procesa múltiples canciones eficientemente
- **Progreso en Tiempo Real**: Actualización del progreso de análisis
- **Manejo de Errores**: Continúa procesando aunque algunas canciones fallen

## 🚀 Inicio Rápido

### 1. Instalar Dependencias

```bash
npm install
```

### 2. Configurar Variables de Entorno

Edita el archivo `.env` con tus credenciales:

```env
# Gemini API Key - https://aistudio.google.com/app/apikey
NEXT_PUBLIC_GEMINI_API_KEY=tu_api_key_aqui

# Neon Database - https://console.neon.tech/
DATABASE_URL=postgresql://usuario:password@host/database?sslmode=require
```

### 3. Inicializar Base de Datos

```bash
npm run db:init
```

Deberías ver:
```
✅ Tabla "canciones_analizadas" creada exitosamente
📊 Columnas: 15
🔑 Índices creados: 12
✨ ¡Base de datos lista para usar!
```

### 4. Ejecutar Tests (Opcional)

```bash
npm test
```

### 5. Iniciar Aplicación

```bash
npm run dev
```

Abre: http://localhost:9002

## 🎯 Uso

### Subir y Analizar Canciones

1. **Arrastra archivos** MP3/WAV a la interfaz
2. **El análisis se procesa en el servidor** (30-60 segundos por canción)
3. **Verás notificaciones** con BPM y energía detectados
4. **Las canciones analizadas se guardan en la BD** para acceso instantáneo futuro

### Ver Análisis Completo

- **Haz clic en el ícono ℹ️** junto al título de la canción
- Explora metadatos técnicos, análisis de contenido, estructura musical y eventos clave

### Controles del Reproductor

- **Doble clic izquierda**: Retroceder 5 segundos
- **Doble clic derecha**: Avanzar 5 segundos
- **Clic centro**: Play/Pause
- **Anillo**: Arrastrar para buscar en la canción

## 🗄️ Estructura de la Base de Datos

### Tabla: `canciones_analizadas`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID | Identificador único |
| `hash_archivo` | VARCHAR(256) | Hash SHA-256 para deduplicación |
| `titulo` | TEXT | Título de la canción |
| `artista` | TEXT | Artista(s) |
| `duracion_ms` | INTEGER | Duración en milisegundos |
| `bpm` | FLOAT | Beats por minuto |
| `tonalidad_camelot` | VARCHAR(3) | Tonalidad (ej: "8A", "10B") |
| `energia` | FLOAT | 0.0 - 1.0 |
| `bailabilidad` | FLOAT | 0.0 - 1.0 |
| `animo_general` | VARCHAR(50) | Estado de ánimo |
| `downbeats_ts_ms` | JSONB | Array de timestamps |
| `letras_ts` | JSONB | Transcripción con timestamps |
| `estructura_ts` | JSONB | Secciones musicales |
| `analisis_contenido` | JSONB | Análisis lírico y eventos DJ |
| `fecha_procesado` | TIMESTAMPTZ | Fecha de análisis |

## 🧪 Tests

El proyecto incluye tests completos para verificar:

- ✅ Detección de BPM
- ✅ Cálculo de energía y bailabilidad
- ✅ Detección de downbeats
- ✅ Análisis de tonalidad
- ✅ Integración con Gemini
- ✅ Operaciones de base de datos

Ejecutar tests:
```bash
npm test
```

## 🏗️ Arquitectura

### Cliente (Navegador)
- Interfaz de usuario con Next.js 15
- Reproductor de audio con Web Audio API
- Extracción de metadatos con music-metadata-browser
- Visualización de análisis

### Servidor (API Routes)
- Análisis de audio con music-tempo
- Integración con Gemini 2.5 Flash
- Almacenamiento en Neon PostgreSQL
- Caché inteligente con hash SHA-256

### Flujo de Análisis
```
Usuario sube archivo → API /analyze → Análisis técnico → Gemini AI → Base de datos → Cliente
```

## 📊 Tecnologías

- **Next.js 15** - Framework React con API Routes
- **Gemini 2.5 Flash** - Análisis de audio con IA
- **Neon PostgreSQL** - Base de datos serverless
- **music-metadata-browser** - Extracción de metadatos
- **music-tempo** - Detección de BPM
- **Web Audio API** - Procesamiento de audio
- **Vitest** - Framework de testing

## 🧪 Suite de Tests

**39 tests pasando al 100%**

### Audio Analysis (13 tests)
- Detección de BPM para diferentes tempos
- Cálculo de energía y bailabilidad
- Detección de downbeats
- Conversión de tonalidad a Camelot
- Validaciones de rangos

### Database (14 tests)
- Validación de estructuras de datos
- Constraints de base de datos
- Serialización/deserialización JSONB
- Queries de búsqueda comunes

### Concurrency Queue (12 tests)
- Límite de concurrencia (máx 5 simultáneas)
- Manejo de errores sin detener procesamiento
- Reporte de progreso en tiempo real
- Simulación de análisis masivo (20 canciones)

```bash
npm test              # Ejecutar todos los tests
npm run test:watch    # Modo watch
npm run test:ui       # Interfaz visual
```

## 🔧 Scripts Disponibles

```bash
npm run dev          # Iniciar servidor de desarrollo
npm run build        # Compilar para producción
npm run start        # Iniciar servidor de producción
npm run db:init      # Inicializar base de datos
npm test             # Ejecutar tests
npm run typecheck    # Verificar tipos TypeScript
```

## 📝 Notas Importantes

- **Límites de Gemini**: 1M tokens de contexto, 9.5 horas de audio máximo
- **Formatos Soportados**: MP3, WAV, AIFF, AAC, OGG, FLAC
- **Tamaño Máximo**: 20 MB por request directo
- **Tokens de Audio**: 32 tokens por segundo de audio

## 🐛 Solución de Problemas

### Error: "DATABASE_URL no está definida"
- Verifica que `.env` existe y tiene la variable configurada

### Error: "Failed to fetch from Gemini"
- Verifica tu API key en https://aistudio.google.com/app/apikey
- Revisa los límites de tu cuenta

### Error: "Cannot connect to database"
- Verifica la connection string de Neon
- Asegúrate de que el proyecto está activo en https://console.neon.tech/

## 📄 Licencia

Este proyecto utiliza:
- Gemini API (Google)
- Neon PostgreSQL
- music-metadata-browser (MIT)
- music-tempo (MIT)

---

**Desarrollado con ❤️ para DJs y amantes de la música**
