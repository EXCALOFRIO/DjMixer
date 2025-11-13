"use client";

import { type CancionAnalizada } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Music, Activity, Zap, Heart, Clock } from "lucide-react";

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
          <CardDescription>{analisis.titulo} - {analisis.artista}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
                <Zap className="w-4 h-4" />
                Energía
              </div>
              <div className="text-2xl font-bold">{((analisis.energia || 0) * 100).toFixed(0)}%</div>
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
            <div className="text-sm font-medium">Ánimo General</div>
            <Badge variant="secondary" className="text-base">
              {analisis.animo_general}
            </Badge>
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

      {analisis.analisis_contenido && (
        <Card>
          <CardHeader>
            <CardTitle>Análisis de Contenido</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="text-sm font-medium">Tema Principal</div>
              <p className="text-sm text-muted-foreground">
                {analisis.analisis_contenido.analisis_lirico_tematico.tema_principal}
              </p>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Palabras Clave</div>
              <div className="flex flex-wrap gap-2">
                {analisis.analisis_contenido.analisis_lirico_tematico.palabras_clave_semanticas.map((palabra, i) => (
                  <Badge key={i} variant="outline">{palabra}</Badge>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Evolución Emocional</div>
              <p className="text-sm text-muted-foreground">
                {analisis.analisis_contenido.analisis_lirico_tematico.evolucion_emocional}
              </p>
            </div>

            {analisis.analisis_contenido.eventos_clave_dj.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm font-medium">Eventos Clave para DJ</div>
                <div className="space-y-1">
                  {analisis.analisis_contenido.eventos_clave_dj.map((evento, i) => (
                    <div key={i} className="text-sm flex items-center justify-between p-2 bg-muted rounded">
                      <span className="capitalize">{evento.evento.replace(/_/g, ' ')}</span>
                      <span className="text-muted-foreground">
                        {Math.floor(evento.inicio_ms / 1000)}s - {Math.floor(evento.fin_ms / 1000)}s
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
                    {Math.floor(seccion.inicio_ms / 1000)}s - {Math.floor(seccion.fin_ms / 1000)}s
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {analisis.presencia_vocal_ts && analisis.presencia_vocal_ts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Presencia Vocal (para loops precisos)</CardTitle>
            <CardDescription>Detección automática de secciones vocales vs instrumentales</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex gap-4 text-xs mb-2">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 bg-blue-500 rounded"></div>
                  <span>Vocal</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 bg-purple-500 rounded"></div>
                  <span>Mixto</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 bg-gray-500 rounded"></div>
                  <span>Instrumental</span>
                </div>
              </div>
              <div className="relative h-12 bg-muted rounded overflow-hidden">
                {analisis.presencia_vocal_ts.map((p, i) => {
                  const left = (p.tiempo_ms / analisis.duracion_ms) * 100;
                  const width = ((analisis.presencia_vocal_ts![i + 1]?.tiempo_ms || analisis.duracion_ms) - p.tiempo_ms) / analisis.duracion_ms * 100;
                  const color = p.tipo === 'vocal' ? 'bg-blue-500' : p.tipo === 'mixto' ? 'bg-purple-500' : 'bg-gray-500';
                  const opacity = Math.max(0.3, p.confianza);
                  
                  return (
                    <div
                      key={i}
                      className={`absolute h-full ${color}`}
                      style={{
                        left: `${left}%`,
                        width: `${width}%`,
                        opacity
                      }}
                      title={`${Math.floor(p.tiempo_ms / 1000)}s - ${p.tipo} (${Math.round(p.confianza * 100)}%)`}
                    />
                  );
                })}
              </div>
              <div className="text-xs text-muted-foreground">
                Pasa el cursor sobre las barras para ver detalles
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
