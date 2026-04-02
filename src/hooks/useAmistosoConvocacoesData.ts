import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { differenceInYears } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { syncToCarreira } from './useSyncToCarreira';

export interface AmistosoConvocacao {
  id: string;
  evento_id: string;
  crianca_id: string;
  valor: number | null;
  isento: boolean;
  status: string;
  data_pagamento: string | null;
  notificado_em: string | null;
  presente: boolean | null;
  motivo_ausencia: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConvocacaoWithCrianca extends AmistosoConvocacao {
  crianca: {
    id: string;
    nome: string;
    data_nascimento: string;
    foto_url: string | null;
  };
}

export interface CreateAmistosoConvocacaoInput {
  evento_id: string;
  crianca_id: string;
  valor?: number | null;
  isento?: boolean;
}

// Fetch convocacoes for an amistoso
export function useAmistosoConvocacoes(eventoId: string | null) {
  return useQuery({
    queryKey: ['amistoso-convocacoes', eventoId],
    queryFn: async () => {
      if (!eventoId) return [];

      const { data: convocacoes, error } = await supabase
        .from('amistoso_convocacoes')
        .select('*')
        .eq('evento_id', eventoId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const criancaIds = convocacoes.map(c => c.crianca_id);
      if (criancaIds.length === 0) return [];

      const { data: criancas, error: criancasError } = await supabase
        .from('criancas')
        .select('id, nome, data_nascimento, foto_url')
        .in('id', criancaIds);

      if (criancasError) throw criancasError;

      // Fetch visualizations for these convocations
      const convocacaoIds = convocacoes.map(c => c.id);
      const { data: visualizacoes } = await supabase
        .from('convocacao_visualizacoes')
        .select('convocacao_id, visualizado_em')
        .in('convocacao_id', convocacaoIds);

      const vizMap = new Map((visualizacoes || []).map(v => [v.convocacao_id, v.visualizado_em]));
      const criancaMap = new Map(criancas.map(c => [c.id, c]));

      return convocacoes.map(conv => ({
        ...conv,
        crianca: criancaMap.get(conv.crianca_id),
        visualizado_em: vizMap.get(conv.id) || null,
      })) as (ConvocacaoWithCrianca & { visualizado_em: string | null })[];
    },
    enabled: !!eventoId,
  });
}

// Summary stats for an amistoso convocation
export interface AmistosoConvocacaoStats {
  convocados: number;
  visualizados: number;
  pagos: number;
  isentos: number;
}

export function useAmistosoConvocacoesStats(eventoId: string | null) {
  return useQuery({
    queryKey: ['amistoso-convocacoes-stats', eventoId],
    queryFn: async (): Promise<AmistosoConvocacaoStats> => {
      if (!eventoId) return { convocados: 0, visualizados: 0, pagos: 0, isentos: 0 };

      const { data: convocacoes, error } = await supabase
        .from('amistoso_convocacoes')
        .select('id, status, isento, notificado_em')
        .eq('evento_id', eventoId);

      if (error) throw error;
      if (!convocacoes || convocacoes.length === 0) return { convocados: 0, visualizados: 0, pagos: 0, isentos: 0 };

      const convocacaoIds = convocacoes.map(c => c.id);
      const { data: visualizacoes } = await supabase
        .from('convocacao_visualizacoes')
        .select('convocacao_id')
        .in('convocacao_id', convocacaoIds);

      const vizSet = new Set((visualizacoes || []).map(v => v.convocacao_id));

      return {
        convocados: convocacoes.length,
        visualizados: convocacoes.filter(c => vizSet.has(c.id)).length,
        pagos: convocacoes.filter(c => c.status === 'pago' || c.status === 'confirmado').length,
        isentos: convocacoes.filter(c => c.isento).length,
      };
    },
    enabled: !!eventoId,
  });
}

// Count convocacoes for an amistoso
export function useAmistosoConvocacoesCount(eventoId: string | null) {
  return useQuery({
    queryKey: ['amistoso-convocacoes-count', eventoId],
    queryFn: async () => {
      if (!eventoId) return 0;

      const { count, error } = await supabase
        .from('amistoso_convocacoes')
        .select('*', { count: 'exact', head: true })
        .eq('evento_id', eventoId);

      if (error) throw error;
      return count || 0;
    },
    enabled: !!eventoId,
  });
}

// Upsert convocacoes (create or update multiple)
export function useUpsertAmistosoConvocacoes() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      eventoId, 
      convocacoes,
      enviarNotificacoes = false,
      valorPadrao = null,
    }: { 
      eventoId: string; 
      convocacoes: CreateAmistosoConvocacaoInput[];
      enviarNotificacoes?: boolean;
      valorPadrao?: number | null;
    }) => {
      // First, get existing convocacoes
      const { data: existing, error: fetchError } = await supabase
        .from('amistoso_convocacoes')
        .select('id, crianca_id, notificado_em, status')
        .eq('evento_id', eventoId);

      if (fetchError) throw fetchError;

      const existingMap = new Map(existing.map(e => [e.crianca_id, e]));
      const newCriancaIds = new Set(convocacoes.map(c => c.crianca_id));

      // Delete removed convocacoes (only if not already notified and not paid)
      const toDelete = existing.filter(e => 
        !newCriancaIds.has(e.crianca_id) && 
        !e.notificado_em && 
        e.status !== 'pago'
      );
      if (toDelete.length > 0) {
        const { error: deleteError } = await supabase
          .from('amistoso_convocacoes')
          .delete()
          .in('id', toDelete.map(d => d.id));

        if (deleteError) throw deleteError;
      }

      // Insert new convocacoes
      const toInsert = convocacoes.filter(c => !existingMap.has(c.crianca_id));
      
      
      if (toInsert.length > 0) {
        const insertData = toInsert.map(c => ({
          evento_id: eventoId,
          crianca_id: c.crianca_id,
          valor: c.valor ?? valorPadrao ?? null,
          isento: c.isento ?? false,
          notificado_em: enviarNotificacoes ? new Date().toISOString() : null,
        }));
        
        const { data: insertedRecords, error: insertError } = await supabase
          .from('amistoso_convocacoes')
          .insert(insertData)
          .select('id, crianca_id, valor, isento');

        if (insertError) throw insertError;
        
        // Track newly inserted IDs that need billing generation
        if (insertedRecords && enviarNotificacoes) {
          insertedRecords
            .filter(r => !r.isento && r.valor && r.valor > 0)
            .forEach(r => newInsertedIds.push(r.id));
        }
      }

      // Update existing convocacoes
      const toUpdate = convocacoes.filter(c => existingMap.has(c.crianca_id));
      const newlyNotifiedIds: string[] = [];
      
      for (const conv of toUpdate) {
        const existingItem = existingMap.get(conv.crianca_id);
        if (existingItem && existingItem.status !== 'pago') {
          const updateData: any = {
            valor: conv.valor ?? valorPadrao ?? null,
            isento: conv.isento ?? false,
          };
          
          // Only set notificado_em if sending notifications and not already sent
          if (enviarNotificacoes && !existingItem.notificado_em) {
            updateData.notificado_em = new Date().toISOString();
          }
          
          const { error: updateError } = await supabase
            .from('amistoso_convocacoes')
            .update(updateData)
            .eq('id', existingItem.id);

          if (updateError) throw updateError;
          
          // Track newly notified IDs that need billing generation
          if (enviarNotificacoes && !existingItem.notificado_em && !conv.isento && (conv.valor || valorPadrao) && (conv.valor || valorPadrao)! > 0) {
            newlyNotifiedIds.push(existingItem.id);
          }
        }
      }

      // Count new notifications sent
      const newNotifications = enviarNotificacoes 
        ? toInsert.length + toUpdate.filter(c => !existingMap.get(c.crianca_id)?.notificado_em).length
        : 0;

      // Generate PIX: query DB for all convocations that were notified but don't have PIX yet
      // This is more reliable than depending on insertedRecords which can be null due to RLS
      if (enviarNotificacoes) {
        try {
          const { data: pendingPix } = await supabase
            .from('amistoso_convocacoes')
            .select('id')
            .eq('evento_id', eventoId)
            .not('notificado_em', 'is', null)
            .is('asaas_payment_id', null)
            .eq('isento', false)
            .gt('valor', 0);

          if (pendingPix && pendingPix.length > 0) {
            console.log(`Generating PIX for ${pendingPix.length} convocations`);
            pendingPix.forEach(({ id }) => {
              supabase.functions.invoke('generate-amistoso-pix', {
                body: { convocacao_id: id },
              }).catch(err => {
                console.error('Error generating PIX for convocacao:', id, err);
              });
            });
          }
        } catch (pixQueryErr) {
          console.error('Error querying pending PIX convocations:', pixQueryErr);
        }
      }

      return { success: true, newNotifications };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['amistoso-convocacoes', variables.eventoId] });
      queryClient.invalidateQueries({ queryKey: ['amistoso-convocacoes-count', variables.eventoId] });
      queryClient.invalidateQueries({ queryKey: ['guardian-amistoso-convocacoes'] });
      queryClient.invalidateQueries({ queryKey: ['eventos-convocacoes-counts'] });
      // Sync convocations to Carreira ID (fire-and-forget)
      syncAmistosoConvocacoesToCarreira(variables.eventoId, variables.convocacoes);
    },
  });
}

// Hook to fetch convocacao counts for multiple events
export function useEventosConvocacoesCounts(eventoIds: string[]) {
  return useQuery({
    queryKey: ['eventos-convocacoes-counts', eventoIds],
    queryFn: async () => {
      if (eventoIds.length === 0) return {};

      const { data, error } = await supabase
        .from('amistoso_convocacoes')
        .select('evento_id')
        .in('evento_id', eventoIds);

      if (error) throw error;

      // Count convocacoes per evento
      const counts: Record<string, number> = {};
      data.forEach(conv => {
        counts[conv.evento_id] = (counts[conv.evento_id] || 0) + 1;
      });
      
      return counts;
    },
    enabled: eventoIds.length > 0,
  });
}

/**
 * After upsert, fetch evento details and sync each convocation to Carreira ID.
 */
async function syncAmistosoConvocacoesToCarreira(
  eventoId: string,
  convocacoes: CreateAmistosoConvocacaoInput[]
) {
  try {
    // Fetch evento details for enriched sync
    const { data: evento } = await supabase
      .from('eventos_esportivos')
      .select('id, nome, data, tipo, adversario, local, placar_time1, placar_time2, status')
      .eq('id', eventoId)
      .single();

    if (!evento) return;

    // Fetch current convocations from DB to get IDs
    const { data: currentConvs } = await supabase
      .from('amistoso_convocacoes')
      .select('id, crianca_id, status, presente')
      .eq('evento_id', eventoId);

    if (!currentConvs?.length) return;

    for (const conv of currentConvs) {
      syncToCarreira({
        type: 'amistoso_convocacao',
        action: 'create',
        criancaId: conv.crianca_id,
        data: {
          id: conv.id,
          evento_nome: evento.nome,
          evento_data: evento.data,
          evento_tipo: evento.tipo,
          evento_adversario: evento.adversario,
          evento_local: evento.local,
          evento_placar_time1: evento.placar_time1,
          evento_placar_time2: evento.placar_time2,
          evento_status: evento.status,
          status: conv.status,
          presente: conv.presente,
        },
      });
    }
  } catch (err) {
    console.warn('[syncAmistosoConvocacoes] Failed:', err);
  }
}
