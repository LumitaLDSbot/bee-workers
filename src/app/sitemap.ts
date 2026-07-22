import { MetadataRoute } from 'next';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3004';

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
    { url: `${baseUrl}/login`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/register`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
  ];

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) return staticRoutes;

  const admin = createClient(supabaseUrl, serviceKey);

  const { data: shifts } = await admin
    .from('shifts')
    .select('id, updated_at')
    .eq('status', 'published')
    .order('starts_at', { ascending: true })
    .limit(5000);

  const shiftRoutes: MetadataRoute.Sitemap = (shifts ?? []).map(shift => ({
    url: `${baseUrl}/turnos/${shift.id}`,
    lastModified: shift.updated_at ? new Date(shift.updated_at) : new Date(),
    changeFrequency: 'hourly' as const,
    priority: 0.9,
  }));

  return [...staticRoutes, ...shiftRoutes];
}
