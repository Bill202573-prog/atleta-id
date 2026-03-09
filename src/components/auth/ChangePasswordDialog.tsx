import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Loader2, Key } from 'lucide-react';
import { z } from 'zod';
import PasswordInput from '@/components/shared/PasswordInput';

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
  const { changePassword } = useAuth();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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
    console.log('[ChangePasswordDialog] Calling changePassword...');
    
    try {
      const result = await changePassword(password);
      console.log('[ChangePasswordDialog] Result:', result);
      
      if (result.success) {
        toast.success('Senha alterada com sucesso!');
        setOpen(false);
        setPassword('');
        setConfirmPassword('');
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
            <Key className="w-4 h-4 mr-2" />
            Alterar Senha
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="w-5 h-5" />
            Alterar Senha
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
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

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isLoading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Alterar Senha
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ChangePasswordDialog;