import { useEffect, useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw, X } from 'lucide-react';
import { toast } from 'sonner';

export function PWAUpdatePrompt() {
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const reloadTimeoutRef = useRef<number | null>(null);

  const CARREIRA_DOMAINS = ['carreiraid.com.br', 'www.carreiraid.com.br'];
  const isCarreiraDomain = typeof window !== 'undefined' && CARREIRA_DOMAINS.includes(window.location.hostname);

  const isRelevantSW = (sw: ServiceWorker | null) => {
    if (!sw?.scriptURL) return false;
    if (isCarreiraDomain) {
      // On carreira domain, only listen to carreira-sw.js
      return sw.scriptURL.includes('carreira-sw.js');
    }
    // On atletaid domain, only listen to workbox sw.js (not carreira or push)
    return !sw.scriptURL.includes('carreira-sw.js') && !sw.scriptURL.includes('push-sw.js');
  };

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const listenForUpdates = (registration: ServiceWorkerRegistration) => {
      if (!isRelevantSW(registration.active) && !isRelevantSW(registration.installing) && !isRelevantSW(registration.waiting)) return;

      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker && isRelevantSW(newWorker)) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              setWaitingWorker(newWorker);
              setNeedsRefresh(true);
            }
          });
        }
      });

      // Check if already waiting
      if (registration.waiting && isRelevantSW(registration.waiting)) {
        setWaitingWorker(registration.waiting);
        setNeedsRefresh(true);
      }
    };

    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach(listenForUpdates);
    });

    // Check for updates every 5 minutes
    const interval = setInterval(() => {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((reg) => {
          if (isRelevantSW(reg.active)) reg.update();
        });
      });
    }, 5 * 60 * 1000);

    return () => {
      clearInterval(interval);
      if (reloadTimeoutRef.current !== null) {
        window.clearTimeout(reloadTimeoutRef.current);
      }
    };
  }, []);

  const handleRefresh = () => {
    if (isUpdating) return;
    setIsUpdating(true);

    if (!waitingWorker) {
      window.location.reload();
      return;
    }

    navigator.serviceWorker.addEventListener(
      'controllerchange',
      () => {
        if (reloadTimeoutRef.current !== null) {
          window.clearTimeout(reloadTimeoutRef.current);
          reloadTimeoutRef.current = null;
        }
        window.location.reload();
      },
      { once: true }
    );

    waitingWorker.postMessage({ type: 'SKIP_WAITING' });

    // If controlling event does not fire, keep the prompt and show guidance instead of reloading stale app
    reloadTimeoutRef.current = window.setTimeout(() => {
      setIsUpdating(false);
      toast.error('Não foi possível aplicar a atualização agora. Feche outras abas do sistema e tente novamente.');
    }, 8000);
  };

  const handleDismiss = () => {
    setDismissed(true);
  };

  if (!needsRefresh || dismissed) return null;

  return (
    <>
      {/* Backdrop overlay */}
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9998]"
        onClick={handleDismiss}
      />
      
      {/* Centered modal */}
      <div className="fixed inset-0 flex items-center justify-center z-[9999] p-4">
        <div className="relative bg-card border border-border rounded-2xl shadow-2xl p-6 w-full max-w-sm animate-in zoom-in-95 fade-in duration-200">
          {/* Close button */}
          <button
            type="button"
            onClick={handleDismiss}
            className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>

          {/* Icon */}
          <div className="flex justify-center mb-4">
            <div className="bg-primary/10 rounded-full p-4">
              <RefreshCw className="h-8 w-8 text-primary" />
            </div>
          </div>

          {/* Content */}
          <div className="text-center mb-6">
            <h3 className="text-xl font-semibold text-foreground mb-2">
              Nova versão disponível!
            </h3>
            <p className="text-muted-foreground text-sm">
              Uma atualização está pronta para ser instalada. Atualize agora para ter acesso às últimas melhorias e correções.
            </p>
          </div>

          {/* Buttons */}
          <div className="flex flex-col gap-3">
            <Button
              type="button"
              onClick={handleRefresh}
              className="w-full h-12 text-base font-medium"
              size="lg"
              disabled={isUpdating}
            >
              <RefreshCw className={`h-5 w-5 mr-2 ${isUpdating ? 'animate-spin' : ''}`} />
              {isUpdating ? 'Atualizando...' : 'Atualizar Agora'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleDismiss}
              className="w-full h-12 text-base font-medium"
              size="lg"
              disabled={isUpdating}
            >
              Depois
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
