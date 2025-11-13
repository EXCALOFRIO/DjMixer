// ============================================================================
// COMPONENTE DE IMPORTACIÓN MASIVA CON ANÁLISIS POR LOTES
// ============================================================================
// Permite subir múltiples archivos y los procesa de 10 en 10
// ============================================================================

'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle, XCircle, Loader2, Upload } from 'lucide-react';

interface ResultadoAnalisis {
  nombre?: string;
  titulo?: string;
  artista?: string;
  bpm?: number;
  tonalidad_camelot?: string;
  error?: boolean;
  mensaje?: string;
}

export function ImportadorMasivo() {
  const [archivos, setArchivos] = useState<File[]>([]);
  const [procesando, setProcesando] = useState(false);
  const [progreso, setProgreso] = useState({ actual: 0, total: 0 });
  const [resultados, setResultados] = useState<ResultadoAnalisis[]>([]);
  const [resumen, setResumen] = useState<any>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const nuevosArchivos = Array.from(e.target.files);
      setArchivos(nuevosArchivos);
      setResultados([]);
      setResumen(null);
    }
  };

  const handleAnalizar = async () => {
    if (archivos.length === 0) return;

    setProcesando(true);
    setProgreso({ actual: 0, total: archivos.length });
    setResultados([]);

    try {
      const formData = new FormData();
      archivos.forEach(archivo => {
        formData.append('files', archivo);
      });

      const response = await fetch('/api/analyze-batch', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }

      const data = await response.json();
      
      setResumen(data.resumen);
      setResultados(data.resultados || []);
      setProgreso({ actual: data.resumen.total, total: data.resumen.total });

    } catch (error) {
      console.error('Error en análisis masivo:', error);
      alert('Error al procesar archivos: ' + (error instanceof Error ? error.message : 'Error desconocido'));
    } finally {
      setProcesando(false);
    }
  };

  const porcentaje = progreso.total > 0 ? (progreso.actual / progreso.total) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle>Importación Masiva de Canciones</CardTitle>
          <CardDescription>
            Analiza hasta 100 canciones simultáneamente (procesamiento de 10 en 10)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Selector de archivos */}
          <div className="flex items-center gap-4">
            <input
              type="file"
              accept="audio/*"
              multiple
              onChange={handleFileChange}
              disabled={procesando}
              className="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
            <Button
              onClick={handleAnalizar}
              disabled={procesando || archivos.length === 0}
              className="min-w-[120px]"
            >
              {procesando ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Analizando...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Analizar {archivos.length > 0 && `(${archivos.length})`}
                </>
              )}
            </Button>
          </div>

          {/* Barra de progreso */}
          {procesando && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Procesando archivos...</span>
                <span>{progreso.actual} / {progreso.total}</span>
              </div>
              <Progress value={porcentaje} className="w-full" />
            </div>
          )}

          {/* Resumen */}
          {resumen && (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                <div className="font-semibold mb-2">Análisis completado</div>
                <div className="text-sm space-y-1">
                  <div>📦 Total: {resumen.total} archivos</div>
                  <div>💾 Desde caché: {resumen.cache}</div>
                  <div>🎵 Analizados: {resumen.analizados}</div>
                  <div className="text-green-600">✅ Exitosos: {resumen.exitosos}</div>
                  {resumen.fallidos > 0 && (
                    <div className="text-red-600">❌ Fallidos: {resumen.fallidos}</div>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Resultados */}
      {resultados.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Resultados del Análisis</CardTitle>
            <CardDescription>
              {resultados.filter(r => !r.error).length} de {resultados.length} canciones procesadas exitosamente
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {resultados.map((resultado, index) => (
                <div
                  key={index}
                  className={`flex items-center gap-3 p-3 rounded-lg border ${
                    resultado.error
                      ? 'bg-red-50 border-red-200'
                      : 'bg-green-50 border-green-200'
                  }`}
                >
                  {resultado.error ? (
                    <XCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
                  ) : (
                    <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                  )}
                  
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">
                      {resultado.titulo || resultado.nombre || 'Sin título'}
                    </div>
                    {resultado.error ? (
                      <div className="text-sm text-red-600">
                        {resultado.mensaje || 'Error desconocido'}
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">
                        {resultado.artista && <span>{resultado.artista} · </span>}
                        {resultado.bpm && <span>{resultado.bpm} BPM · </span>}
                        {resultado.tonalidad_camelot && <span>{resultado.tonalidad_camelot}</span>}
                      </div>
                    )}
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
