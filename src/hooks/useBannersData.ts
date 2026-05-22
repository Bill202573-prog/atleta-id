import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type BannerPosicao = 'topo' | 'produtos';

export interface BannerSlide {
  imagem_url: string;
  link_url: string;
  abrir_nova_aba: boolean;
}

export interface Banner {
  id: string;
  titulo: string;
  imagem_url: string;
  link_url: string;
  abrir_nova_aba: boolean;
  ordem: number;
  ativo: boolean;
  posicao: BannerPosicao;
  slides: BannerSlide[];
  autoplay_segundos: number;
  inicio_em: string | null;
  fim_em: string | null;
  created_at: string;
  updated_at: string;
}

export interface BannerComEscolas extends Banner {
  escolinha_ids: string[];
}

function normalizeSlides(row: any): BannerSlide[] {
  const raw = Array.isArray(row?.slides) ? row.slides : [];
  const slides: BannerSlide[] = raw
    .filter((s: any) => s && s.imagem_url)
    .map((s: any) => ({
      imagem_url: String(s.imagem_url),
      link_url: String(s.link_url ?? ''),
      abrir_nova_aba: Boolean(s.abrir_nova_aba ?? true),
    }));
  if (slides.length === 0 && row?.imagem_url) {
    slides.push({
      imagem_url: row.imagem_url,
      link_url: row.link_url ?? '',
      abrir_nova_aba: Boolean(row.abrir_nova_aba ?? true),
    });
  }
  return slides.slice(0, 5);
}

// Banners ativos visíveis para o usuário (responsável). RLS faz o filtro.
export function useBannersAtivos(posicao?: BannerPosicao) {
  const { session } = useAuth();
  const userId = session?.user?.id;

  return useQuery({
    queryKey: ['banners-ativos', userId ?? 'anonymous', posicao ?? 'all'],
    queryFn: async (): Promise<Banner[]> => {
      let q = supabase
        .from('banners_publicitarios')
        .select('*')
        .eq('ativo', true)
        .order('ordem', { ascending: true })
        .order('created_at', { ascending: false });
      if (posicao) q = q.eq('posicao', posicao);
      const { data, error } = await q;
      if (error) throw error;
      return ((data as any[]) ?? []).map((b) => ({
        ...b,
        posicao: (b.posicao ?? 'topo') as BannerPosicao,
        slides: normalizeSlides(b),
        autoplay_segundos: Number(b.autoplay_segundos ?? 5),
      })) as Banner[];
    },
    enabled: !!userId,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
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
        posicao: (b.posicao ?? 'topo') as BannerPosicao,
        slides: normalizeSlides(b),
        autoplay_segundos: Number(b.autoplay_segundos ?? 5),
        escolinha_ids: (b.banner_escolas ?? []).map((be: any) => be.escolinha_id),
      }));
    },
  });
}

export interface SaveBannerInput {
  id?: string;
  titulo: string;
  posicao: BannerPosicao;
  slides: BannerSlide[];
  ordem: number;
  ativo: boolean;
  autoplay_segundos: number;
  inicio_em: string | null;
  fim_em: string | null;
  escolinha_ids: string[];
}

export function useSaveBanner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveBannerInput) => {
      const slides = input.slides.slice(0, 5);
      if (slides.length === 0) throw new Error('Adicione ao menos 1 imagem');
      const first = slides[0];
      let bannerId = input.id;
      const autoplay = Math.min(60, Math.max(2, Math.round(input.autoplay_segundos || 5)));
      const payload: any = {
        titulo: input.titulo,
        posicao: input.posicao,
        slides: slides as any,
        // espelha o primeiro slide nas colunas legadas para compatibilidade
        imagem_url: first.imagem_url,
        link_url: first.link_url,
        abrir_nova_aba: first.abrir_nova_aba,
        ordem: input.ordem,
        ativo: input.ativo,
        autoplay_segundos: autoplay,
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
