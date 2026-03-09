import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Loader2, Lock, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { z } from 'zod';

const passwordSchema = z.object({
  password: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres'),
  confirmPassword: z.string()
}).refine(data => data.password === data.confirmPassword, {
  message: 'As senhas não coincidem',
  path: ['confirmPassword']
});

interface ForcePasswordChangeDialogProps {
  open: boolean;
}

const ForcePasswordChangeDialog = ({ open }: ForcePasswordChangeDialogProps) => {
  const { changePassword, logout } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const validation = passwordSchema.safeParse({ password, confirmPassword });
    if (!validation.success) {
      toast.error(validation.error.errors[0].message);
      return;
    }

    setIsLoading(true);
    console.log('[ForcePasswordChange] Calling changePassword...');
    
    try {
      const result = await changePassword(password);
      console.log('[ForcePasswordChange] Result:', result);
      
      if (result.success) {
        setSuccess(true);
        toast.success('Senha alterada com sucesso!');
        // The dialog will close automatically when refreshUser updates passwordNeedsChange
        // But as a fallback, reload after a brief delay
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      } else {
        toast.error(result.error || 'Erro ao alterar senha. Tente novamente.');
      }
    } catch (err) {
      console.error('[ForcePasswordChange] Error:', err);
      toast.error('Erro de conexão. Verifique sua internet e tente novamente.');
    }
    
    setIsLoading(false);
  };

  const handleLogout = async () => {
    await logout();
  };

  if (success) {
    return (
      <Dialog open={open} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
          <div className="text-center py-6">
            <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">Senha alterada com sucesso!</h3>
            <p className="text-sm text-muted-foreground">Recarregando o sistema...</p>
            <Loader2 className="w-5 h-5 animate-spin text-primary mx-auto mt-4" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md [&>button]:hidden" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-amber-500/10">
              <ShieldAlert className="w-6 h-6 text-amber-500" />
            </div>
            <div>
              <DialogTitle>Troca de Senha Obrigatória</DialogTitle>
              <DialogDescription>
                Sua senha é temporária e precisa ser alterada
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-password">Nova Senha</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="new-password"
                type="password"
                placeholder="Digite sua nova senha"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-10"
                disabled={isLoading}
                minLength={6}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirmar Senha</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="confirm-password"
                type="password"
                placeholder="Confirme sua nova senha"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="pl-10"
                disabled={isLoading}
                minLength={6}
                required
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            A senha deve ter pelo menos 6 caracteres
          </p>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={handleLogout}
              disabled={isLoading}
            >
              Sair
            </Button>
            <Button type="submit" className="flex-1" disabled={isLoading}>
              {isLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Alterar Senha
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ForcePasswordChangeDialog;