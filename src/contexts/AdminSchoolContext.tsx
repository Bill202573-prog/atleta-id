import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import type { AuthUser } from './auth-context';

interface AdminSchoolContextType {
  /** The escolinha being viewed by the admin */
  escolinhaId: string;
  /** Whether this is an admin impersonating a school */
  isAdminMode: boolean;
  /** The real admin user (before override) */
  realUser: AuthUser | null;
}

const AdminSchoolContext = createContext<AdminSchoolContextType | null>(null);

/**
 * Hook to check if we're in admin school impersonation mode.
 * Returns null if not in admin mode.
 */
export function useAdminSchoolContext() {
  return useContext(AdminSchoolContext);
}

/**
 * Hook that returns the effective escolinhaId — from admin context override or auth user.
 */
export function useEffectiveEscolinhaId(): string | undefined {
  const adminCtx = useContext(AdminSchoolContext);
  const { user } = useAuth();
  return adminCtx?.escolinhaId || user?.escolinhaId;
}

/**
 * Provider that overrides the auth user's escolinhaId for admin impersonation.
 * Wraps the AuthContext so all downstream hooks see the overridden escolinhaId.
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
  const { user } = useAuth();

  // Log admin access on mount
  useEffect(() => {
    if (user?.id && escolinhaId) {
      supabase
        .from('admin_audit_log')
        .insert({
          admin_user_id: user.id,
          escolinha_id: escolinhaId,
          acao: 'acessou_escola',
          detalhes: { escolinha_nome: escolinhaNome },
          user_agent: navigator.userAgent,
        })
        .then(({ error }) => {
          if (error) console.error('Erro ao registrar audit log:', error);
        });
    }
  }, [user?.id, escolinhaId, escolinhaNome]);

  // Create overridden user with escolinhaId set
  const overriddenUser: AuthUser | null = user
    ? {
        ...user,
        escolinhaId,
        escolinhaNome: escolinhaNome || user.escolinhaNome,
      }
    : null;

  return (
    <AdminSchoolContext.Provider
      value={{
        escolinhaId,
        isAdminMode: true,
        realUser: user,
      }}
    >
      {/* 
        We use a nested AuthContext.Provider to override the user for all child components.
        This way useAuth().user.escolinhaId returns the admin-selected school.
      */}
      <OverrideAuthUser overriddenUser={overriddenUser}>
        {children}
      </OverrideAuthUser>
    </AdminSchoolContext.Provider>
  );
}

/**
 * Internal component that overrides the auth user via context.
 */
function OverrideAuthUser({
  overriddenUser,
  children,
}: {
  overriddenUser: AuthUser | null;
  children: ReactNode;
}) {
  const authContext = useAuth();
  const { AuthContext } = require('./auth-context');

  return (
    <AuthContext.Provider
      value={{
        ...authContext,
        user: overriddenUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
