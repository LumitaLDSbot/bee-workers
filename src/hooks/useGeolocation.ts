'use client';

import { useCallback, useState } from 'react';

interface Position { lat: number; lng: number; accuracy?: number; }

export function useGeolocation() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState<Position | null>(null);

  const requestPosition = useCallback(async (): Promise<Position> => {
    setLoading(true); setError(null);

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      const message = 'Tu navegador no soporta geolocalización.';
      setError(message); setLoading(false); throw new Error(message);
    }

    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        pos => {
          const nextPosition = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
          setPosition(nextPosition); setLoading(false); resolve(nextPosition);
        },
        err => {
          let message = 'No pudimos obtener tu ubicación.';
          if (err.code === err.PERMISSION_DENIED) message = 'Permiso de ubicación denegado. Actívalo para ver turnos cercanos.';
          if (err.code === err.POSITION_UNAVAILABLE) message = 'Ubicación no disponible. Inténtalo de nuevo.';
          if (err.code === err.TIMEOUT) message = 'Tiempo de espera agotado al obtener ubicación.';
          setError(message); setLoading(false); reject(new Error(message));
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
      );
    });
  }, []);

  return { loading, error, position, requestPosition };
}
