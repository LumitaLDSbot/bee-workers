'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { publishShiftAction } from '@/server/actions/shifts.actions';
import { EmployerNav } from '@/components/layout/AppNav';
import { Button, Card, Input, Select, Textarea } from '@/components/ui';
import { PROFESSIONS } from '@/lib/constants';
import { calculateHoursFromDateAndTime } from '@/lib/utils/date';
import { calculateShiftCost } from '@/lib/utils/calc';
import { formatEUR } from '@/lib/utils/number';

export default function NewShiftPage() {
  const router = useRouter();

  const [profession, setProfession] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [pricePerHour, setPricePerHour] = useState('');
  const [description, setDescription] = useState('');
  const [slotsNeeded, setSlotsNeeded] = useState('1');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hours =
    date && startTime && endTime
      ? calculateHoursFromDateAndTime(date, startTime, endTime)
      : 0;

  const price = Number(pricePerHour || 0);
  const slots = Number(slotsNeeded || 1);
  const totalCost = price > 0 && hours > 0 ? calculateShiftCost(price, hours, slots) : 0;

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);

    const result = await publishShiftAction({
      profession,
      date,
      startTime,
      endTime,
      pricePerHour: pricePerHour ? Number(pricePerHour) : null,
      description,
      slotsNeeded: Number(slotsNeeded),
    });

    setLoading(false);

    if (!result.success) {
      setError(result.error);
      return;
    }

    router.push('/app/employer/shifts');
  };

  return (
    <div className="min-h-screen bg-[#FFFAF0]">
      <EmployerNav />

      <main className="mx-auto max-w-md space-y-4 px-4 py-4">
        <h1 className="text-2xl font-black">Publicar turno</h1>

        <Card className="space-y-4">
          <Select
            label="Profesión requerida"
            value={profession}
            onChange={e => setProfession(e.target.value)}
          >
            <option value="">Selecciona una profesión</option>
            {PROFESSIONS.map(item => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </Select>

          <Input
            label="Fecha"
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Inicio"
              type="time"
              value={startTime}
              onChange={e => setStartTime(e.target.value)}
            />
            <Input
              label="Fin"
              type="time"
              value={endTime}
              onChange={e => setEndTime(e.target.value)}
            />
          </div>

          <Input
            label="Precio por hora (opcional)"
            type="number"
            step="0.5"
            placeholder="12"
            value={pricePerHour}
            onChange={e => setPricePerHour(e.target.value)}
            hint="Si lo dejas vacío, los workers propondrán precio."
          />

          <Input
            label="Número de workers necesarios"
            type="number"
            min={1}
            max={20}
            value={slotsNeeded}
            onChange={e => setSlotsNeeded(e.target.value)}
          />

          <Textarea
            label="Descripción"
            rows={4}
            placeholder="Detalles del servicio, vestimenta, experiencia..."
            value={description}
            onChange={e => setDescription(e.target.value)}
          />
        </Card>

        <Card className="space-y-2">
          <h2 className="font-bold">Preview coste estimado</h2>

          {price > 0 && hours > 0 ? (
            <div className="space-y-1 text-sm">
              <p className="flex justify-between">
                <span className="text-[#8B8B8B]">Horas</span>
                <span>{hours.toFixed(1)}h</span>
              </p>
              <p className="flex justify-between">
                <span className="text-[#8B8B8B]">Workers</span>
                <span>{slots}</span>
              </p>
              <p className="flex justify-between">
                <span className="text-[#8B8B8B]">Precio/hora</span>
                <span>{formatEUR(price)}</span>
              </p>
              <p className="flex justify-between rounded-2xl bg-[#F5F5F0] px-3 py-3 font-bold">
                <span>Total estimado</span>
                <span>{formatEUR(totalCost)}</span>
              </p>
            </div>
          ) : (
            <p className="text-sm text-[#8B8B8B]">
              Introduce fecha, horas y precio para ver el coste estimado.
            </p>
          )}
        </Card>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <Button className="w-full" loading={loading} onClick={handleSubmit}>
          Publicar turno
        </Button>
      </main>
    </div>
  );
}