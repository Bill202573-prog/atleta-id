import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ResumoMensalData {
  crianca: { id: string; nome: string; foto_url: string | null };
  escola: { id: string; nome: string; logo_url: string | null };
  ano: number;
  mes: number;
  presenca: { aulas_total: number; aulas_presentes: number; percentual: number };
  participacoes: { amistosos: number; campeonatos: number; jogos: number };
}

/** Mês de referência padrão = mês anterior ao atual. */
export function getDefaultResumoRef() {
  const now = new Date();
  let mes = now.getMonth(); // 0..11 → mês anterior 0-index
  let ano = now.getFullYear();
  if (mes === 0) { mes = 12; ano -= 1; }
  return { ano, mes }; // mes em 1..12
}

export function useResumoMensalEnabled(criancaId: string | null | undefined) {
  return useQuery({
    queryKey: ['resumo-mensal-enabled', criancaId],
    queryFn: async () => {
      if (!criancaId) return false;
      const { data, error } = await supabase.rpc('is_crianca_resumo_mensal_enabled', {
        p_crianca_id: criancaId,
      });
      if (error) throw error;
      return !!data;
    },
    enabled: !!criancaId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useResumoMensal(criancaId: string | null | undefined, ano: number, mes: number) {
  return useQuery({
    queryKey: ['resumo-mensal', criancaId, ano, mes],
    queryFn: async () => {
      if (!criancaId) return null;
      const { data, error } = await supabase.rpc('get_resumo_mensal_atleta', {
        p_crianca_id: criancaId,
        p_ano: ano,
        p_mes: mes,
      });
      if (error) throw error;
      return data as unknown as ResumoMensalData;
    },
    enabled: !!criancaId,
  });
}

export const NOMES_MESES = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
];

export function mensagemEmocional(d: ResumoMensalData): string {
  const { presenca, participacoes } = d;
  if (participacoes.jogos > 0 && presenca.percentual >= 80) {
    return 'Mais um mês de dedicação e evolução dentro de campo.';
  }
  if (presenca.percentual >= 90) {
    return 'Presença, foco e compromisso — assim se constrói uma trajetória.';
  }
  if (participacoes.jogos > 0) {
    return 'Cada jogo disputado é mais um capítulo na sua jornada esportiva.';
  }
  if (presenca.aulas_total > 0) {
    return 'A evolução é construída treino após treino.';
  }
  return 'Cada treino faz parte da trajetória esportiva.';
}
