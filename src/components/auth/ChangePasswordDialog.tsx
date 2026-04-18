import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Loader2, Key, Fingerprint, Shield, Smartphone, ChevronRight, HelpCircle, X } from 'lucide-react';
import { z } from 'zod';
import PasswordInput from '@/components/shared/PasswordInput';
import {
  isBiometricSupported,
  hasLocalPasskey,
  setLocalPasskeyFlag,
  registerPasskey,
} from '@/lib/biometric';

const passwordSchema = z.object({
  password: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres'),
  confirmPassword: z.string()
}).refine(data => data.password === data.confirmPassword, {
  message: 'As senhas não coincidem',
  path: ['confirmPassword']
});

interface ChangePasswordDialogProps {
  trigger?: React.ReactNode;
}

const ChangePasswordDialog = ({ trigger }: ChangePasswordDialogProps) => {
  const { changePassword, user } = useAuth();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [passwordOpen, setPasswordOpen] = useState(false);

  const biometricSupported = isBiometricSupported();
  const [biometricOn, setBiometricOn] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);

  useEffect(() => {
    if (open && user?.email) {
      setBiometricOn(hasLocalPasskey(user.email));
      setPasswordOpen(false);
      setPassword('');
      setConfirmPassword('');
      setErrorMsg(null);
    }
  }, [open, user?.email]);

  const handleToggleBiometric = async (next: boolean) => {
    if (!user?.email) return;
    if (!next) {
      // Disable locally (credential remains on server until removed by admin/future setting)
      setLocalPasskeyFlag(user.email, false);
      setBiometricOn(false);
      toast.success('Biometria desativada neste dispositivo');
      return;
    }
    setBiometricLoading(true);
    const result = await registerPasskey(navigator.userAgent.slice(0, 80));
    setBiometricLoading(false);
    if (result.success) {
      setLocalPasskeyFlag(user.email, true);
      setBiometricOn(true);
      toast.success('Biometria ativada! Use-a no próximo login.');
    } else {
      toast.error(result.error || 'Não foi possível ativar a biometria');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    
    const validation = passwordSchema.safeParse({ password, confirmPassword });
    if (!validation.success) {
      const msg = validation.error.errors[0].message;
      setErrorMsg(msg);
      toast.error(msg);
      return;
    }

    setIsLoading(true);
    try {
      const result = await changePassword(password);
      if (result.success) {
        toast.success('Senha alterada com sucesso!');
        setPassword('');
        setConfirmPassword('');
        setPasswordOpen(false);
      } else {
        toast.error(result.error || 'Erro ao alterar senha');
      }
    } catch (err) {
      console.error('[ChangePasswordDialog] Error:', err);
      toast.error('Erro de conexão. Verifique sua internet.');
    }
    
    setIsLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm">
            <Shield className="w-4 h-4 mr-2" />
            Configurações
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Configurações
          </DialogTitle>
          <DialogDescription>
            Gerencie a segurança da sua conta
          </DialogDescription>
        </DialogHeader>

        {/* Biometria */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Autenticação
          </h3>
          <div className="rounded-lg border bg-card p-4 flex items-start gap-3">
            <div className="bg-primary/10 rounded-md p-2 shrink-0">
              <Fingerprint className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="biometric-switch" className="font-semibold cursor-pointer">
                  Biometria
                </Label>
                {biometricSupported ? (
                  <Switch
                    id="biometric-switch"
                    checked={biometricOn}
                    onCheckedChange={handleToggleBiometric}
                    disabled={biometricLoading}
                  />
                ) : (
                  <span className="text-xs text-muted-foreground">Indisponível</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {biometricLoading
                  ? 'Ativando…'
                  : biometricOn
                  ? 'Ativado — Login com biometria neste dispositivo'
                  : biometricSupported
                  ? 'Use sua impressão digital ou Face ID para entrar mais rápido'
                  : 'Seu dispositivo não suporta biometria'}
              </p>
            </div>
          </div>

          <div className="rounded-lg border bg-card p-4 flex items-start gap-3 opacity-70">
            <div className="bg-warning/15 rounded-md p-2 shrink-0">
              <Smartphone className="w-5 h-5 text-warning-foreground" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-sm">Autenticação em duas etapas</span>
                <span className="text-[10px] uppercase font-bold bg-warning/20 text-warning-foreground px-2 py-0.5 rounded">
                  Em breve
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Código SMS para mais segurança
              </p>
            </div>
          </div>
        </div>

        {/* Alterar Senha */}
        <div className="space-y-3 pt-2">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Senha
          </h3>
          <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2 mb-1">
              <Key className="w-4 h-4 text-primary" />
              <span className="font-semibold text-sm">Alterar senha</span>
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-password">Nova Senha</Label>
              <PasswordInput
                id="new-password"
                placeholder="Digite sua nova senha"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setErrorMsg(null); }}
                disabled={isLoading}
                minLength={6}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirmar Senha</Label>
              <PasswordInput
                id="confirm-password"
                placeholder="Confirme sua nova senha"
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setErrorMsg(null); }}
                disabled={isLoading}
                minLength={6}
                required
              />
            </div>

            <p className="text-xs text-muted-foreground">
              A senha deve ter pelo menos 6 caracteres
            </p>

            {errorMsg && (
              <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3">
                <p className="text-sm text-destructive font-medium">{errorMsg}</p>
              </div>
            )}

            <Button type="submit" disabled={isLoading} className="w-full">
              {isLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Alterar Senha
            </Button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ChangePasswordDialog;
