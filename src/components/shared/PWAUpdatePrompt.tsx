import { useEffect, useRef, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { Button } from '@/components/ui/button';
import { RefreshCw, X } from 'lucide-react';
import { toast } from 'sonner';

type UpdateServiceWorker = (reloadPage?: boolean) => Promise<void>;

export function PWAUpdatePrompt() {
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const updateSWRef = useRef<UpdateServiceWorker | null>(null);
  const updateTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        setDismissed(false);
        setNeedsRefresh(true);
      },
      onRegisterError(error) {
        console.error('[PWA] register error:', error);
      },
    });

    updateSWRef.current = updateSW;

    return () => {
      if (updateTimeoutRef.current !== null) {
        window.clearTimeout(updateTimeoutRef.current);
      }
    };
  }, []);

  const handleRefresh = async () => {
    if (isUpdating) return;
    const updateSW = updateSWRef.current;

    if (!updateSW) {
      window.location.reload();
      return;
    }

    setIsUpdating(true);

    try {
      updateTimeoutRef.current = window.setTimeout(() => {
        setIsUpdating(false);
        toast.error('Não foi possível aplicar a atualização agora. Feche outras abas do sistema e tente novamente.');
      }, 10000);

      await updateSW(true);
    } catch (error) {
      if (updateTimeoutRef.current !== null) {
        window.clearTimeout(updateTimeoutRef.current);
        updateTimeoutRef.current = null;
      }
      setIsUpdating(false);
      console.error('[PWA] update error:', error);
      toast.error('Falha ao atualizar. Tente novamente em alguns segundos.');
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
  };

  if (!needsRefresh || dismissed) return null;

  return (
    <>
      {/* Backdrop overlay */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9998]" />

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
            <h3 className="text-xl font-semibold text-foreground mb-2">Nova versão disponível!</h3>
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
