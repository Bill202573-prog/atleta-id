import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { syncToCarreira } from './useSyncToCarreira';

export const COLOCACOES = [
  { value: 'campeao', label: 'Campeão', emoji: '🥇' },
  { value: 'vice', label: 'Vice-campeão', emoji: '🥈' },
  { value: 'terceiro', label: '3º Lugar', emoji: '🥉' },
] as const;

export type Colocacao = typeof COLOCACOES[number]['value'];

export interface ConquistaColetiva {
  id: string;
  evento_id: string;
  escolinha_id: string;
  colocacao: Colocacao;
  nome_campeonato: string;
  categoria: string | null;
  ano: number;
  created_at: string;
  updated_at: string;
}

export function useConquistaByEvento(eventoId: string | undefined) {
  return useQuery({
    queryKey: ['conquista-evento', eventoId],
    queryFn: async () => {
      if (!eventoId) return null;

      const { data, error } = await supabase
        .from('conquistas_coletivas')
        .select('*')
        .eq('evento_id', eventoId)
        .maybeSingle();

      if (error) throw error;
      return data as ConquistaColetiva | null;
    },
    enabled: !!eventoId,
  });
}

export function useEscolinhaConquistas(escolinhaId: string | undefined) {
  return useQuery({
    queryKey: ['conquistas-escolinha', escolinhaId],
    queryFn: async () => {
      if (!escolinhaId) return [];

      const { data, error } = await supabase
        .from('conquistas_coletivas')
        .select('*')
        .eq('escolinha_id', escolinhaId)
        .order('ano', { ascending: false });

      if (error) throw error;
      return data as ConquistaColetiva[];
    },
    enabled: !!escolinhaId,
  });
}

export interface CreateConquistaInput {
  eventoId: string;
  escolinhaId: string;
  colocacao: Colocacao;
  nomeCampeonato: string;
  categoria: string | null;
  ano: number;
}

export function useCreateConquista() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ eventoId, escolinhaId, colocacao, nomeCampeonato, categoria, ano }: CreateConquistaInput) => {
      const { data, error } = await supabase
        .from('conquistas_coletivas')
        .insert({
          evento_id: eventoId,
          escolinha_id: escolinhaId,
          colocacao,
          nome_campeonato: nomeCampeonato,
          categoria,
          ano,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['conquista-evento', variables.eventoId] });
      queryClient.invalidateQueries({ queryKey: ['conquistas-escolinha', variables.escolinhaId] });
      // Sync to all children linked to this escolinha
      syncConquistaToAllChildren(variables.escolinhaId, 'create', data);
    },
  });
}

export interface UpdateConquistaInput {
  id: string;
  eventoId: string;
  escolinhaId: string;
  colocacao: Colocacao;
}

export function useUpdateConquista() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, colocacao }: UpdateConquistaInput) => {
      const { data, error } = await supabase
        .from('conquistas_coletivas')
        .update({ colocacao })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['conquista-evento', variables.eventoId] });
      queryClient.invalidateQueries({ queryKey: ['conquistas-escolinha', variables.escolinhaId] });
      syncConquistaToAllChildren(variables.escolinhaId, 'update', data);
    },
  });
}

export interface DeleteConquistaInput {
  id: string;
  eventoId: string;
  escolinhaId: string;
}

export function useDeleteConquista() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id }: DeleteConquistaInput) => {
      const { error } = await supabase
        .from('conquistas_coletivas')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return id;
    },
    onSuccess: (deletedId, variables) => {
      queryClient.invalidateQueries({ queryKey: ['conquista-evento', variables.eventoId] });
      queryClient.invalidateQueries({ queryKey: ['conquistas-escolinha', variables.escolinhaId] });
      syncConquistaToAllChildren(variables.escolinhaId, 'delete', { id: deletedId });
    },
  });
}

/**
 * Conquistas coletivas affect ALL children in the escolinha.
 * We fetch children linked to the school and sync to each one.
 */
async function syncConquistaToAllChildren(escolinhaId: string, action: 'create' | 'update' | 'delete', data: any) {
  try {
    const { data: vinculos } = await supabase
      .from('crianca_escolinha')
      .select('crianca_id')
      .eq('escolinha_id', escolinhaId)
      .eq('ativo', true);

    if (!vinculos?.length) return;

    // Fire sync for each child (fire-and-forget)
    for (const v of vinculos) {
      syncToCarreira({
        type: 'conquista_coletiva',
        action,
        criancaId: v.crianca_id,
        data,
      });
    }
  } catch (err) {
    console.warn('[syncConquista] Failed:', err);
  }
}
