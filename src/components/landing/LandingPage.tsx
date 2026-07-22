'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button, Card } from '@/components/ui';

const faqs = [
  { q: '¿Bee Workers es mi empleador?', a: 'No. Bee Workers es una plataforma de colocación. Los workers son autónomos y facturan directamente al empleador.' },
  { q: '¿Qué comisión cobra Bee Workers?', a: 'La plataforma cobra una comisión del 5% sobre el bruto del servicio.' },
  { q: '¿Bee Workers retiene IRS o Segurança Social?', a: 'No. La plataforma no retiene impuestos. El worker es responsable de declarar y pagar IRS y Segurança Social.' },
  { q: '¿Necesito seguro de accidentes de trabajo?', a: 'Sí. En Portugal, los trabalhadores independentes deben tener seguro de acidentes de trabalho vigente.' },
  { q: '¿Cuándo puedo cobrar IVA?', a: 'Si facturas menos de 15.000€ al año, normalmente puedes acogerte a exención de IVA. La app te ayuda a trackear ese límite.' },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-3xl border border-black/5 bg-white p-5 dark:border-white/10 dark:bg-neutral-900">
      <button onClick={() => setOpen(prev => !prev)} className="flex w-full items-center justify-between text-left">
        <span className="font-bold text-[#1A1A1A] dark:text-neutral-100">{q}</span>
        <span className="text-[#FFB800]">{open ? '−' : '+'}</span>
      </button>
      {open && <p className="mt-3 text-sm leading-6 text-[#8B8B8B] dark:text-neutral-400">{a}</p>}
    </div>
  );
}

export function LandingPage() {
  return (
    <div className="min-h-screen bg-[#FFFAF0] dark:bg-neutral-950">
      <header className="sticky top-0 z-50 border-b border-black/5 bg-[#FFFAF0]/90 backdrop-blur dark:border-white/10 dark:bg-neutral-950/90">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link href="/" className="text-xl font-black text-[#1A1A1A] dark:text-neutral-100">Bee<span className="text-[#FFB800]">Workers</span></Link>
          <div className="flex items-center gap-2">
            <Link href="/login"><Button variant="ghost">Entrar</Button></Link>
            <Link href="/register"><Button>Registro</Button></Link>
          </div>
        </div>
      </header>

      <section className="hex-pattern">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <div className="max-w-3xl">
            <div className="mb-6 inline-flex rounded-full bg-[#FFB800]/15 px-4 py-2 text-sm font-semibold text-[#1A1A1A] dark:text-[#FFB800]">Porto · Hostelería y restauración</div>
            <h1 className="text-5xl font-black leading-tight text-[#1A1A1A] dark:text-neutral-100 md:text-6xl">Be a Worker.<br /><span className="text-[#FFB800]">Bee a Worker.</span></h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-[#8B8B8B] dark:text-neutral-400">Conectamos trabajadores autónomos con empleadores de hostelería para turnos puntuales y temporales. Simple, verificado y con geolocalización.</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/register"><Button className="w-full px-8 py-4 text-base sm:w-auto">Empezar ahora</Button></Link>
              <Link href="#how"><Button variant="outline" className="w-full px-8 py-4 text-base sm:w-auto">Cómo funciona</Button></Link>
            </div>
          </div>
        </div>
      </section>

      <section id="how" className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-3xl font-black text-[#1A1A1A] dark:text-neutral-100">Cómo funciona</h2>
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <Card className="space-y-4">
            <h3 className="text-xl font-bold">Para Workers</h3>
            <ul className="space-y-3 text-sm leading-6 text-[#8B8B8B] dark:text-neutral-400">
              <li>1. Regístrate como trabalhador independente.</li>
              <li>2. Sube tus documentos y verifica tu perfil.</li>
              <li>3. Descubre turnos cerca de ti.</li>
              <li>4. Aplica y propón tu precio si el turno no lo fija.</li>
              <li>5. Haz check-in, completa el turno y valora.</li>
            </ul>
            <Link href="/register"><Button variant="secondary">Quiero ser worker</Button></Link>
          </Card>
          <Card className="space-y-4">
            <h3 className="text-xl font-bold">Para Employers</h3>
            <ul className="space-y-3 text-sm leading-6 text-[#8B8B8B] dark:text-neutral-400">
              <li>1. Crea el perfil de tu empresa.</li>
              <li>2. Publica turnos con fecha, hora y profesión.</li>
              <li>3. Recibe aplicaciones de workers verificados.</li>
              <li>4. Acepta al profesional adecuado.</li>
              <li>5. Gestiona check-in/check-out y valora.</li>
            </ul>
            <Link href="/register"><Button variant="secondary">Quiero publicar turnos</Button></Link>
          </Card>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-16">
        <h2 className="text-3xl font-black text-[#1A1A1A] dark:text-neutral-100">Preguntas frecuentes</h2>
        <div className="mt-8 space-y-4">{faqs.map(faq => <FaqItem key={faq.q} q={faq.q} a={faq.a} />)}</div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20">
        <div className="rounded-3xl bg-[#1A1A1A] p-10 text-center text-white">
          <h2 className="text-3xl font-black">Empieza a trabajar o a contratar hoy</h2>
          <p className="mx-auto mt-3 max-w-xl text-white/70">Crea tu cuenta y forma parte de la colmena de hostelería en Porto.</p>
          <div className="mt-8 flex justify-center"><Link href="/register"><Button className="px-8 py-4 text-base">Crear cuenta</Button></Link></div>
        </div>
      </section>

      <footer className="border-t border-black/5 bg-white py-10 dark:border-white/10 dark:bg-neutral-900">
        <div className="mx-auto max-w-6xl px-4">
          <p className="text-lg font-black">Bee<span className="text-[#FFB800]">Workers</span></p>
          <p className="mt-8 text-xs text-[#8B8B8B] dark:text-neutral-500">Bee Workers no es empleador. Los workers son trabajadores independientes y son responsables de sus obligaciones fiscales.</p>
        </div>
      </footer>
    </div>
  );
}
