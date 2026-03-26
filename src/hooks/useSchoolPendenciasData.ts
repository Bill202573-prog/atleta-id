import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { differenceInDays } from 'date-fns';

export interface PendenciaAmistoso {
  tipo: 'amistoso_aberto';
  id: string;
  nome: string;
  data: string;
  diasAtraso: number;
}

export interface PendenciaChamada {
  tipo: 'chamada_pendente';
  id: string;
  turma_nome: string;
  data: string;
  diasAtraso: number;
}

export type Pendencia = PendenciaAmistoso | PendenciaChamada;

export function useSchoolPendencias(escolinhaId: string | undefined) {
  return useQuery({
    queryKey: ['school-pendencias', escolinhaId],
    queryFn: async (): Promise<Pendencia[]> => {
      if (!escolinhaId) return [];
      const pendencias: Pendencia[] = [];
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];

      // 1. Amistosos em aberto (status != finalizado/cancelado, data já passou)
      const { data: eventos } = await supabase
        .from('eventos_esportivos')
        .select('id, nome, data, status')
        .eq('escolinha_id', escolinhaId)
        .eq('tipo', 'amistoso')
        .in('status', ['agendado', 'confirmado'])
        .lte('data', todayStr)
        .order('data', { ascending: true });

      (eventos || []).forEach(e => {
        const diasAtraso = differenceInDays(today, new Date(e.data + 'T12:00:00'));
        if (diasAtraso >= 1) {
          pendencias.push({
            tipo: 'amistoso_aberto',
            id: e.id,
            nome: e.nome,
            data: e.data,
            diasAtraso,
          });
        }
      });

      // 2. Aulas com chamada pendente (data já passou, sem presença registrada)
      const { data: turmas } = await supabase
        .from('turmas')
        .select('id, nome')
        .eq('escolinha_id', escolinhaId)
        .eq('ativa', true);

      if (turmas && turmas.length > 0) {
        const turmaIds = turmas.map(t => t.id);
        const turmaMap = Object.fromEntries(turmas.map(t => [t.id, t.nome]));

        // Get past aulas with status normal/extra
        const { data: aulas } = await supabase
          .from('aulas')
          .select('id, data, turma_id, status')
          .in('turma_id', turmaIds)
          .in('status', ['normal', 'extra'])
          .lt('data', todayStr)
          .order('data', { ascending: true })
          .limit(200);

        if (aulas && aulas.length > 0) {
          // Check which aulas have presencas
          const aulaIds = aulas.map(a => a.id);
          const { data: presencas } = await supabase
            .from('presencas')
            .select('aula_id')
            .in('aula_id', aulaIds);

          const aulasComPresenca = new Set((presencas || []).map(p => p.aula_id));

          aulas.forEach(a => {
            if (!aulasComPresenca.has(a.id)) {
              const diasAtraso = differenceInDays(today, new Date(a.data + 'T12:00:00'));
              if (diasAtraso >= 1) {
                pendencias.push({
                  tipo: 'chamada_pendente',
                  id: a.id,
                  turma_nome: turmaMap[a.turma_id] || 'Turma',
                  data: a.data,
                  diasAtraso,
                });
              }
            }
          });
        }
      }

      // Sort by dias de atraso desc
      pendencias.sort((a, b) => b.diasAtraso - a.diasAtraso);

      return pendencias;
    },
    enabled: !!escolinhaId,
    refetchInterval: 10 * 60 * 1000,
  });
}
