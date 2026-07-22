'use client';

import { createContext, useContext, useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface PWAContextValue {
  canInstall: boolean;
  install: () => Promise<void>;
}

const PWAContext = createContext<PWAContextValue>({ canInstall: false, install: async () => {} });

export function usePWAInstall() { return useContext(PWAContext); }

export function PWAProvider({ children }: { children: React.ReactNode }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', async () => {
        try { await navigator.serviceWorker.register('/sw.js', { scope: '/' }); }
        catch (error) { console.error('Error registrando SW:', error); }
      });
    }
    const handler = (event: Event) => { event.preventDefault(); setDeferredPrompt(event as BeforeInstallPromptEvent); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => { window.removeEventListener('beforeinstallprompt', handler); };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  };

  return <PWAContext.Provider value={{ canInstall: Boolean(deferredPrompt), install }}>{children}</PWAContext.Provider>;
}
