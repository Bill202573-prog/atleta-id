import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface PushMonitorData {
  escolinha: { id: string; nome: string };
  cobertura: {
    pais_total: number;
    pais_com_push: number;
    professores_total: number;
    professores_com_push: number;
    admins_total: number;
    admins_devices: number;
    envios_30d: number;
  };
  envios_por_tipo: Array<{ tipo: string; total: number; entregues: number; ultimo: string }>;
  pais_sem_push: Array<{ responsavel_id: string; nome: string; telefone: string | null; filhos: string[] }>;
  historico: Array<{
    id: string;
    enviado_em: string;
    tipo: string;
    titulo: string;
    mensagem: string;
    entregue: boolean;
    user_id: string;
    destinatario: string;
  }>;
}

export function useAdminEscolasList() {
  return useQuery({
    queryKey: ['admin-escolas-list'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_escolas_para_admin');
      if (error) throw error;
      return (data || []) as Array<{ id: string; nome: string }>;
    },
  });
}

export function usePushMonitor(escolinhaId: string | null) {
  return useQuery({
    queryKey: ['push-monitor', escolinhaId],
    enabled: !!escolinhaId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_push_monitor_escola', {
        p_escolinha_id: escolinhaId,
      });
      if (error) throw error;
      return data as unknown as PushMonitorData;
    },
  });
}
