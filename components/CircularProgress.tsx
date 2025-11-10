import React from 'react';

interface CircularProgressProps {
    size: number;
    strokeWidth: number;
    progress: number; // 0 a 100
    color: string;
}

const CircularProgress: React.FC<CircularProgressProps> = ({ size, strokeWidth, progress, color }) => {
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (progress / 100) * circumference;

    return (
        <svg width={size} height={size} className="-rotate-90">
            {/* Círculo de fondo */}
            <circle
                stroke="rgba(255, 255, 255, 0.1)"
                fill="transparent"
                strokeWidth={strokeWidth}
                r={radius}
                cx={size / 2}
                cy={size / 2}
            />
            {/* Círculo de progreso */}
            <circle
                stroke={color}
                fill="transparent"
                strokeWidth={strokeWidth}
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                strokeLinecap="round"
                r={radius}
                cx={size / 2}
                cy={size / 2}
                className="transition-all duration-300"
                style={{ filter: `drop-shadow(0 0 5px ${color})` }}
            />
        </svg>
    );
};

export default CircularProgress;
