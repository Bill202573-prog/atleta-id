import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface EscolaResumoMensal {
  escolinha_id: string;
  nome: string;
  habilitado: boolean;
  habilitado_em: string | null;
}

export function useResumoMensalEscolas() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['resumo-mensal-escolas'],
    queryFn: async (): Promise<EscolaResumoMensal[]> => {
      const [{ data: escolas, error: e1 }, { data: habilitadas, error: e2 }] = await Promise.all([
        supabase.from('escolinhas').select('id, nome').order('nome'),
        supabase.from('resumo_mensal_escolas_habilitadas').select('escolinha_id, habilitado_em'),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      const map = new Map((habilitadas || []).map((h: any) => [h.escolinha_id, h.habilitado_em]));
      return (escolas || []).map((e: any) => ({
        escolinha_id: e.id,
        nome: e.nome,
        habilitado: map.has(e.id),
        habilitado_em: map.get(e.id) ?? null,
      }));
    },
  });

  const toggle = useMutation({
    mutationFn: async ({ escolinha_id, habilitar }: { escolinha_id: string; habilitar: boolean }) => {
      if (habilitar) {
        const { data: userData } = await supabase.auth.getUser();
        const { error } = await supabase
          .from('resumo_mensal_escolas_habilitadas')
          .insert({ escolinha_id, habilitado_por: userData.user?.id });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('resumo_mensal_escolas_habilitadas')
          .delete()
          .eq('escolinha_id', escolinha_id);
        if (error) throw error;
      }
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['resumo-mensal-escolas'] });
      toast.success(vars.habilitar ? 'Escola habilitada' : 'Escola desabilitada');
    },
    onError: (e: any) => toast.error(e.message || 'Erro ao atualizar'),
  });

  return { ...query, toggle };
}
