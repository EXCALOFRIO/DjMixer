/**
 * PathFinder Engine - Algoritmo A* para encontrar la mejor ruta de mezcla
 * 
 * Optimizaciones:
 * 1. Pre-filtrado: Solo considera los mejores N puntos por canción
 * 2. Poda: Descarta rutas que no pueden mejorar la mejor encontrada
 * 3. Heurística: Estima el potencial de una ruta parcial
 * 4. Cache: Guarda transiciones ya calculadas
 */

import type { Song } from '../types';
import { SmartTransitionEngine, SmartTransitionPoint, TransitionCandidate } from './SmartTransitionEngine';

interface PathNode {
    songIndex: number;
    pointIndex: number;
    point: SmartTransitionPoint;
    gCost: number;           // Costo real acumulado
    hCost: number;           // Costo estimado hasta el final
    fCost: number;           // gCost + hCost
    parent: PathNode | null;
    songsVisited: Set<number>;
    depth: number;
}

interface BestPath {
    nodes: PathNode[];
    totalScore: number;
    transitions: TransitionCandidate[];
}

export class PathFinderEngine {
    private engine: SmartTransitionEngine;
    private songs: Song[];
    private allPoints: Map<number, SmartTransitionPoint[]> = new Map(); // songIndex -> points
    private transitionCache: Map<string, TransitionCandidate> = new Map();
    
    // Configuración - MODO ULTRA EXHAUSTIVO V2.4 - MÁXIMA EXPLORACIÓN
    private readonly MAX_POINTS_PER_SONG = 50;      // Top 50 puntos por canción (MUCHAS más opciones)
    private readonly MAX_ITERATIONS = 5000000;       // 5M iteraciones (exploración masiva)
    private readonly BEAM_WIDTH = 5000;              // Mantener 5000 mejores rutas (búsqueda MUY amplia)
    private readonly MIN_POINT_SCORE = 60;           // Score mínimo MUY permisivo (incluir más candidatos)
    private readonly NEIGHBORS_PER_SONG = 25;        // Explorar 25 mejores puntos por canción (máximas conexiones)
    
    // NUEVO V2.3: Protección de memoria para bibliotecas grandes
    private readonly MAX_MEMORY_NODES = 10000;       // Límite absoluto de nodos en memoria
    private readonly BEAM_WIDTH_REDUCTION_DEPTH = 5; // Reducir beam width después de N saltos

    // NUEVO: Sistema de logging detallado
    private detailedLog: {
        allPointsDetected: Map<number, SmartTransitionPoint[]>;
        transitionsEvaluated: Array<{
            from: { song: string; point: SmartTransitionPoint };
            to: { song: string; point: SmartTransitionPoint };
            score: number;
            breakdown: any;
            selected: boolean;
        }>;
        searchStats: {
            iterations: number;
            nodesExplored: number;
            pathsFound: number;
            timeElapsed: number;
        };
    } = {
        allPointsDetected: new Map(),
        transitionsEvaluated: [],
        searchStats: {
            iterations: 0,
            nodesExplored: 0,
            pathsFound: 0,
            timeElapsed: 0
        }
    };

    constructor(songs: Song[]) {
        this.songs = songs;
        this.engine = new SmartTransitionEngine(songs);
    }

    /**
     * Pre-procesar: Encontrar los mejores puntos de cada canción
     */
    async preprocessPoints(): Promise<void> {
        console.log('🔍 Pre-procesando puntos de transición...');
        
        for (let i = 0; i < this.songs.length; i++) {
            const song = this.songs[i];
            const allPoints = this.engine.findAllTransitionPoints(song, i);
            
            // GUARDAR TODOS los puntos detectados para el log
            this.detailedLog.allPointsDetected.set(i, allPoints);
            
            // Filtrar solo los mejores puntos
            const bestPoints = allPoints
                .filter(p => p.score >= this.MIN_POINT_SCORE)
                .slice(0, this.MAX_POINTS_PER_SONG);
            
            this.allPoints.set(i, bestPoints);
            
            console.log(`   ${song.name}: ${bestPoints.length} puntos seleccionados (de ${allPoints.length} detectados, ${song.analysis.beats.length} beats totales)`);
        }

        const totalPoints = Array.from(this.allPoints.values())
            .reduce((sum, points) => sum + points.length, 0);
        
        console.log(`✅ Total: ${totalPoints} puntos de alta calidad`);
    }

    /**
     * Encontrar múltiples rutas buenas (no solo la mejor)
     */
    async findBestPaths(
        startSongIndex: number = 0,
        targetSongs: number = this.songs.length,
        numPaths: number = 5,
        onProgress?: (progress: number, bestScore: number, pathsFound: number) => void
    ): Promise<BestPath[]> {
        console.log('\n🎯 Buscando las mejores rutas con A* exhaustivo...');
        console.log(`   Canciones objetivo: ${targetSongs}`);
        console.log(`   Rutas a encontrar: ${numPaths}`);
        console.log(`   Puntos totales: ${this.getTotalPoints()}`);
        console.log(`   Combinaciones posibles: ~${this.estimateCombinations()}`);

        const startTime = Date.now();
        let iterations = 0;
        const bestPaths: BestPath[] = [];
        const pathSignatures = new Set<string>(); // Para evitar rutas duplicadas

        // Lista abierta
        const openList: PathNode[] = [];
        
        // Crear nodos iniciales
        const startPoints = this.allPoints.get(startSongIndex) || [];
        for (let i = 0; i < startPoints.length; i++) {
            const point = startPoints[i];
            const node: PathNode = {
                songIndex: startSongIndex,
                pointIndex: i,
                point,
                gCost: 0,
                hCost: this.estimateRemainingCost(startSongIndex, targetSongs),
                fCost: 0,
                parent: null,
                songsVisited: new Set([startSongIndex]),
                depth: 0
            };
            node.fCost = node.gCost + node.hCost;
            openList.push(node);
        }

        openList.sort((a, b) => b.fCost - a.fCost);

        while (openList.length > 0 && iterations < this.MAX_ITERATIONS && bestPaths.length < numPaths) {
            iterations++;

            // Progreso cada 1000 iteraciones (con info de memoria)
            if (iterations % 1000 === 0) {
                if (onProgress) {
                    const progress = Math.min(100, (iterations / this.MAX_ITERATIONS) * 100);
                    const bestScore = bestPaths.length > 0 ? bestPaths[0].totalScore : 0;
                    onProgress(progress, bestScore, bestPaths.length);
                }
                
                // Log de memoria cada 10K iteraciones
                if (iterations % 10000 === 0) {
                    const memoryMB = (openList.length * 500) / 1024 / 1024; // Estimación ~500 bytes por nodo
                    console.log(`   📊 Iter: ${iterations.toLocaleString()} | Nodos: ${openList.length} | Mem: ~${memoryMB.toFixed(1)}MB`);
                }
            }

            // CRÍTICO: .shift() toma el PRIMER elemento (mejor score)
            // El array está ordenado descendente, así que el primero es el mejor
            const current = openList.shift()!;

            // ¿Llegamos al objetivo?
            if (current.songsVisited.size >= targetSongs) {
                const path = this.reconstructPath(current);
                const signature = this.getPathSignature(path);

                // Evitar rutas duplicadas
                if (!pathSignatures.has(signature)) {
                    pathSignatures.add(signature);
                    bestPaths.push(path);
                    bestPaths.sort((a, b) => b.totalScore - a.totalScore);
                    
                    console.log(`   🎉 Ruta ${bestPaths.length}/${numPaths}: ${path.totalScore.toFixed(0)} puntos (iter: ${iterations})`);
                    
                    // V2.4: NO terminar inmediatamente, seguir explorando
                    // Explorar al menos 10,000 iteraciones o hasta encontrar 3 rutas
                    // Esto asegura que exploramos muchas más opciones
                    if (iterations < 10000 && bestPaths.length < 3) {
                        // Continuar buscando más rutas
                    }
                }

                continue;
            }

            // Expandir vecinos
            const neighbors = this.getNeighbors(current, targetSongs);

            for (const neighbor of neighbors) {
                const transition = this.getOrCalculateTransition(current.point, neighbor.point);
                
                const gCost = current.gCost + transition.totalScore;
                const hCost = this.estimateRemainingCost(neighbor.songIndex, targetSongs - neighbor.songsVisited.size);
                const fCost = gCost + hCost;

                // V2.4: Poda MUY permisiva para explorar muchas más rutas
                // Permitir rutas que sean al menos 40% del mejor score (antes 75%)
                if (bestPaths.length > 0 && fCost < bestPaths[bestPaths.length - 1].totalScore * 0.40) {
                    continue;
                }

                neighbor.gCost = gCost;
                neighbor.hCost = hCost;
                neighbor.fCost = fCost;
                neighbor.parent = current;

                openList.push(neighbor);
            }

            // Beam Search con ancho dinámico (protección de memoria)
            const currentDepth = current.depth;
            const dynamicBeamWidth = this.getDynamicBeamWidth(currentDepth, targetSongs);
            
            if (openList.length > dynamicBeamWidth) {
                openList.sort((a, b) => b.fCost - a.fCost);
                openList.length = dynamicBeamWidth;
            }
            
            // Protección adicional: límite absoluto de nodos
            if (openList.length > this.MAX_MEMORY_NODES) {
                console.warn(`⚠️ Límite de memoria alcanzado (${this.MAX_MEMORY_NODES} nodos), reduciendo...`);
                openList.sort((a, b) => b.fCost - a.fCost);
                openList.length = Math.floor(this.MAX_MEMORY_NODES * 0.8);
            }
        }

        const elapsed = (Date.now() - startTime) / 1000;
        
        // Guardar estadísticas
        this.detailedLog.searchStats.iterations = iterations;
        this.detailedLog.searchStats.pathsFound = bestPaths.length;
        this.detailedLog.searchStats.timeElapsed = elapsed;
        this.detailedLog.searchStats.nodesExplored = iterations; // Aproximación
        
        // 📊 MOSTRAR ESTADÍSTICAS ULTRA DETALLADAS
        console.log(`\n${'═'.repeat(80)}`);
        console.log(`🎯 ESTADÍSTICAS DE BÚSQUEDA A*`);
        console.log(`${'═'.repeat(80)}`);
        console.log(`⏱️  Tiempo: ${elapsed.toFixed(2)}s`);
        console.log(`🔄 Iteraciones: ${iterations.toLocaleString()}`);
        console.log(`🔥 Transiciones calculadas: ${this.transitionsCalculated.toLocaleString()}`);
        console.log(`📊 Transiciones/segundo: ${(this.transitionsCalculated / elapsed).toFixed(0)}`);
        console.log(`🎵 Rutas encontradas: ${bestPaths.length}`);
        console.log(`⭐ Mejor score: ${bestPaths[0]?.totalScore.toFixed(0) || 0}`);
        
        // Mostrar estadísticas de puntos por canción
        console.log(`\n📍 PUNTOS DE TRANSICIÓN POR CANCIÓN:`);
        for (const [songIndex, points] of this.allPoints) {
            const song = this.songs[songIndex];
            console.log(`   ${song.name}: ${points.length} puntos`);
            
            // Mostrar los 3 mejores puntos de cada canción
            const top3 = points.slice(0, 3);
            top3.forEach((p, i) => {
                console.log(`      ${i + 1}. ${p.reason} (score: ${p.score.toFixed(0)}, ${p.time.toFixed(1)}s)`);
            });
        }
        
        // Mostrar las mejores transiciones evaluadas
        console.log(`\n🔝 TOP 10 TRANSICIONES EVALUADAS:`);
        const topTransitions = [...this.detailedLog.transitionsEvaluated]
            .sort((a, b) => b.score - a.score)
            .slice(0, 10);
        
        topTransitions.forEach((t, i) => {
            console.log(`\n   ${i + 1}. ${t.from.song} → ${t.to.song} (${t.score.toFixed(0)} pts)`);
            console.log(`      De: ${t.from.point.reason} (${t.from.point.time.toFixed(1)}s)`);
            console.log(`      A: ${t.to.point.reason} (${t.to.point.time.toFixed(1)}s)`);
            console.log(`      Breakdown:`);
            console.log(`         Calidad puntos: ${t.breakdown.pointQuality.toFixed(0)}`);
            console.log(`         Estructura: ${t.breakdown.structure.toFixed(0)}`);
            console.log(`         Armonía: ${t.breakdown.harmony.toFixed(0)}`);
            console.log(`         Energía: ${t.breakdown.energy.toFixed(0)}`);
            console.log(`         Mood: ${t.breakdown.mood.toFixed(0)}`);
            console.log(`         Variedad: ${t.breakdown.variety.toFixed(0)}`);
            console.log(`         Gemini: ${t.breakdown.gemini.toFixed(0)}`);
        });
        
        console.log(`\n${'═'.repeat(80)}\n`);

        return bestPaths;
    }

    /**
     * Encontrar la mejor ruta usando A* modificado
     */
    async findBestPath(
        startSongIndex: number = 0,
        targetSongs: number = this.songs.length,
        onProgress?: (progress: number, bestScore: number) => void
    ): Promise<BestPath> {
        // Resetear contador de transiciones
        this.transitionsCalculated = 0;
        
        const paths = await this.findBestPaths(
            startSongIndex,
            targetSongs,
            1,
            onProgress ? (p, s, _) => onProgress(p, s) : undefined
        );
        
        if (paths.length === 0) {
            throw new Error('No se encontró ninguna ruta válida');
        }
        
        return paths[0];
    }

    /**
     * Generar firma única de una ruta (para evitar duplicados)
     */
    private getPathSignature(path: BestPath): string {
        return path.nodes.map(n => `${n.songIndex}-${n.pointIndex}`).join('|');
    }

    /**
     * LEGACY: Método antiguo mantenido por compatibilidad
     * Ahora usa los mismos parámetros exhaustivos que findBestPath
     * @deprecated Usar findBestPath() en su lugar
     */
    async findBestPathFast(
        startSongIndex: number = 0,
        targetSongs: number = this.songs.length,
        onProgress?: (progress: number, bestScore: number) => void
    ): Promise<BestPath> {
        console.log('\n🎯 Buscando mejor ruta con A*...');
        console.log(`   Canciones objetivo: ${targetSongs}`);
        console.log(`   Puntos totales: ${this.getTotalPoints()}`);
        console.log(`   Combinaciones posibles: ~${this.estimateCombinations()}`);

        const startTime = Date.now();
        let iterations = 0;
        let bestPath: BestPath | null = null;
        let bestScore = -Infinity;

        // Lista abierta (priority queue simulada con array ordenado)
        const openList: PathNode[] = [];
        
        // Crear nodos iniciales (todos los puntos de la primera canción)
        const startPoints = this.allPoints.get(startSongIndex) || [];
        for (let i = 0; i < startPoints.length; i++) {
            const point = startPoints[i];
            const node: PathNode = {
                songIndex: startSongIndex,
                pointIndex: i,
                point,
                gCost: 0,
                hCost: this.estimateRemainingCost(startSongIndex, targetSongs),
                fCost: 0,
                parent: null,
                songsVisited: new Set([startSongIndex]),
                depth: 0
            };
            node.fCost = node.gCost + node.hCost;
            openList.push(node);
        }

        // Ordenar por fCost DESCENDENTE (mayor primero)
        // Esto permite usar .shift() para tomar el mejor
        openList.sort((a, b) => b.fCost - a.fCost);

        while (openList.length > 0 && iterations < this.MAX_ITERATIONS) {
            iterations++;

            // Progreso cada 1000 iteraciones (con info de memoria)
            if (iterations % 1000 === 0) {
                if (onProgress) {
                    const progress = Math.min(100, (iterations / this.MAX_ITERATIONS) * 100);
                    onProgress(progress, bestScore);
                }
                
                // Log de memoria cada 10K iteraciones
                if (iterations % 10000 === 0) {
                    const memoryMB = (openList.length * 500) / 1024 / 1024; // Estimación ~500 bytes por nodo
                    console.log(`   📊 Iter: ${iterations.toLocaleString()} | Nodos: ${openList.length} | Mem: ~${memoryMB.toFixed(1)}MB | Best: ${bestScore.toFixed(0)}`);
                }
            }

            // CRÍTICO: .shift() toma el PRIMER elemento (mejor score)
            // El array está ordenado descendente, así que el primero es el mejor
            const current = openList.shift()!;

            // ¿Llegamos al objetivo?
            if (current.songsVisited.size >= targetSongs) {
                const path = this.reconstructPath(current);
                const score = current.gCost;

                if (score > bestScore) {
                    bestScore = score;
                    bestPath = path;
                    console.log(`   🎉 Nueva mejor ruta: ${score.toFixed(0)} puntos (${path.nodes.length} saltos)`);
                }

                // Continuar buscando mejores rutas
                continue;
            }

            // Expandir vecinos (todas las canciones no visitadas)
            const neighbors = this.getNeighbors(current, targetSongs);

            for (const neighbor of neighbors) {
                // Calcular transición
                const transition = this.getOrCalculateTransition(current.point, neighbor.point);
                
                // Calcular costos
                const gCost = current.gCost + transition.totalScore;
                const hCost = this.estimateRemainingCost(neighbor.songIndex, targetSongs - neighbor.songsVisited.size);
                const fCost = gCost + hCost;

                // V2.4: Poda EXTREMADAMENTE permisiva para explorar MUCHAS más rutas
                // Permitir rutas que sean al menos 30% del mejor score
                // Esto permite explorar caminos que parecen malos al principio pero mejoran después
                if (bestPath && fCost < bestScore * 0.30) {
                    continue;
                }

                neighbor.gCost = gCost;
                neighbor.hCost = hCost;
                neighbor.fCost = fCost;
                neighbor.parent = current;

                openList.push(neighbor);
            }

            // Mantener solo las mejores rutas (Beam Search con ancho dinámico)
            const currentDepth = current.depth;
            const dynamicBeamWidth = this.getDynamicBeamWidth(currentDepth, targetSongs);
            
            if (openList.length > dynamicBeamWidth) {
                openList.sort((a, b) => b.fCost - a.fCost);
                openList.length = dynamicBeamWidth;
            }
            
            // Protección adicional: límite absoluto de nodos
            if (openList.length > this.MAX_MEMORY_NODES) {
                console.warn(`⚠️ Límite de memoria alcanzado (${this.MAX_MEMORY_NODES} nodos), reduciendo...`);
                openList.sort((a, b) => b.fCost - a.fCost);
                openList.length = Math.floor(this.MAX_MEMORY_NODES * 0.8);
            }
        }

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`\n✅ Búsqueda completada en ${elapsed}s`);
        console.log(`   Iteraciones: ${iterations.toLocaleString()}`);
        console.log(`   🔥 Transiciones calculadas (SIN CACHÉ): ${this.transitionsCalculated.toLocaleString()}`);
        console.log(`   Mejor score: ${bestScore.toFixed(0)}`);

        if (!bestPath) {
            throw new Error('No se encontró ninguna ruta válida');
        }

        return bestPath;
    }

    /**
     * NUEVO V2.3: Calcular beam width dinámico basado en profundidad
     * Reduce el ancho de búsqueda a medida que avanza para controlar memoria
     */
    private getDynamicBeamWidth(depth: number, totalSongs: number): number {
        // Para bibliotecas pequeñas (< 20 canciones), usar beam width completo
        if (totalSongs < 20) {
            return this.BEAM_WIDTH;
        }
        
        // Para bibliotecas grandes, reducir progresivamente
        if (depth < this.BEAM_WIDTH_REDUCTION_DEPTH) {
            return this.BEAM_WIDTH;
        }
        
        // Reducir 20% por cada 5 niveles de profundidad adicionales
        const reductionFactor = Math.pow(0.8, Math.floor((depth - this.BEAM_WIDTH_REDUCTION_DEPTH) / 5));
        const dynamicWidth = Math.floor(this.BEAM_WIDTH * reductionFactor);
        
        // Nunca bajar de 500 (mínimo para mantener calidad)
        return Math.max(500, dynamicWidth);
    }

    /**
     * Obtener vecinos (puntos de canciones no visitadas)
     */
    private getNeighbors(current: PathNode, targetSongs: number): PathNode[] {
        const neighbors: PathNode[] = [];

        // Para cada canción no visitada
        for (let songIndex = 0; songIndex < this.songs.length; songIndex++) {
            if (current.songsVisited.has(songIndex)) continue;
            if (current.songsVisited.size >= targetSongs) continue;

            const points = this.allPoints.get(songIndex) || [];

            // Tomar los mejores N puntos de cada canción
            const topPoints = points.slice(0, this.NEIGHBORS_PER_SONG);

            for (let i = 0; i < topPoints.length; i++) {
                const point = topPoints[i];
                
                const neighbor: PathNode = {
                    songIndex,
                    pointIndex: i,
                    point,
                    gCost: 0,
                    hCost: 0,
                    fCost: 0,
                    parent: null,
                    songsVisited: new Set([...current.songsVisited, songIndex]),
                    depth: current.depth + 1
                };

                neighbors.push(neighbor);
            }
        }

        return neighbors;
    }

    // Contador de transiciones calculadas (sin caché)
    private transitionsCalculated = 0;

    /**
     * Obtener o calcular transición (SIN CACHÉ - V2.4)
     * Calcula SIEMPRE de nuevo para explorar más variedad
     * V2.2: Registra transiciones estructurales
     */
    private getOrCalculateTransition(from: SmartTransitionPoint, to: SmartTransitionPoint, logIt: boolean = false): TransitionCandidate {
        // V2.4: DESHABILITADO EL CACHÉ - Calcular siempre de nuevo
        // Esto permite explorar más variedad y diferentes combinaciones cada vez
        this.transitionsCalculated++;
        
        const transition = this.engine.calculateTransitionScore(from, to);
        
        // 📊 LOGGING ULTRA DETALLADO: Guardar TODAS las transiciones evaluadas
        this.detailedLog.transitionsEvaluated.push({
            from: {
                song: this.songs[from.songIndex].name,
                point: from
            },
            to: {
                song: this.songs[to.songIndex].name,
                point: to
            },
            score: transition.totalScore,
            breakdown: transition.breakdown,
            selected: false // Se marcará después si es seleccionada
        });
        
        return transition;
    }

    /**
     * NUEVO V2.2: Aplicar transición y registrar en historial estructural
     */
    applyTransition(transition: TransitionCandidate): void {
        this.engine.recordStructuralTransition(transition.from, transition.to);
        this.engine.markSegmentAsUsed(transition.to.songIndex, transition.to.beatIndex);
    }

    /**
     * Heurística: Estimar el costo restante (MEJORADA V2.1)
     */
    private estimateRemainingCost(currentSongIndex: number, songsRemaining: number): number {
        if (songsRemaining <= 0) return 0;

        // Estimación más realista basada en calidad de puntos disponibles
        let avgScore = 0;
        let count = 0;

        // Calcular score promedio de los mejores puntos disponibles
        for (const [songIndex, points] of this.allPoints) {
            if (points.length > 0) {
                avgScore += points[0].score; // Mejor punto de cada canción
                count++;
            }
        }

        const avgBestPoint = count > 0 ? avgScore / count : 150;
        const avgTransition = avgBestPoint * 2 + 800; // Puntos + otros factores
        
        return avgTransition * songsRemaining;
    }

    /**
     * Reconstruir el camino desde un nodo final
     */
    private reconstructPath(endNode: PathNode): BestPath {
        const nodes: PathNode[] = [];
        const transitions: TransitionCandidate[] = [];
        
        let current: PathNode | null = endNode;
        
        // Reconstruir hacia atrás
        while (current) {
            nodes.unshift(current);
            
            if (current.parent) {
                const transition = this.getOrCalculateTransition(current.parent.point, current.point);
                transitions.unshift(transition);
                
                // 🎯 Marcar esta transición como SELECCIONADA en el log
                const fromSong = this.songs[current.parent.point.songIndex].name;
                const toSong = this.songs[current.point.songIndex].name;
                
                // Buscar y marcar en el log
                for (const logEntry of this.detailedLog.transitionsEvaluated) {
                    if (logEntry.from.song === fromSong && 
                        logEntry.to.song === toSong &&
                        Math.abs(logEntry.from.point.time - current.parent.point.time) < 0.1 &&
                        Math.abs(logEntry.to.point.time - current.point.time) < 0.1) {
                        logEntry.selected = true;
                        break;
                    }
                }
            }
            
            current = current.parent;
        }

        return {
            nodes,
            totalScore: endNode.gCost,
            transitions
        };
    }

    /**
     * Estadísticas
     */
    private getTotalPoints(): number {
        return Array.from(this.allPoints.values())
            .reduce((sum, points) => sum + points.length, 0);
    }

    private estimateCombinations(): string {
        const avgPointsPerSong = this.getTotalPoints() / this.songs.length;
        const combinations = Math.pow(avgPointsPerSong, this.songs.length);
        
        if (combinations > 1e12) return `${(combinations / 1e12).toFixed(1)}T`;
        if (combinations > 1e9) return `${(combinations / 1e9).toFixed(1)}B`;
        if (combinations > 1e6) return `${(combinations / 1e6).toFixed(1)}M`;
        if (combinations > 1e3) return `${(combinations / 1e3).toFixed(1)}K`;
        
        return combinations.toFixed(0);
    }

    /**
     * Limpiar cache
     */
    clearCache(): void {
        this.transitionCache.clear();
        this.engine.reset();
    }
    
    /**
     * 📊 Obtener log detallado de la búsqueda
     */
    getDetailedLog() {
        return this.detailedLog;
    }
    
    /**
     * 📊 Mostrar resumen de transiciones seleccionadas vs evaluadas
     */
    showTransitionSummary(): void {
        const selected = this.detailedLog.transitionsEvaluated.filter(t => t.selected);
        const total = this.detailedLog.transitionsEvaluated.length;
        
        console.log(`\n${'═'.repeat(80)}`);
        console.log(`🎯 RUTA FINAL SELECCIONADA`);
        console.log(`${'═'.repeat(80)}`);
        console.log(`📊 Transiciones evaluadas: ${total.toLocaleString()}`);
        console.log(`✅ Transiciones seleccionadas: ${selected.length}`);
        console.log(`📈 Ratio de selección: ${((selected.length / total) * 100).toFixed(4)}%`);
        
        console.log(`\n🎵 SECUENCIA DE TRANSICIONES:`);
        selected.forEach((t, i) => {
            console.log(`\n   ${i + 1}. ${t.from.song} → ${t.to.song}`);
            console.log(`      Score: ${t.score.toFixed(0)} puntos`);
            console.log(`      De: ${t.from.point.reason} (${t.from.point.time.toFixed(1)}s)`);
            console.log(`      A: ${t.to.point.reason} (${t.to.point.time.toFixed(1)}s)`);
            console.log(`      Breakdown: Calidad=${t.breakdown.pointQuality.toFixed(0)} | Estructura=${t.breakdown.structure.toFixed(0)} | Armonía=${t.breakdown.harmony.toFixed(0)} | Energía=${t.breakdown.energy.toFixed(0)}`);
        });
        
        console.log(`\n${'═'.repeat(80)}\n`);
    }

    /**
     * Obtener estadísticas del cache
     */
    getCacheStats(): { size: number; hitRate: number } {
        return {
            size: this.transitionCache.size,
            hitRate: 0 // TODO: implementar contador de hits
        };
    }

    /**
     * NUEVO: Exportar análisis ultra detallado
     */
    exportDetailedAnalysis(selectedPath: BestPath): string {
        const lines: string[] = [];
        const width = 120;

        lines.push('═'.repeat(width));
        lines.push('ANÁLISIS ULTRA DETALLADO - AURA LOOP A* V2.1');
        lines.push('═'.repeat(width));
        lines.push('');
        lines.push(`Fecha: ${new Date().toLocaleString()}`);
        lines.push(`Canciones: ${this.songs.length}`);
        lines.push('');

        // SECCIÓN 1: TODOS LOS PUNTOS DETECTADOS
        lines.push('═'.repeat(width));
        lines.push('SECCIÓN 1: TODOS LOS PUNTOS DE TRANSICIÓN DETECTADOS');
        lines.push('═'.repeat(width));
        lines.push('');

        for (let i = 0; i < this.songs.length; i++) {
            const song = this.songs[i];
            const allPoints = this.detailedLog.allPointsDetected.get(i) || [];
            const selectedPoints = this.allPoints.get(i) || [];

            lines.push(`▼ CANCIÓN ${i + 1}: ${song.name}`);
            lines.push(`   Duración: ${song.duration.toFixed(1)}s | Tempo: ${song.analysis.track.tempo.toFixed(1)} BPM`);
            lines.push(`   Puntos detectados: ${allPoints.length} | Puntos seleccionados: ${selectedPoints.length}`);
            lines.push('');

            // Mostrar TODOS los puntos (incluso los rechazados)
            allPoints.forEach((point, idx) => {
                const isSelected = selectedPoints.some(p => p.beatIndex === point.beatIndex);
                const marker = isSelected ? '✓ SELECCIONADO' : '  Rechazado';
                const quality = point.quality === 'excellent' ? '⭐⭐⭐' :
                               point.quality === 'good' ? '⭐⭐' : '⭐';

                lines.push(`   ${marker} [${idx + 1}/${allPoints.length}]`);
                lines.push(`      Tiempo: ${point.time.toFixed(2)}s | Beat: ${point.beatIndex}`);
                lines.push(`      Score: ${point.score.toFixed(0)} pts | Calidad: ${point.quality} ${quality}`);
                lines.push(`      Posición: ${point.position} | Tipo: ${point.transitionType}`);
                lines.push(`      Razón: ${point.reason}`);
                lines.push('');
            });

            lines.push('─'.repeat(width));
            lines.push('');
        }

        // SECCIÓN 2: TRANSICIONES EVALUADAS
        lines.push('═'.repeat(width));
        lines.push('SECCIÓN 2: TRANSICIONES EVALUADAS DURANTE LA BÚSQUEDA');
        lines.push('═'.repeat(width));
        lines.push('');
        lines.push(`Total de transiciones evaluadas: ${this.detailedLog.transitionsEvaluated.length}`);
        lines.push(`Transiciones en caché: ${this.transitionCache.size}`);
        lines.push('');

        // Marcar las transiciones seleccionadas
        const selectedTransitions = new Set<string>();
        for (let i = 0; i < selectedPath.transitions.length; i++) {
            const t = selectedPath.transitions[i];
            const key = `${t.from.songIndex}-${t.from.beatIndex}-${t.to.songIndex}-${t.to.beatIndex}`;
            selectedTransitions.add(key);
        }

        // Ordenar por score (mejores primero)
        const sortedTransitions = [...this.detailedLog.transitionsEvaluated]
            .sort((a, b) => b.score - a.score);

        // Mostrar top 100 transiciones evaluadas
        const topTransitions = sortedTransitions.slice(0, 100);
        lines.push(`Mostrando top 100 transiciones (de ${sortedTransitions.length} evaluadas):`);
        lines.push('');

        topTransitions.forEach((trans, idx) => {
            const key = `${trans.from.point.songIndex}-${trans.from.point.beatIndex}-${trans.to.point.songIndex}-${trans.to.point.beatIndex}`;
            const isSelected = selectedTransitions.has(key);
            const marker = isSelected ? '✓✓✓ SELECCIONADA' : `    #${idx + 1}`;

            lines.push(`${marker}`);
            lines.push(`   ${trans.from.song} → ${trans.to.song}`);
            lines.push(`   Score total: ${trans.score.toFixed(0)} pts`);
            lines.push(`   Breakdown:`);
            lines.push(`      - Calidad de puntos: ${trans.breakdown.pointQuality.toFixed(0)} pts`);
            lines.push(`      - Estructura: ${trans.breakdown.structure.toFixed(0)} pts`);
            lines.push(`      - Armonía: ${trans.breakdown.harmony.toFixed(0)} pts`);
            lines.push(`      - Energía: ${trans.breakdown.energy.toFixed(0)} pts`);
            lines.push(`      - Mood: ${trans.breakdown.mood.toFixed(0)} pts`);
            lines.push(`      - Gemini: ${trans.breakdown.gemini.toFixed(0)} pts`);
            lines.push(`      - Variedad: ${trans.breakdown.variety.toFixed(0)} pts`);
            lines.push(`   Desde: ${trans.from.point.time.toFixed(2)}s (${trans.from.point.reason})`);
            lines.push(`   Hasta: ${trans.to.point.time.toFixed(2)}s (${trans.to.point.reason})`);
            lines.push('');
        });

        // SECCIÓN 3: RUTA SELECCIONADA
        lines.push('═'.repeat(width));
        lines.push('SECCIÓN 3: RUTA SELECCIONADA (MEJOR ENCONTRADA)');
        lines.push('═'.repeat(width));
        lines.push('');
        lines.push(`Score total: ${selectedPath.totalScore.toFixed(0)} pts`);
        lines.push(`Número de saltos: ${selectedPath.transitions.length}`);
        lines.push(`Canciones visitadas: ${selectedPath.nodes.length}`);
        lines.push('');

        selectedPath.transitions.forEach((trans, idx) => {
            lines.push(`▼ SALTO ${idx + 1}/${selectedPath.transitions.length}`);
            lines.push(`   ${this.songs[trans.from.songIndex].name} → ${this.songs[trans.to.songIndex].name}`);
            lines.push(`   Score: ${trans.totalScore.toFixed(0)} pts`);
            lines.push(`   Tipo: ${trans.from.transitionType} | Duración: ${trans.crossfadeDuration}s`);
            lines.push(`   Playback rate: ${(trans.playbackRate * 100).toFixed(1)}%`);
            lines.push(`   Breakdown detallado:`);
            lines.push(`      - Calidad de puntos: ${trans.breakdown.pointQuality.toFixed(0)} pts (x2.0 peso)`);
            lines.push(`      - Estructura: ${trans.breakdown.structure.toFixed(0)} pts`);
            lines.push(`      - Armonía: ${trans.breakdown.harmony.toFixed(0)} pts`);
            lines.push(`      - Energía: ${trans.breakdown.energy.toFixed(0)} pts`);
            lines.push(`      - Mood: ${trans.breakdown.mood.toFixed(0)} pts`);
            lines.push(`      - Gemini: ${trans.breakdown.gemini.toFixed(0)} pts`);
            lines.push(`      - Variedad: ${trans.breakdown.variety.toFixed(0)} pts`);
            lines.push('');
        });

        // SECCIÓN 4: ESTADÍSTICAS DE BÚSQUEDA
        lines.push('═'.repeat(width));
        lines.push('SECCIÓN 4: ESTADÍSTICAS DE BÚSQUEDA A*');
        lines.push('═'.repeat(width));
        lines.push('');
        lines.push(`Iteraciones: ${this.detailedLog.searchStats.iterations.toLocaleString()}`);
        lines.push(`Nodos explorados: ${this.detailedLog.searchStats.nodesExplored.toLocaleString()}`);
        lines.push(`Rutas encontradas: ${this.detailedLog.searchStats.pathsFound}`);
        lines.push(`Tiempo total: ${this.detailedLog.searchStats.timeElapsed.toFixed(2)}s`);
        lines.push(`Transiciones evaluadas: ${this.detailedLog.transitionsEvaluated.length.toLocaleString()}`);
        lines.push(`Transiciones en caché: ${this.transitionCache.size.toLocaleString()}`);
        lines.push('');

        // SECCIÓN 5: CONFIGURACIÓN
        lines.push('═'.repeat(width));
        lines.push('SECCIÓN 5: CONFIGURACIÓN DEL ALGORITMO');
        lines.push('═'.repeat(width));
        lines.push('');
        lines.push(`MAX_POINTS_PER_SONG: ${this.MAX_POINTS_PER_SONG}`);
        lines.push(`MAX_ITERATIONS: ${this.MAX_ITERATIONS.toLocaleString()}`);
        lines.push(`BEAM_WIDTH: ${this.BEAM_WIDTH}`);
        lines.push(`MIN_POINT_SCORE: ${this.MIN_POINT_SCORE}`);
        lines.push(`NEIGHBORS_PER_SONG: ${this.NEIGHBORS_PER_SONG}`);
        lines.push('');

        lines.push('═'.repeat(width));
        lines.push('FIN DEL ANÁLISIS ULTRA DETALLADO');
        lines.push('═'.repeat(width));

        return lines.join('\n');
    }
}
