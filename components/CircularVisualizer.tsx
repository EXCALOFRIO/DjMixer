
import React, { useMemo, useRef, useEffect } from 'react';
import * as d3 from 'd3';
import type { Song, PlaybackState, Jump } from '../types';

interface CircularVisualizerProps {
    songs: Song[];
    playbackState: PlaybackState | null;
    lastJump: Jump | null;
    size: number;
    songOrder: number[]; // Orden de las canciones según la ruta planificada
}

const getPointOnCircle = (angle: number, radius: number): { x: number, y: number } => {
    return {
        x: radius * Math.cos(angle - Math.PI / 2),
        y: radius * Math.sin(angle - Math.PI / 2),
    };
};

const CircularVisualizer: React.FC<CircularVisualizerProps> = ({ songs, playbackState, lastJump, size, songOrder }) => {
    const jumpPathsRef = useRef<SVGGElement>(null);

    // Ampliar el aro MÁS allá del 100% - overflow visible lo permite
    const outerRadius = (size / 2) * 1.05; // Usar 105% del espacio (se sale un poco pero se ve)
    // Aro más grueso tanto en desktop como en móvil
    const ringThickness = size > 500 ? 35 : 25; // 35px en desktop, 25px en móvil
    const innerRadius = outerRadius - ringThickness;

    const pieData = useMemo(() => {
        // Si tenemos un orden específico, reordenar las canciones
        const orderedSongs = songOrder.length > 0
            ? songOrder.map(index => songs[index]).filter(Boolean)
            : songs;

        const totalDuration = orderedSongs.reduce((sum, song) => sum + song.duration, 0);
        if (totalDuration === 0) return [];

        const pie = d3.pie().value((d: any) => d.duration).sort(null);
        return pie(orderedSongs as any);
    }, [songs, songOrder]);

    const arcGenerator = d3.arc()
        .innerRadius(innerRadius)
        .outerRadius(outerRadius)
        .cornerRadius(6); // Esquinas suaves para aro estrecho

    const progressAngle = useMemo(() => {
        if (!playbackState || pieData.length === 0) return 0;

        // Encontrar el índice en el orden de la canción actual
        const orderedIndex = songOrder.length > 0
            ? songOrder.indexOf(playbackState.currentSongIndex)
            : playbackState.currentSongIndex;

        if (orderedIndex === -1) return 0;

        const songData = pieData[orderedIndex];
        if (!songData) return 0;

        const songProgress = playbackState.currentBeat.start / songs[playbackState.currentSongIndex].duration;
        const songAngleRange = songData.endAngle - songData.startAngle;

        return songData.startAngle + (songProgress * songAngleRange);
    }, [playbackState, pieData, songs, songOrder]);

    useEffect(() => {
        if (lastJump && jumpPathsRef.current) {
            const group = d3.select(jumpPathsRef.current);

            const chordGenerator = d3.ribbon()
                .sourceRadius(innerRadius - 5)
                .targetRadius(innerRadius - 5)
                .startAngle(d => d.startAngle)
                .endAngle(d => d.endAngle);

            const fromAngle = pieData[lastJump.from.songIndex].startAngle + (lastJump.from.beatIndex / songs[lastJump.from.songIndex].analysis.beats.length) * (pieData[lastJump.from.songIndex].endAngle - pieData[lastJump.from.songIndex].startAngle);
            const toAngle = pieData[lastJump.to.songIndex].startAngle + (lastJump.to.beatIndex / songs[lastJump.to.songIndex].analysis.beats.length) * (pieData[lastJump.to.songIndex].endAngle - pieData[lastJump.to.songIndex].startAngle);

            const path = group.append('path')
                .datum({
                    source: { startAngle: fromAngle, endAngle: fromAngle + 0.01 },
                    target: { startAngle: toAngle, endAngle: toAngle + 0.01 }
                })
                .attr('d', chordGenerator)
                .attr('fill', 'url(#jumpGradient)')
                .style('opacity', 0.8);

            path.transition()
                .duration(1500)
                .style('opacity', 0)
                .remove();
        }
    }, [lastJump, pieData, songs, innerRadius]);

    const progressIndicatorPos = getPointOnCircle(progressAngle, (innerRadius + outerRadius) / 2);

    return (
        <svg
            width={size}
            height={size}
            viewBox={`${-size / 2 - 50} ${-size / 2 - 50} ${size + 100} ${size + 100}`}
            className="transition-all duration-500"
            style={{ overflow: 'visible' }}
        >
            <defs>
                {/* --- NUEVO: Gradientes para cada canción --- */}
                {songs.map((song, i) => (
                    <radialGradient key={`grad-${song.id}`} id={`gradient-${i}`}>
                        <stop offset="0%" stopColor={song.color} stopOpacity="1" />
                        <stop offset="100%" stopColor={song.color} stopOpacity="0.6" />
                    </radialGradient>
                ))}
                <radialGradient id="jumpGradient">
                    <stop offset="0%" stopColor="rgba(255,255,255,0.7)" />
                    <stop offset="100%" stopColor="rgba(255,255,255,0)" />
                </radialGradient>
                <clipPath id="circle-clip">
                    <circle cx="0" cy="0" r="50" />
                </clipPath>
            </defs>

            {/* Arcos de colores con gradientes */}
            <g>
                {pieData.map((d: any, i) => {
                    const orderedSongs = songOrder.length > 0
                        ? songOrder.map(index => songs[index]).filter(Boolean)
                        : songs;
                    const song = orderedSongs[i];
                    const originalIndex = songOrder.length > 0 ? songOrder[i] : i;
                    const isActive = playbackState?.currentSongIndex === originalIndex;
                    return (
                        <path
                            key={song.id}
                            d={arcGenerator(d) || ''}
                            fill={`url(#gradient-${originalIndex})`}
                            className="transition-all duration-500"
                            style={{
                                opacity: isActive ? 1 : 0.5,
                                filter: isActive ? `drop-shadow(0 0 20px ${song.color})` : 'none'
                            }}
                        />
                    );
                })}
            </g>



            {/* VISUALIZACIÓN MINIMALISTA DE ESTRUCTURA */}
            <g className="structure-visualization">
                {playbackState && songs[playbackState.currentSongIndex].analysis.advanced?.structure && (() => {
                    const currentSong = songs[playbackState.currentSongIndex];
                    const songData = pieData[playbackState.currentSongIndex];
                    const structure = currentSong.analysis.advanced.structure;
                    const totalBeats = currentSong.analysis.beats.length;
                    const angleRange = songData.endAngle - songData.startAngle;

                    // Función helper para convertir beat index a ángulo
                    const beatToAngle = (beatIndex: number) => {
                        return songData.startAngle + (beatIndex / totalBeats) * angleRange;
                    };

                    const waveRadius = innerRadius - 25;

                    return (
                        <>
                            {/* ONDA DE ENERGÍA SUAVE - Solo línea continua */}
                            <path
                                d={(() => {
                                    const points = currentSong.analysis.advanced.energyPerBeat
                                        .map((energy, beatIndex) => {
                                            const angle = beatToAngle(beatIndex);
                                            const radius = waveRadius - (energy * 40);
                                            const pos = getPointOnCircle(angle, radius);
                                            return `${beatIndex === 0 ? 'M' : 'L'} ${pos.x} ${pos.y}`;
                                        })
                                        .join(' ');
                                    return points;
                                })()}
                                fill="none"
                                stroke="rgba(6, 182, 212, 0.4)"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />

                            {/* MARCADORES SUTILES - Solo drops importantes */}
                            {structure.drops.slice(0, 3).map((dropBeat, idx) => {
                                const angle = beatToAngle(dropBeat);
                                const pos = getPointOnCircle(angle, waveRadius);

                                return (
                                    <circle
                                        key={`drop-${idx}`}
                                        cx={pos.x}
                                        cy={pos.y}
                                        r={3}
                                        fill="rgba(234, 179, 8, 0.6)"
                                        stroke="rgba(234, 179, 8, 0.8)"
                                        strokeWidth="1.5"
                                    />
                                );
                            })}
                        </>
                    );
                })()}
            </g>

            <g ref={jumpPathsRef}></g>

            {/* Indicador de progreso mejorado */}
            {playbackState && (
                <g>
                    {/* Glow effect */}
                    <circle
                        cx={progressIndicatorPos.x}
                        cy={progressIndicatorPos.y}
                        r={12}
                        fill={songs[playbackState.currentSongIndex].color}
                        opacity="0.3"
                        className="animate-pulse"
                    />
                    {/* Indicador principal */}
                    <circle
                        cx={progressIndicatorPos.x}
                        cy={progressIndicatorPos.y}
                        r={6}
                        fill="white"
                        stroke={songs[playbackState.currentSongIndex].color}
                        strokeWidth="3"
                        className="transition-all duration-100"
                        style={{
                            filter: `drop-shadow(0 0 8px ${songs[playbackState.currentSongIndex].color})`
                        }}
                    />
                </g>
            )}
        </svg>
    );
};

export default CircularVisualizer;
