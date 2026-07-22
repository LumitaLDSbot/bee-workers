import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

interface PublicShiftPageProps {
  params: {
    id: string;
  };
}

async function getPublicShift(shiftId: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return null;
  }

  const admin = createClient(supabaseUrl, serviceKey);

  const { data: shift } = await admin
    .from('shifts')
    .select(
      `
      *,
      employer_profiles (
        company_name,
        address,
        location
      )
      `
    )
    .eq('id', shiftId)
    .eq('status', 'published')
    .maybeSingle();

  return shift;
}

export async function generateMetadata({
  params,
}: PublicShiftPageProps): Promise<Metadata> {
  const shift = await getPublicShift(params.id);

  if (!shift) {
    return {
      title: 'Turno no disponible',
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  const title = `${shift.profession_required} en Porto`;
  const description =
    shift.description ||
    `Turno de ${shift.profession_required} en ${shift.location || 'Porto'}. Publica tu aplicación en Bee Workers.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
    },
  };
}

export default async function PublicShiftPage({
  params,
}: PublicShiftPageProps) {
  const shift = await getPublicShift(params.id);

  if (!shift) {
    notFound();
  }

  const employer = Array.isArray(shift.employer_profiles)
    ? shift.employer_profiles[0]
    : shift.employer_profiles;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: shift.profession_required,
    description: shift.description || shift.profession_required,
    datePosted: shift.created_at,
    validThrough: shift.starts_at,
    employmentType: 'TEMPORARY',
    hiringOrganization: {
      '@type': 'Organization',
      name: employer?.company_name || 'Empresa en Porto',
    },
    jobLocation: {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        addressLocality: shift.location || 'Porto',
        addressCountry: 'PT',
      },
    },
    ...(shift.hourly_rate_offer
      ? {
          baseSalary: {
            '@type': 'MonetaryAmount',
            currency: 'EUR',
            value: {
              '@type': 'QuantitativeValue',
              value: shift.hourly_rate_offer,
              unitText: 'HOUR',
            },
          },
        }
      : {}),
  };

  return (
    <div className="min-h-screen bg-[#FFFAF0] dark:bg-neutral-950">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <main className="mx-auto max-w-3xl px-4 py-10">
        <div className="rounded-3xl border border-black/5 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-neutral-900">
          <p className="text-sm font-semibold text-[#FFB800]">
            Turno en Porto
          </p>

          <h1 className="mt-2 text-3xl font-black text-[#1A1A1A] dark:text-neutral-100">
            {shift.profession_required}
          </h1>

          <p className="mt-2 text-sm text-[#8B8B8B] dark:text-neutral-400">
            {employer?.company_name || 'Empresa'} ·{' '}
            {shift.location || 'Porto'}
          </p>

          {shift.description && (
            <p className="mt-6 whitespace-pre-line text-sm leading-7 text-[#1A1A1A] dark:text-neutral-200">
              {shift.description}
            </p>
          )}

          <div className="mt-8">
            <Link
              href="/register"
              className="inline-flex items-center justify-center rounded-2xl bg-[#FFB800] px-6 py-4 text-sm font-semibold text-[#1A1A1A] transition hover:bg-[#E0A800]"
            >
              Aplicar en Bee Workers
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}