import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { Loader2, Mail, User, Fingerprint } from 'lucide-react';
import { z } from 'zod';
import logoAtletaId from '@/assets/logo-atleta-id-white.png';
import PwaInstallButton from '@/components/shared/PwaInstallButton';
import PasswordInput from '@/components/shared/PasswordInput';
import ForgotPasswordDialog from '@/components/auth/ForgotPasswordDialog';
import { canUseBiometricOnCurrentDomain, getBiometricUnavailableReason, hasLocalPasskey, isBiometricSupported, loginWithPasskey } from '@/lib/biometric';

const loginSchema = z.object({
  email: z.string().email('Email invalido'),
  password: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres'),
});

const signupSchema = z.object({
  nome: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  email: z.string().email('Email invalido'),
  password: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres'),
});

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMismatch, setPasswordMismatch] = useState(false);
  const [nome, setNome] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [showBiometric, setShowBiometric] = useState(false);
  const { login, signup, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user && user.role) navigate('/dashboard');
  }, [user, navigate]);

  // Mostrar botão biometria se houver passkey local para o email digitado (ou último email salvo)
  useEffect(() => {
    if (!isBiometricSupported() || !canUseBiometricOnCurrentDomain()) {
      setShowBiometric(false);
      return;
    }
    const lastEmail = email || localStorage.getItem('last_login_email') || '';
    if (lastEmail && hasLocalPasskey(lastEmail)) {
      setShowBiometric(true);
      if (!email) setEmail(lastEmail);
    } else {
      setShowBiometric(false);
    }
  }, [email]);

  const handleBiometricLogin = async () => {
    const unavailableReason = getBiometricUnavailableReason();
    if (unavailableReason) {
      toast({ title: 'Biometria indisponível', description: unavailableReason, variant: 'destructive' });
      return;
    }

    if (!email) {
      toast({ title: 'Informe o e-mail', description: 'Digite seu e-mail para entrar com biometria.', variant: 'destructive' });
      return;
    }

    setBiometricLoading(true);
    const result = await loginWithPasskey(email);
    setBiometricLoading(false);

    if (result.success) {
      localStorage.setItem('last_login_email', email);
      toast({ title: 'Login realizado!', description: 'Bem-vindo de volta.' });
    } else {
      toast({ title: 'Falha na biometria', description: result.error, variant: 'destructive' });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMismatch(false);

    if (!isLogin && password !== confirmPassword) {
      setPasswordMismatch(true);
      return;
    }

    setIsLoading(true);

    try {
      if (isLogin) {
        const validation = loginSchema.safeParse({ email, password });
        if (!validation.success) {
          toast({ title: 'Dados invalidos', description: validation.error.errors[0].message, variant: 'destructive' });
          setIsLoading(false);
          return;
        }
        const result = await login(email, password);
        if (result.success) {
          localStorage.setItem('last_login_email', email);
          toast({ title: 'Login realizado!', description: 'Bem-vindo ao sistema.' });
        } else {
          toast({ title: 'Erro no login', description: result.error, variant: 'destructive' });
        }
      } else {
        const validation = signupSchema.safeParse({ nome, email, password });
        if (!validation.success) {
          toast({ title: 'Dados invalidos', description: validation.error.errors[0].message, variant: 'destructive' });
          setIsLoading(false);
          return;
        }
        const result = await signup(email, password, nome);
        if (result.success) {
          toast({ title: 'Conta criada!', description: 'Sua conta foi criada com sucesso. Faca login para continuar.' });
          setIsLogin(true);
          setPassword('');
          setConfirmPassword('');
        } else {
          toast({ title: 'Erro ao criar conta', description: result.error, variant: 'destructive' });
        }
      }
    } catch (error) {
      toast({ title: 'Erro', description: 'Ocorreu um erro inesperado.', variant: 'destructive' });
    }

    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-primary p-4 relative overflow-hidden">
      {/* Background pattern */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-white/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-white/10 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative animate-fade-in">
        {/* Logo/Brand */}
        <div className="text-center mb-8">
          <img src={logoAtletaId} alt="ATLETA ID" className="h-48 w-auto mx-auto mb-4" />
          <p className="text-white text-base font-medium">Acompanhe de perto a evolução do seu filho</p>
        </div>

        <Card className="border-0 shadow-2xl">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-2xl">
              {isLogin ? 'Bem-vindo de volta' : 'Criar Conta'}
            </CardTitle>
            <CardDescription>
              {isLogin ? 'Use suas credenciais para acessar' : 'Preencha os dados para se cadastrar'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {!isLogin && (
                <div className="space-y-2">
                  <Label htmlFor="nome">Nome Completo</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input id="nome" type="text" placeholder="Seu nome completo" value={nome} onChange={(e) => setNome(e.target.value)} className="pl-10" disabled={isLoading} />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input id="email" type="email" placeholder="seu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-10" disabled={isLoading} />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Senha</Label>
                  {isLogin && (
                    <button type="button" onClick={() => setForgotOpen(true)} className="text-xs text-primary hover:underline font-medium">
                      Esqueci minha senha
                    </button>
                  )}
                </div>
                <PasswordInput id="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} disabled={isLoading} />
              </div>

              {!isLogin && (
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirmar Senha</Label>
                  <PasswordInput id="confirmPassword" placeholder="••••••••" value={confirmPassword} onChange={(e) => { setConfirmPassword(e.target.value); setPasswordMismatch(false); }} disabled={isLoading} />
                  {passwordMismatch && (
                    <p className="text-sm text-destructive font-medium">As senhas não coincidem. Verifique e tente novamente.</p>
                  )}
                </div>
              )}

              <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
                {isLoading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> {isLogin ? 'Entrando...' : 'Criando conta...'}</>
                ) : (
                  isLogin ? 'Entrar' : 'Criar Conta'
                )}
              </Button>
            </form>

            {isLogin && showBiometric && (
              <Button type="button" variant="outline" className="w-full mt-3" size="lg" onClick={handleBiometricLogin} disabled={biometricLoading || isLoading}>
                {biometricLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Fingerprint className="w-5 h-5 mr-2" /> Entrar com biometria</>}
              </Button>
            )}

            <div className="mt-4">
              <PwaInstallButton />
            </div>

            <div className="mt-6 pt-6 border-t border-border text-center">
              <p className="text-sm text-muted-foreground">
                {isLogin ? 'Nao tem uma conta?' : 'Ja tem uma conta?'}{' '}
                <button type="button" onClick={() => setIsLogin(!isLogin)} className="text-primary hover:underline font-medium">
                  {isLogin ? 'Cadastre-se' : 'Faca login'}
                </button>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <ForgotPasswordDialog open={forgotOpen} onOpenChange={setForgotOpen} defaultEmail={email} />
    </div>
  );
};

export default Auth;
