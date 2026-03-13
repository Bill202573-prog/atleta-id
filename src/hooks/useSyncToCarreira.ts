import { supabase } from '@/integrations/supabase/client';

type SyncType =
  | 'atividade_externa'
  | 'evento_gol'
  | 'evento_premiacao'
  | 'conquista_coletiva'
  | 'evento_esportivo'
  | 'amistoso_convocacao'
  | 'campeonato_convocacao'
  | 'experiencia_escolinha';

type SyncAction = 'create' | 'update' | 'delete';

interface SyncParams {
  type: SyncType;
  action: SyncAction;
  criancaId: string;
  data: Record<string, unknown>;
}

/**
 * Fire-and-forget sync to Carreira ID.
 * Never throws — logs warnings on failure so the main UX is not affected.
 */
export async function syncToCarreira({ type, action, criancaId, data }: SyncParams): Promise<void> {
  try {
    const { error } = await supabase.functions.invoke('send-to-carreira', {
      body: {
        type,
        action,
        crianca_id: criancaId,
        data,
      },
    });

    if (error) {
      console.warn('[syncToCarreira] Warning:', error.message);
    }
  } catch (err) {
    console.warn('[syncToCarreira] Failed (non-blocking):', err);
  }
}
