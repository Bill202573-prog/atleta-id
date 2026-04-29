import { BellOff, BellRing } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { toast } from 'sonner';

export function PushNotificationToggle() {
  const { isSupported, isSubscribed, isOptedOut, isLoading, permission, subscribe, unsubscribe } = usePushNotifications();

  if (!isSupported) return null;

  const enabled = !isOptedOut && permission !== 'denied';

  const handleToggle = async (next: boolean) => {
    if (!next) {
      await unsubscribe();
      toast.success('Notificações desativadas');
      return;
    }

    const success = await subscribe();
    if (success) {
      toast.success('Notificações ativadas');
    } else if (permission === 'denied') {
      toast.error('Permissão negada nas configurações do navegador.');
    }
  };

  return (
    <Card className={enabled ? 'border-primary/30 bg-primary/5' : ''}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-full ${enabled ? 'bg-primary/10' : 'bg-muted'}`}>
              {enabled ? (
                <BellRing className="w-5 h-5 text-primary" />
              ) : (
                <BellOff className="w-5 h-5 text-muted-foreground" />
              )}
            </div>
            <div>
              <p className="font-medium text-sm text-foreground">
                {enabled ? 'Notificações ligadas' : 'Notificações desligadas'}
              </p>
              <p className="text-xs text-muted-foreground">
                {isSubscribed
                  ? 'Dispositivo configurado para receber avisos'
                  : enabled
                  ? 'Configuração padrão ativa'
                  : 'Você não receberá avisos neste dispositivo'}
              </p>
            </div>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={handleToggle}
            disabled={isLoading}
            aria-label="Notificações"
          />
        </div>
      </CardContent>
    </Card>
  );
}
