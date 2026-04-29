import { useAuth } from '@/contexts/AuthContext';
import { useGuardianProfile } from '@/hooks/useSchoolData';

/**
 * Feature flag - "Meus Dados" (edição do cadastro pelo responsável).
 * Beta: liberado apenas para wnogueira@hotmail.com enquanto testamos.
 */
export const useMeusDadosEnabled = () => {
  const { user } = useAuth();
  const { data: guardian } = useGuardianProfile();

  const enabledEmails = ['wnogueira@hotmail.com'];

  const email = (user?.email || guardian?.email || '').toLowerCase();
  return { isEnabled: enabledEmails.includes(email), email };
};
