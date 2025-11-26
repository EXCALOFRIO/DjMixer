"use client";

import { type CancionAnalizada } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Music, Activity, Heart, Clock } from "lucide-react";

type TrackAnalysisProps = {
  analisis: CancionAnalizada;
};

export function TrackAnalysis({ analisis }: TrackAnalysisProps) {
  return (
    <div className="space-y-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Music className="w-5 h-5" />
            Análisis Técnico
          </CardTitle>
          <CardDescription>{analisis.titulo}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground flex items-center gap-1">
                <Activity className="w-4 h-4" />
                BPM
              </div>
              <div className="text-2xl font-bold">{analisis.bpm?.toFixed(1)}</div>
            </div>

            <div className="space-y-1">
              <div className="text-sm text-muted-foreground flex items-center gap-1">
                <Music className="w-4 h-4" />
                Tonalidad
              </div>
              <div className="text-2xl font-bold">{analisis.tonalidad_camelot}</div>
            </div>

            <div className="space-y-1">
              <div className="text-sm text-muted-foreground flex items-center gap-1">
                <Heart className="w-4 h-4" />
                Bailabilidad
              </div>
              <div className="text-2xl font-bold">{((analisis.bailabilidad || 0) * 100).toFixed(0)}%</div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium flex items-center gap-1">
              <Clock className="w-4 h-4" />
              Duración
            </div>
            <div className="text-lg">
              {Math.floor(analisis.duracion_ms / 60000)}:{String(Math.floor((analisis.duracion_ms % 60000) / 1000)).padStart(2, '0')}
            </div>
          </div>
        </CardContent>
      </Card>

      {analisis.estructura_ts && analisis.estructura_ts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Estructura Musical</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {analisis.estructura_ts.map((seccion, i) => (
                <div key={i} className="flex items-center justify-between p-2 bg-muted rounded text-sm">
                  <span className="capitalize font-medium">{seccion.tipo_seccion.replace(/_/g, ' ')}</span>
                  <span className="text-muted-foreground">
                    {seccion.inicio} - {seccion.fin}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {analisis.vocales_clave && analisis.vocales_clave.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Bloques Vocales</CardTitle>
            <CardDescription>Secciones con voz detectadas por Gemini</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {analisis.vocales_clave.map((bloque, i) => (
                <div key={i} className="flex items-center justify-between p-2 bg-muted rounded text-sm">
                  <span className="capitalize font-medium">{bloque.tipo.replace(/_/g, ' ')}</span>
                  <span className="text-muted-foreground">
                    {bloque.inicio} - {bloque.fin}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {analisis.loops_transicion && analisis.loops_transicion.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Loops de Transición</CardTitle>
            <CardDescription>Los mejores momentos para mezclar</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {analisis.loops_transicion.map((loop, i) => (
                <div key={i} className="p-2 bg-muted rounded">
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="font-medium">{loop.texto}</span>
                    <span className="text-xs text-muted-foreground">#{i + 1}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {loop.inicio} - {loop.fin}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
