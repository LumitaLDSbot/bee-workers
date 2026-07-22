'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { geocodeAddressAction } from '@/server/actions/geocode.actions';

interface AddressInputProps {
  address: string;
  latitude?: number;
  longitude?: number;
  onChange: (value: { address: string; latitude: number | undefined; longitude: number | undefined }) => void;
  error?: string;
}

export function AddressInput({ address, latitude, longitude, onChange, error }: AddressInputProps) {
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [validated, setValidated] = useState(Boolean(latitude && longitude));

  const handleValidate = async () => {
    setLoading(true); setLocalError(null); setValidated(false);
    const result = await geocodeAddressAction(address);
    setLoading(false);
    if (!result.success || !result.data) {
      setLocalError(result.success ? 'No se pudo validar la dirección.' : result.error);
      onChange({ address, latitude: undefined, longitude: undefined });
      return;
    }
    setValidated(true);
    onChange({ address: result.data.formattedAddress, latitude: result.data.lat, longitude: result.data.lng });
  };

  return (
    <div className="space-y-3">
      <Input label="Dirección del establecimiento" placeholder="Rua de Santa Catarina, Porto" value={address}
        onChange={e => { setValidated(false); onChange({ address: e.target.value, latitude: undefined, longitude: undefined }); }} />
      <Button type="button" variant="secondary" className="w-full" loading={loading} onClick={handleValidate}>Validar dirección</Button>
      {validated && latitude && longitude && <div className="rounded-2xl bg-card px-4 py-3 text-sm text-ink">Dirección validada: {latitude.toFixed(5)}, {longitude.toFixed(5)}</div>}
      {(error || localError) && <p className="text-sm text-red-600">{error || localError}</p>}
    </div>
  );
}
