import { useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

// Use the same constants from the client file (these are public/anon keys)
const SUPABASE_URL = "https://vxzktyklzkfqitptzctk.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4emt0eWtsemtmcWl0cHR6Y3RrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5MzE0MTcsImV4cCI6MjA4ODUwNzQxN30.XUgZRd_p8y-80zMYEjIsG5CiEYf8f-pmWCRkp64lElo";
import type { UserRole } from '@/types';
import { AuthContext, type AuthContextType, type AuthUser } from './auth-context';
import { useQueryClient } from '@tanstack/react-query';
import { syncBiometricSession } from '@/lib/biometric';

// Função para registrar acesso (definida aqui para evitar dependência circular)
async function registrarAcesso(
  userId: string,
  userRole: string,
  escolinhaId?: string | null
) {
  try {
    const { error } = await supabase
      .from('acessos_log')
      .insert({
        user_id: userId,
        user_role: userRole,
        escolinha_id: escolinhaId || null,
        user_agent: navigator.userAgent,
      });

    if (error) {
      console.error('Erro ao registrar acesso:', error);
    }
  } catch (err) {
    console.error('Erro ao registrar acesso:', err);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const queryClient = useQueryClient();
  const sessionRef = useRef<Session | null>(null);
  const fetchingRef = useRef(false);
  const lastAccessLogRef = useRef<string | null>(null);

  // Mantém referência atualizada para comparar eventos de auth (ex: TOKEN_REFRESHED)
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const fetchUserData = async (userId: string): Promise<AuthUser | null> => {
    try {
      console.log('[AuthContext] fetchUserData starting for:', userId);
      const [
        { data: roleData, error: roleError },
        { data: profileData, error: profileError },
      ] = await Promise.all([
        supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', userId)
          .maybeSingle(),
        supabase
          .from('profiles')
          .select('nome, avatar_url, email, password_needs_change')
          .eq('user_id', userId)
          .maybeSingle(),
      ]);

      if (!profileData) {
        console.warn('[AuthContext] fetchUserData: missing profile', { profileError });
        // Return a minimal user so the app can render an "incomplete account" screen
        // instead of staying stuck on /login with a success toast.
        return {
          id: userId,
          email: '',
          role: null as unknown as UserRole,
          name: 'Conta incompleta',
        };
      }

      if (!roleData) {
        console.warn('[AuthContext] fetchUserData: missing role for user', userId, roleError);
        return {
          id: userId,
          email: profileData.email,
          role: null as unknown as UserRole,
          name: profileData.nome,
          avatarUrl: profileData.avatar_url,
          passwordNeedsChange: profileData.password_needs_change || false,
        };
      }

      let escolinhaId: string | undefined;
      let escolinhaNome: string | undefined;

      // Se for escola, buscar a escolinha
      if (roleData.role === 'school') {
        const { data: escolinhaAdmin } = await supabase
          .from('escolinhas')
          .select('id, nome')
          .eq('admin_user_id', userId)
          .maybeSingle();

        if (escolinhaAdmin) {
          escolinhaId = escolinhaAdmin.id;
          escolinhaNome = escolinhaAdmin.nome;
        } else {
          const { data: escolinhaSocio } = await supabase
            .from('escolinhas')
            .select('id, nome')
            .eq('socio_user_id', userId)
            .maybeSingle();
          escolinhaId = escolinhaSocio?.id;
          escolinhaNome = escolinhaSocio?.nome;
        }
      }

      // Se for professor, buscar a escolinha
      if (roleData.role === 'teacher') {
        const { data: professorData } = await supabase
          .from('professores')
          .select('escolinha_id')
          .eq('user_id', userId)
          .maybeSingle();
        escolinhaId = professorData?.escolinha_id;
      }

      // Se for responsável, buscar a escolinha pelo vínculo do filho para registrar acesso por escola
      if (roleData.role === 'guardian') {
        const { data: responsavelData } = await supabase
          .from('responsaveis')
          .select('id')
          .eq('user_id', userId)
          .maybeSingle();

        if (responsavelData?.id) {
          const { data: vinculoEscola } = await supabase
            .from('crianca_responsavel')
            .select('criancas!inner(crianca_escolinha!inner(escolinha_id, escolinhas!inner(nome)))')
            .eq('responsavel_id', responsavelData.id)
            .limit(1)
            .maybeSingle();

          const asRecord = (value: unknown): Record<string, unknown> | null =>
            value && typeof value === 'object' ? value as Record<string, unknown> : null;
          const firstOrValue = (value: unknown): unknown => Array.isArray(value) ? value[0] : value;
          const crianca = asRecord(firstOrValue(asRecord(vinculoEscola)?.criancas));
          const criancaEscola = asRecord(firstOrValue(crianca?.crianca_escolinha));
          const escola = asRecord(firstOrValue(criancaEscola?.escolinhas));

          escolinhaId = typeof criancaEscola?.escolinha_id === 'string' ? criancaEscola.escolinha_id : undefined;
          escolinhaNome = typeof escola?.nome === 'string' ? escola.nome : undefined;
        }
      }

      console.log('[AuthContext] fetchUserData success:', roleData.role, profileData.nome);

      return {
        id: userId,
        email: profileData.email,
        role: roleData.role as UserRole,
        name: profileData.nome,
        avatarUrl: profileData.avatar_url,
        escolinhaId,
        escolinhaNome,
        passwordNeedsChange: profileData.password_needs_change || false,
      };
    } catch (error) {
      console.error('[AuthContext] fetchUserData error:', error);
      return null;
    }
  };

  const hydrateAuthenticatedUser = async (
    nextSession: Session,
    source: 'SIGNED_IN' | 'INITIAL_SESSION' | 'USER_UPDATED' | 'MANUAL_LOGIN'
  ) => {
    setSession(nextSession);
    sessionRef.current = nextSession;
    setIsLoading(true);
    fetchingRef.current = true;

    const userData = await fetchUserData(nextSession.user.id);
    setUser(userData);

    if ((source === 'SIGNED_IN' || source === 'MANUAL_LOGIN') && userData) {
      const logKey = `${nextSession.user.id}:${Math.floor(Date.now() / 10000)}`;
      if (lastAccessLogRef.current !== logKey) {
        lastAccessLogRef.current = logKey;
        registrarAcesso(nextSession.user.id, userData.role || 'unknown', userData.escolinhaId || null).catch(() => {});
      }
    }

    setIsLoading(false);
    fetchingRef.current = false;
    return userData;
  };

  const refreshUser = async () => {
    if (session?.user) {
      const userData = await fetchUserData(session.user.id);
      setUser(userData);
    }
  };

  useEffect(() => {
    // Configurar listener de autenticacao PRIMEIRO
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, nextSession) => {
        const prevUserId = sessionRef.current?.user?.id ?? null;
        const nextUserId = nextSession?.user?.id ?? null;
        const isSameUser = !!prevUserId && prevUserId === nextUserId;

        console.log('[AuthContext] onAuthStateChange:', event, 'userId:', nextUserId, 'isSameUser:', isSameUser);

        // Sempre atualiza a sessão (necessário para manter token atualizado)
        setSession(nextSession);
        sessionRef.current = nextSession;

        // Mantém o cofre de biometria sincronizado com a sessão mais recente
        // (cobre SIGNED_IN, TOKEN_REFRESHED, INITIAL_SESSION e USER_UPDATED).
        if (nextSession?.user?.email && nextSession.refresh_token) {
          void syncBiometricSession(nextSession.user.email, {
            access_token: nextSession.access_token,
            refresh_token: nextSession.refresh_token,
            expires_at: nextSession.expires_at,
          });
        }

        // Se não há usuário, encerra e limpa estado
        if (!nextSession?.user) {
          console.log('[AuthContext] No session user, clearing state');
          setUser(null);
          setIsLoading(false);
          fetchingRef.current = false;
          return;
        }

        // Evita "piscar/loading" ao voltar para a aba ou re-login do mesmo user
        if (isSameUser && (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN')) {
          console.log(`[AuthContext] ${event} same user, skipping re-fetch`);
          return;
        }

        // Evita fetch duplicado se já está carregando
        if (fetchingRef.current) {
          console.log('[AuthContext] Already fetching, skipping duplicate');
          return;
        }

        // Para SIGNED_IN / INITIAL_SESSION / USER_UPDATED, atualiza dados do usuário
        console.log('[AuthContext] Setting isLoading=true, fetching user data...');
        setTimeout(() => {
          hydrateAuthenticatedUser(nextSession, event === 'USER_UPDATED' ? 'USER_UPDATED' : event === 'INITIAL_SESSION' ? 'INITIAL_SESSION' : 'SIGNED_IN')
            .then((userData) => console.log('[AuthContext] onAuthStateChange hydrate result:', userData?.role))
            .catch((error) => {
              console.error('[AuthContext] onAuthStateChange hydrate error:', error);
              setIsLoading(false);
              fetchingRef.current = false;
            });
        }, 0);
      }
    );

    // DEPOIS verificar sessao existente
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log('[AuthContext] getSession result:', session?.user?.id ? 'has session' : 'no session');
      setSession(session);
      sessionRef.current = session;

      if (session?.user?.email && session.refresh_token) {
        void syncBiometricSession(session.user.email, {
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_at: session.expires_at,
        });
      }

      if (session?.user) {
        if (fetchingRef.current) {
          console.log('[AuthContext] getSession: already fetching from onAuthStateChange, skipping');
          return;
        }
        hydrateAuthenticatedUser(session, 'INITIAL_SESSION').then(userData => {
          console.log('[AuthContext] getSession hydrate result:', userData?.role);
        }).catch(() => {
          setIsLoading(false);
          fetchingRef.current = false;
        });
      } else {
        setIsLoading(false);
      }
    });

    // Safety timeout - prevent infinite loading
    const safetyTimeout = setTimeout(() => {
      setIsLoading(prev => {
        if (prev) {
          console.warn('[AuthContext] Safety timeout triggered - forcing isLoading=false');
          fetchingRef.current = false;
          return false;
        }
        return prev;
      });
    }, 10000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(safetyTimeout);
    };
  }, []);

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    const logAttempt = (success: boolean, error_message?: string | null) => {
      supabase.functions.invoke('log-login-attempt', {
        body: { email, success, error_message: error_message || null },
      }).catch(() => {});
    };

    try {
      // Clear all cached queries before login to ensure fresh data
      queryClient.clear();
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        logAttempt(false, error.message);
        if (error.message.includes('Invalid login credentials')) {
          return { success: false, error: 'Email ou senha incorretos' };
        }
        return { success: false, error: error.message };
      }

      if (data.session) {
        logAttempt(true);
        await hydrateAuthenticatedUser(data.session, 'MANUAL_LOGIN');
      }

      return { success: true };
    } catch (error) {
      logAttempt(false, (error as Error)?.message || 'Erro ao fazer login');
      return { success: false, error: 'Erro ao fazer login' };
    }
  };

  const signup = async (email: string, password: string, nome: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const redirectUrl = `${window.location.origin}/`;
      
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            nome,
          },
        },
      });

      if (error) {
        if (error.message.includes('already registered')) {
          return { success: false, error: 'Este email ja esta cadastrado' };
        }
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: 'Erro ao criar conta' };
    }
  };

  const changePassword = async (newPassword: string): Promise<{ success: boolean; error?: string }> => {
    try {
      console.log('[AuthContext] changePassword: starting...');
      const { data: { session: currentSession } } = await supabase.auth.getSession();

      if (!currentSession) {
        console.error('[AuthContext] changePassword: no session');
        return { success: false, error: 'Sessão expirada. Faça login novamente.' };
      }

      const url = `${SUPABASE_URL}/functions/v1/change-password`;
      console.log('[AuthContext] changePassword: calling', url);

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${currentSession.access_token}`,
        },
        body: JSON.stringify({ new_password: newPassword }),
      });

      console.log('[AuthContext] changePassword: status', res.status);

      let payload: unknown = null;
      try {
        payload = await res.json();
        console.log('[AuthContext] changePassword: payload', payload);
      } catch {
        console.error('[AuthContext] changePassword: failed to parse response');
        payload = null;
      }

      if (!res.ok) {
        const payloadRecord = payload && typeof payload === 'object' ? payload as Record<string, unknown> : null;
        const message =
          (typeof payloadRecord?.error === 'string' && payloadRecord.error) ||
          (typeof payloadRecord?.message === 'string' && payloadRecord.message) ||
          `Erro (${res.status}) ao alterar senha`;
        console.error('[AuthContext] changePassword: error', message);
        return { success: false, error: message };
      }

      // Refresh user data to update passwordNeedsChange
      console.log('[AuthContext] changePassword: success, refreshing user...');
      await refreshUser();

      return { success: true };
    } catch (error) {
      console.error('[AuthContext] changePassword: exception', error);
      return { success: false, error: 'Erro ao alterar senha. Verifique sua conexão.' };
    }
  };

  const logout = async () => {
    // Clear all cached queries on logout to ensure fresh data on next login
    queryClient.clear();
    await supabase.auth.signOut({ scope: 'local' });
    setUser(null);
    setSession(null);
  };

  return (
    <AuthContext.Provider value={{ user, session, isLoading, login, signup, logout, changePassword, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
