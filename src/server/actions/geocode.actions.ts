'use server';

import type { ActionResult, GeocodeResult } from '@/types';

export async function geocodeAddressAction(address: string): Promise<ActionResult<GeocodeResult>> {
  try {
    if (!address || address.trim().length < 5) return { success: false, error: 'Introduce una dirección completa.' };

    const googleKey = process.env.GOOGLE_GEOCODE_API_KEY;

    if (googleKey) {
      const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
      url.searchParams.set('address', address);
      url.searchParams.set('key', googleKey);
      const res = await fetch(url.toString(), { cache: 'no-store' });
      const json = await res.json();
      if (json.status !== 'OK' || !json.results?.[0]) return { success: false, error: 'No hemos podido validar la dirección.' };
      const result = json.results[0];
      return { success: true, data: { lat: result.geometry.location.lat, lng: result.geometry.location.lng, formattedAddress: result.formatted_address } };
    }

    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('q', address);
    url.searchParams.set('format', 'json');
    url.searchParams.set('limit', '1');
    const res = await fetch(url.toString(), { headers: { 'User-Agent': 'BeeWorkersOnboarding' }, cache: 'no-store' });
    const json = await res.json();
    if (!Array.isArray(json) || json.length === 0) return { success: false, error: 'No hemos podido validar la dirección.' };
    return { success: true, data: { lat: parseFloat(json[0].lat), lng: parseFloat(json[0].lon), formattedAddress: json[0].display_name } };
  } catch { return { success: false, error: 'Error al validar la dirección.' }; }
}
