interface QueueApplicationPayload {
  shiftId: string;
  message?: string;
  proposedRate?: number | null;
}

export async function queueApplication(payload: QueueApplicationPayload) {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Service Worker no soportado');
  }

  const registration = await navigator.serviceWorker.ready;

  navigator.serviceWorker.controller?.postMessage({
    type: 'QUEUE_APPLICATION',
    payload,
  });

  if ('sync' in registration) {
    try {
      await (registration as any).sync.register('apply-to-shift');
    } catch (error) {
      console.warn('Background Sync no disponible:', error);
    }
  }
}
