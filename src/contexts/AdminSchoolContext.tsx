import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { AuthContext } from '@/contexts/auth-context';
import { supabase } from '@/integrations/supabase/client';
import type { AuthUser } from './auth-context';

interface AdminSchoolContextType {
  escolinhaId: string;
  isAdminMode: boolean;
  realUser: AuthUser | null;
}

const AdminSchoolCtx = createContext<AdminSchoolContextType | null>(null);

export function useAdminSchoolContext() {
  return useContext(AdminSchoolCtx);
}

export function useEffectiveEscolinhaId(): string | undefined {
  const adminCtx = useContext(AdminSchoolCtx);
  const { user } = useAuth();
  return adminCtx?.escolinhaId || user?.escolinhaId;
}

/**
 * Logs an admin action to the audit table (fire-and-forget).
 */
export function logAdminAction(
  adminUserId: string,
  escolinhaId: string,
  acao: string,
  detalhes?: Record<string, unknown>
) {
  supabase
    .from('admin_audit_log')
    .insert({
      admin_user_id: adminUserId,
      escolinha_id: escolinhaId,
      acao,
      detalhes: detalhes || {},
      user_agent: navigator.userAgent,
    })
    .then(({ error }) => {
      if (error) console.error('Erro ao registrar audit log:', error);
    });
}

/**
 * Wraps children so that useAuth().user.escolinhaId returns the admin-selected school.
 * All existing school hooks work transparently.
 */
export function AdminSchoolProvider({
  escolinhaId,
  escolinhaNome,
  children,
}: {
  escolinhaId: string;
  escolinhaNome?: string;
  children: ReactNode;
}) {
  const authContext = useAuth();
  const { user } = authContext;

  // Log admin access on mount
  useEffect(() => {
    if (user?.id && escolinhaId) {
      logAdminAction(user.id, escolinhaId, 'acessou_escola', {
        escolinha_nome: escolinhaNome,
      });
    }
  }, [user?.id, escolinhaId, escolinhaNome]);

  // Create overridden user with escolinhaId
  const overriddenUser: AuthUser | null = user
    ? {
        ...user,
        escolinhaId,
        escolinhaNome: escolinhaNome || user.escolinhaNome,
      }
    : null;

  return (
    <AdminSchoolCtx.Provider
      value={{
        escolinhaId,
        isAdminMode: true,
        realUser: user,
      }}
    >
      <AuthContext.Provider
        value={{
          ...authContext,
          user: overriddenUser,
        }}
      >
        {children}
      </AuthContext.Provider>
    </AdminSchoolCtx.Provider>
  );
}
