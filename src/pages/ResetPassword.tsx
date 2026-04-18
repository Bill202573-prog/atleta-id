import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import logoAtletaId from '@/assets/logo-atleta-id.png';
import PasswordInput from '@/components/shared/PasswordInput';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Supabase auto-handles the recovery token in the URL hash.
    // We just confirm a session exists (recovery temporarily authenticates the user).
    const check = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        // Wait briefly for hash processing
        setTimeout(async () => {
          const { data: d2 } = await supabase.auth.getSession();
          if (!d2.session) {
            toast({
              title: 'Link inválido ou expirado',
              description: 'Solicite um novo link de recuperação.',
              variant: 'destructive',
            });
            navigate('/auth');
          } else {
            setReady(true);
          }
        }, 1000);
      } else {
        setReady(true);
      }
    };
    check();
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast({ title: 'Senha muito curta', description: 'Mínimo de 6 caracteres.', variant: 'destructive' });
      return;
    }
    if (password !== confirm) {
      toast({ title: 'Senhas não conferem', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast({ title: 'Senha alterada!', description: 'Você já pode acessar com a nova senha.' });
      await supabase.auth.signOut();
      navigate('/auth');
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary via-primary to-primary/80 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src={logoAtletaId} alt="ATLETA ID" className="h-24 w-auto mx-auto mb-4 brightness-0 invert" />
        </div>
        <Card className="border-0 shadow-2xl">
          <CardHeader className="text-center">
            <CardTitle className="text-xl">Criar nova senha</CardTitle>
            <CardDescription>Defina uma nova senha para sua conta</CardDescription>
          </CardHeader>
          <CardContent>
            {!ready ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="new-password">Nova senha</Label>
                  <PasswordInput
                    id="new-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirmar senha</Label>
                  <PasswordInput
                    id="confirm-password"
                    placeholder="••••••••"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    disabled={loading}
                  />
                </div>
                <Button type="submit" className="w-full" size="lg" disabled={loading}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Alterar senha'}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
