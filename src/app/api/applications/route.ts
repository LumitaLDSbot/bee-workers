import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const applicationSchema = z.object({
  shiftId: z.string().uuid(),
  message: z.string().max(500).optional(),
  proposedRate: z.coerce.number().min(0).optional().nullable(),
});

export async function POST(request: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = await request.json();
  const parsed = applicationSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0]?.message ?? 'Datos inválidos' }, { status: 400 });

  const { shiftId, message, proposedRate } = parsed.data;
  const { data: shift } = await supabase.from('shifts').select('*').eq('id', shiftId).maybeSingle();
  if (!shift) return NextResponse.json({ error: 'Turno no encontrado' }, { status: 404 });
  if (shift.status !== 'published') return NextResponse.json({ error: 'Este turno ya no está disponible' }, { status: 400 });
  if (shift.employer_id === user.id) return NextResponse.json({ error: 'No puedes aplicar a tu propio turno' }, { status: 400 });

  const finalProposedRate = proposedRate ?? shift.hourly_rate_offer ?? undefined;
  if (!finalProposedRate || finalProposedRate <= 0) return NextResponse.json({ error: 'Este turno requiere propuesta de precio' }, { status: 400 });

  const { error } = await supabase.from('shift_applications').insert({
    shift_id: shiftId, worker_id: user.id, proposed_rate: finalProposedRate, message: message ?? null, status: 'pending',
  });

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Ya has aplicado a este turno' }, { status: 409 });
    return NextResponse.json({ error: 'No pudimos enviar la aplicación' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
