export function formatShiftDate(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  return d.toLocaleDateString('es-ES', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export function formatHour(time: string): string {
  return time?.slice(0, 5) ?? '';
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('es-ES', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function calculateShiftHours(startIso: string, endIso: string): number {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  const hours = (end - start) / 3600000;
  return Math.max(hours, 0);
}

export function calculateHoursFromDateAndTime(
  date: string,
  startTime: string,
  endTime: string
): number {
  const start = new Date(`${date}T${startTime}`);
  let end = new Date(`${date}T${endTime}`);

  if (end <= start) {
    end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  }

  const hours = (end.getTime() - start.getTime()) / 3600000;
  return Math.max(hours, 0);
}
