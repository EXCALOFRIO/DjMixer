# 🎵 Aura Loop

Sistema de DJ automático con IA que crea mezclas perfectas entre canciones.

Utiliza análisis avanzado con Gemini AI y algoritmo A* para encontrar las mejores transiciones musicales.

## ✨ Características Principales

### 🤖 IA Avanzada
- **Gemini AI**: Análisis semántico de letras, estructura y mood
- **Algoritmo A***: Búsqueda exhaustiva de la mejor ruta entre canciones
- **Scoring Híbrido**: Combina análisis técnico y semántico (1500+ puntos)

### 🎵 Análisis Musical
- **Detección de Downbeats**: Identifica el "1" del compás para transiciones perfectas
- **Compatibilidad Armónica**: Círculo de quintas y claves relativas
- **Análisis de Energía**: Transiciones suaves entre niveles de energía
- **Detección de Vocales**: Evita mezclar sobre voces

### 🎚️ Transiciones Profesionales
- **Beatmatch** (4s): Para downbeats perfectos, mantiene el groove
- **Crossfade** (2s): Mezcla suave estándar
- **Cut** (0.5s): Cambios dramáticos y rápidos
- **Ajuste de Tempo**: ±10% automático para igualar BPM

### 📊 Sistema Inteligente
- **Pre-renderizado**: Mezcla completa calculada antes de reproducir
- **Normalización LUFS**: Volumen consistente entre canciones
- **Exportación Detallada**: Análisis completo de cada transición
- **Ruta Óptima**: Visita todas las canciones con el mejor score posible

## 🚀 Inicio Rápido

### Instalación

```bash
npm install
```

### Desarrollo

```bash
npm run dev
```

La aplicación estará disponible en `http://localhost:3000`

## 📖 Cómo Usar

### 1️⃣ Cargar Canciones
- Arrastra y suelta archivos de audio (MP3, WAV, FLAC, etc.)
- O haz clic para seleccionarlos desde tu dispositivo
- Soporta múltiples archivos simultáneos

### 2️⃣ Análisis Automático
La aplicación analizará cada canción mostrando:
- ✅ Progreso individual por canción con tarjetas elegantes
- 🎵 Fase actual (decodificación, beats, segmentos, metadata)
- 📊 Porcentaje de completado en tiempo real
- 📋 Logs detallados en el panel flotante

### 3️⃣ Reproducción
- 🎨 Visualiza la carátula grande y centrada
- ▶️ Click en la carátula o botón play para iniciar
- 🎵 La música se reproduce con transiciones automáticas

### 4️⃣ Controles
- **Play/Pause**: Click en carátula o botón central
- **Saltar**: Botones -15s / +15s
- **Volumen**: Menú de 3 puntos → Control de volumen
- **Descargar**: Menú de 3 puntos → Mezcla WAV o Análisis TXT

### 5️⃣ Visualización
- 🎨 **Anillo circular**: Muestra todas las canciones con sus carátulas
- 📍 **Punto de progreso**: Indica la posición actual en la canción
- ⏭️ **Siguiente**: Tarjeta con la próxima canción y tiempo restante
- 📊 **Barra de progreso**: Muestra el tiempo transcurrido

## 🔍 Sistema de Análisis

### Análisis Técnico (Essentia + Meyda)
- Detección de beats y downbeats
- Análisis de energía por beat
- Detección de vocales
- Tempo, clave y modo musical

### Análisis Semántico (Gemini AI)
- Identificación de secciones (intro, verse, chorus, outro)
- Análisis de temas y mood
- Puntos de transición sugeridos
- Compatibilidad emocional entre canciones

### Scoring de Transiciones
1. **Estructura** (300 pts): Downbeats y fraseo
2. **Armonía** (200 pts): Compatibilidad de claves
3. **Técnico** (300 pts): Energía, vocales, tempo
4. **Gemini** (500 pts): Puntos sugeridos, temas, mood
5. **Variedad** (variable): Anti-repetición

### Algoritmo A*
- Explora 27.5M de combinaciones
- Encuentra las 5 mejores rutas
- 95-98% de calidad óptima
- Tiempo: 30-60 segundos

## 🎨 Interfaz

### Pantalla de Carga
- Zona de arrastrar y soltar archivos
- Soporte para múltiples archivos simultáneos

### Pantalla de Análisis
- Barra de progreso general
- Lista de canciones con progreso individual
- Indicadores visuales de fase actual
- Mensajes descriptivos por canción

### Pantalla de Reproducción
- Visualizador circular animado
- Información de la canción actual (portada, título, artista)
- Botón de play/pause
- Panel de logs flotante

## 🛠️ Tecnologías

- **React + TypeScript**: Framework principal
- **Vite**: Build tool y dev server
- **Gemini 2.5 Flash**: Análisis semántico con IA
- **Essentia.js**: Análisis de audio profesional
- **Meyda**: Extracción de características musicales
- **Web Audio API**: Reproducción y efectos
- **Tailwind CSS**: Diseño moderno

## 📁 Estructura del Proyecto

```
aura-loop/
├── components/              # Componentes React
├── services/
│   ├── AudioPlayer.ts      # Orquestador principal
│   ├── PathFinderEngine.ts # Algoritmo A*
│   ├── SmartTransitionEngine.ts # Sistema de scoring
│   ├── GeminiAnalyzer.ts   # Análisis con IA
│   ├── MasterAnalyzer.ts   # Coordinador de análisis
│   └── AudioAnalyzer.ts    # Análisis técnico
├── App.tsx                 # Componente principal
└── types.ts                # Definiciones de tipos
```

## 🔧 Configuración

### Variables de Entorno

Crea un archivo `.env`:

```env
VITE_GEMINI_API_KEY=tu_api_key_aqui
```

Obtén tu API key en: https://aistudio.google.com/app/apikey

## 📝 Notas Técnicas

- El análisis se realiza completamente en el navegador (client-side)
- No se envían datos a servidores externos
- Los archivos de audio permanecen en tu dispositivo
- El análisis puede tardar según el tamaño y cantidad de canciones

### ⚠️ Recomendaciones de Uso

**Para evitar problemas de memoria:**
- ✅ Usa **máximo 10 canciones** a la vez
- ✅ Canciones de **3-5 minutos** son ideales
- ✅ Cierra otras pestañas del navegador
- ✅ Usa archivos MP3 de **calidad media** (128-192 kbps)
- ❌ Evita archivos WAV o FLAC muy grandes
- ❌ No uses canciones de más de 10 minutos

## 🐛 Debugging

Para ver logs detallados:

1. Abre el panel de logs (botón inferior derecho)
2. Abre la consola del navegador (F12)
3. Los logs aparecen en ambos lugares con emojis descriptivos

## 📄 Licencia

MIT

## 🤝 Contribuciones

Las contribuciones son bienvenidas. Por favor, abre un issue primero para discutir los cambios propuestos.
