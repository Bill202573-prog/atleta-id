import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Fingerprint, Loader2 } from 'lucide-react';
import { isBiometricSupported, hasLocalPasskey, setLocalPasskeyFlag, registerPasskey } from '@/lib/biometric';
import { toast } from '@/hooks/use-toast';

const DISMISS_KEY = 'biometric_prompt_dismissed:';

const isEligibleSchool = (escolinhaNome?: string): boolean => {
  if (!escolinhaNome) return false;
  const n = escolinhaNome.toLowerCase();
  return n.includes('fluminense') || n.includes('flamengo');
};

export default function BiometricSetupPrompt() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user?.email) return;
    if (!isBiometricSupported()) return;
    if (!isEligibleSchool(user.escolinhaNome)) return;
    if (hasLocalPasskey(user.email)) return;
    if (localStorage.getItem(DISMISS_KEY + user.email.toLowerCase()) === '1') return;
    // Small delay to let the dashboard render
    const t = setTimeout(() => setOpen(true), 1500);
    return () => clearTimeout(t);
  }, [user]);

  const handleEnable = async () => {
    if (!user?.email) return;
    setLoading(true);
    const result = await registerPasskey(navigator.userAgent.slice(0, 80));
    setLoading(false);
    if (result.success) {
      setLocalPasskeyFlag(user.email, true);
      toast({ title: 'Biometria ativada!', description: 'Você poderá entrar usando sua biometria.' });
      setOpen(false);
    } else {
      toast({ title: 'Não foi possível ativar', description: result.error, variant: 'destructive' });
    }
  };

  const handleDismiss = () => {
    if (user?.email) localStorage.setItem(DISMISS_KEY + user.email.toLowerCase(), '1');
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto bg-primary/10 rounded-full p-4 mb-2">
            <Fingerprint className="w-10 h-10 text-primary" />
          </div>
          <DialogTitle className="text-center">Ativar login por biometria?</DialogTitle>
          <DialogDescription className="text-center">
            Use sua impressão digital ou Face ID para entrar mais rápido neste dispositivo, sem precisar digitar a senha.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col sm:flex-col gap-2">
          <Button onClick={handleEnable} disabled={loading} className="w-full" size="lg">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Fingerprint className="w-4 h-4 mr-2" /> Ativar biometria</>}
          </Button>
          <Button onClick={handleDismiss} variant="ghost" className="w-full" disabled={loading}>
            Agora não
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
