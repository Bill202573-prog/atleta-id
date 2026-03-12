import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { syncToCarreira } from './useSyncToCarreira';

export const TIPOS_PREMIACAO = [
  { value: 'melhor_jogador', label: 'Melhor Jogador' },
  { value: 'melhor_goleiro', label: 'Melhor Goleiro' },
  { value: 'artilheiro', label: 'Artilheiro' },
  { value: 'melhor_defesa', label: 'Melhor Defesa' },
  { value: 'destaque', label: 'Destaque da Partida' },
] as const;

export type TipoPremiacao = typeof TIPOS_PREMIACAO[number]['value'];

export interface EventoPremiacao {
  id: string;
  evento_id: string;
  crianca_id: string;
  tipo_premiacao: string;
  created_at: string;
  updated_at: string;
  crianca?: {
    id: string;
    nome: string;
    foto_url: string | null;
  };
}

export function useEventoPremiacoes(eventoId: string | undefined) {
  return useQuery({
    queryKey: ['evento-premiacoes', eventoId],
    queryFn: async () => {
      if (!eventoId) return [];

      const { data, error } = await supabase
        .from('evento_premiacoes')
        .select(`
          *,
          crianca:criancas(id, nome, foto_url)
        `)
        .eq('evento_id', eventoId)
        .order('tipo_premiacao');

      if (error) throw error;
      return data as EventoPremiacao[];
    },
    enabled: !!eventoId,
  });
}

export interface CreatePremiacaoInput {
  eventoId: string;
  criancaId: string;
  tipoPremiacao: string;
}

export function useCreateEventoPremiacao() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ eventoId, criancaId, tipoPremiacao }: CreatePremiacaoInput) => {
      const { data, error } = await supabase
        .from('evento_premiacoes')
        .insert({
          evento_id: eventoId,
          crianca_id: criancaId,
          tipo_premiacao: tipoPremiacao,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['evento-premiacoes', variables.eventoId] });
      syncToCarreira({
        type: 'evento_premiacao',
        action: 'create',
        criancaId: variables.criancaId,
        data: { ...data, evento_id: variables.eventoId },
      });
    },
  });
}

export interface UpdatePremiacaoInput {
  id: string;
  eventoId: string;
  criancaId: string;
}

export function useUpdateEventoPremiacao() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, criancaId }: UpdatePremiacaoInput) => {
      const { data, error } = await supabase
        .from('evento_premiacoes')
        .update({ crianca_id: criancaId })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['evento-premiacoes', variables.eventoId] });
      if (data?.crianca_id) {
        syncToCarreira({
          type: 'evento_premiacao',
          action: 'update',
          criancaId: data.crianca_id,
          data: { ...data, evento_id: variables.eventoId },
        });
      }
    },
  });
}

export interface DeletePremiacaoInput {
  id: string;
  eventoId: string;
  criancaId?: string;
}

export function useDeleteEventoPremiacao() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id }: DeletePremiacaoInput) => {
      const { error } = await supabase
        .from('evento_premiacoes')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['evento-premiacoes', variables.eventoId] });
      if (variables.criancaId) {
        syncToCarreira({
          type: 'evento_premiacao',
          action: 'delete',
          criancaId: variables.criancaId,
          data: { id: variables.id },
        });
      }
    },
  });
}
