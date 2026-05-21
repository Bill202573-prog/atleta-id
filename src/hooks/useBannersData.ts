import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface Banner {
  id: string;
  titulo: string;
  imagem_url: string;
  link_url: string;
  abrir_nova_aba: boolean;
  ordem: number;
  ativo: boolean;
  inicio_em: string | null;
  fim_em: string | null;
  created_at: string;
  updated_at: string;
}

export interface BannerComEscolas extends Banner {
  escolinha_ids: string[];
}

// Banners ativos visíveis para o usuário (responsável). RLS faz o filtro.
export function useBannersAtivos() {
  return useQuery({
    queryKey: ['banners-ativos'],
    queryFn: async (): Promise<Banner[]> => {
      const { data, error } = await supabase
        .from('banners_publicitarios')
        .select('*')
        .eq('ativo', true)
        .order('ordem', { ascending: true })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as Banner[]) ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });
}

// Admin: lista todos os banners + escolas segmentadas.
export function useAdminBanners() {
  return useQuery({
    queryKey: ['admin-banners'],
    queryFn: async (): Promise<BannerComEscolas[]> => {
      const { data, error } = await supabase
        .from('banners_publicitarios')
        .select('*, banner_escolas(escolinha_id)')
        .order('ordem', { ascending: true })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((b: any) => ({
        ...b,
        escolinha_ids: (b.banner_escolas ?? []).map((be: any) => be.escolinha_id),
      }));
    },
  });
}

export interface SaveBannerInput {
  id?: string;
  titulo: string;
  imagem_url: string;
  link_url: string;
  abrir_nova_aba: boolean;
  ordem: number;
  ativo: boolean;
  inicio_em: string | null;
  fim_em: string | null;
  escolinha_ids: string[];
}

export function useSaveBanner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveBannerInput) => {
      let bannerId = input.id;
      const payload = {
        titulo: input.titulo,
        imagem_url: input.imagem_url,
        link_url: input.link_url,
        abrir_nova_aba: input.abrir_nova_aba,
        ordem: input.ordem,
        ativo: input.ativo,
        inicio_em: input.inicio_em,
        fim_em: input.fim_em,
      };

      if (bannerId) {
        const { error } = await supabase
          .from('banners_publicitarios')
          .update(payload)
          .eq('id', bannerId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('banners_publicitarios')
          .insert(payload)
          .select('id')
          .single();
        if (error) throw error;
        bannerId = data.id;
      }

      // Replace segmentações
      const { error: delErr } = await supabase
        .from('banner_escolas')
        .delete()
        .eq('banner_id', bannerId!);
      if (delErr) throw delErr;

      if (input.escolinha_ids.length > 0) {
        const rows = input.escolinha_ids.map((escolinha_id) => ({
          banner_id: bannerId!,
          escolinha_id,
        }));
        const { error: insErr } = await supabase.from('banner_escolas').insert(rows);
        if (insErr) throw insErr;
      }

      return bannerId!;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-banners'] });
      qc.invalidateQueries({ queryKey: ['banners-ativos'] });
    },
  });
}

export function useDeleteBanner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('banners_publicitarios').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-banners'] });
      qc.invalidateQueries({ queryKey: ['banners-ativos'] });
    },
  });
}
