import Link from 'next/link';

export const metadata = { title: 'Sin conexión | Bee Workers', robots: { index: false, follow: false } };

export default function OfflinePage() {
  return (
    <div className="hex-pattern flex min-h-screen items-center justify-center bg-[#FFFAF0] px-4 dark:bg-neutral-950">
      <div className="w-full max-w-md rounded-3xl border border-black/5 bg-white p-8 text-center shadow-sm dark:border-white/10 dark:bg-neutral-900">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-3xl bg-[#FFB800] text-3xl">🐝</div>
        <h1 className="text-2xl font-black text-[#1A1A1A] dark:text-neutral-100">Estás sin conexión</h1>
        <p className="mt-3 text-sm leading-6 text-[#8B8B8B] dark:text-neutral-400">No pudimos cargar esta página. Algunas funciones pueden seguir disponibles si ya se cargaron antes.</p>
        <Link href="/" className="mt-6 inline-flex items-center justify-center rounded-2xl bg-[#FFB800] px-6 py-3.5 text-sm font-semibold text-[#1A1A1A] transition hover:bg-[#E0A800]">Volver al inicio</Link>
      </div>
    </div>
  );
}
