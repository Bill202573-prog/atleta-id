import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SaudeEscolaData {
  escolinha: { id: string; nome: string; admin_user_id: string | null; socio_user_id: string | null };
  acessos: {
    total_30d: number;
    por_role: Record<string, number>;
    nunca_acessaram: { id: string; nome: string; tipo: 'responsavel' | 'professor' }[];
    ultimo_admin: string | null;
    ultimo_socio: string | null;
  };
  push: {
    config: any;
    admin_subs: number;
    socio_subs: number;
    responsaveis_sem_sub: { id: string; nome: string }[];
    professores_sem_sub: { id: string; nome: string }[];
    ultimos_envios: { titulo: string; tipo: string; entregue: boolean | null; enviado_em: string }[];
  };
  cobrancas: {
    mes_referencia: string;
    geradas: number;
    pagas: number;
    vencidas: number;
    sem_payment_id: { crianca_nome: string; valor: number }[];
    asaas_status: any;
    erros_recentes: { tipo: string; mensagem: string; created_at: string }[];
  };
}

const ymNow = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export function useSaudeEscolaData(escolinhaId: string | null) {
  return useQuery({
    queryKey: ['saude-escola', escolinhaId],
    enabled: !!escolinhaId,
    queryFn: async (): Promise<SaudeEscolaData | null> => {
      if (!escolinhaId) return null;

      const { data: esc } = await supabase
        .from('escolinhas')
        .select('id, nome, admin_user_id, socio_user_id')
        .eq('id', escolinhaId)
        .maybeSingle();

      if (!esc) return null;

      // ---- Responsáveis & Professores ----
      const { data: respLinks } = await supabase
        .from('crianca_responsavel')
        .select('responsavel_id, criancas!inner(crianca_escolinha!inner(escolinha_id, ativo))')
        .eq('criancas.crianca_escolinha.escolinha_id', escolinhaId);
      const respIds = Array.from(new Set((respLinks || []).map((r: any) => r.responsavel_id)));

      const { data: responsaveis } = respIds.length
        ? await supabase.from('responsaveis').select('id, nome, user_id').in('id', respIds)
        : { data: [] as any[] };

      const { data: professores } = await supabase
        .from('professores')
        .select('id, nome, user_id, ativo')
        .eq('escolinha_id', escolinhaId)
        .eq('ativo', true);

      const userIdsResp = (responsaveis || []).map((r: any) => r.user_id).filter(Boolean) as string[];
      const userIdsProf = (professores || []).map((p: any) => p.user_id).filter(Boolean) as string[];
      const allEscolaUserIds = [esc.admin_user_id, esc.socio_user_id, ...userIdsResp, ...userIdsProf].filter(Boolean) as string[];

      // ---- Acessos 30d ----
      const since = new Date(Date.now() - 30 * 86400_000).toISOString();
      const { data: acessos } = await supabase
        .from('acessos_log')
        .select('user_id, user_role, accessed_at')
        .gte('accessed_at', since)
        .in('user_id', allEscolaUserIds.length ? allEscolaUserIds : ['00000000-0000-0000-0000-000000000000']);

      const por_role: Record<string, number> = {};
      const ultimoPorUser = new Map<string, string>();
      (acessos || []).forEach((a: any) => {
        por_role[a.user_role] = (por_role[a.user_role] || 0) + 1;
        const prev = ultimoPorUser.get(a.user_id);
        if (!prev || prev < a.accessed_at) ultimoPorUser.set(a.user_id, a.accessed_at);
      });

      const userIdsComAcesso = new Set((acessos || []).map((a: any) => a.user_id));
      const nunca_acessaram: { id: string; nome: string; tipo: 'responsavel' | 'professor' }[] = [];
      (responsaveis || []).forEach((r: any) => {
        if (r.user_id && !userIdsComAcesso.has(r.user_id)) nunca_acessaram.push({ id: r.id, nome: r.nome, tipo: 'responsavel' });
      });
      (professores || []).forEach((p: any) => {
        if (p.user_id && !userIdsComAcesso.has(p.user_id)) nunca_acessaram.push({ id: p.id, nome: p.nome, tipo: 'professor' });
      });

      // ---- Push subscriptions ----
      const { data: subs } = await supabase
        .from('push_subscriptions')
        .select('user_id')
        .in('user_id', allEscolaUserIds.length ? allEscolaUserIds : ['00000000-0000-0000-0000-000000000000']);
      const subsByUser = new Map<string, number>();
      (subs || []).forEach((s: any) => subsByUser.set(s.user_id, (subsByUser.get(s.user_id) || 0) + 1));

      const responsaveis_sem_sub = (responsaveis || [])
        .filter((r: any) => r.user_id && !subsByUser.has(r.user_id))
        .map((r: any) => ({ id: r.id, nome: r.nome }));
      const professores_sem_sub = (professores || [])
        .filter((p: any) => p.user_id && !subsByUser.has(p.user_id))
        .map((p: any) => ({ id: p.id, nome: p.nome }));

      const { data: pushConfig } = await supabase
        .from('escola_push_config')
        .select('*')
        .eq('escolinha_id', escolinhaId)
        .maybeSingle();

      const { data: ultimosEnvios } = await supabase
        .from('push_notifications_log')
        .select('titulo, tipo, entregue, enviado_em')
        .eq('escolinha_id', escolinhaId)
        .order('enviado_em', { ascending: false })
        .limit(10);

      // ---- Cobranças ----
      const ym = ymNow();
      const { data: mens } = await supabase
        .from('mensalidades')
        .select('id, status, asaas_payment_id, valor, criancas(nome)')
        .eq('escolinha_id', escolinhaId)
        .eq('mes_referencia', ym);

      const geradas = mens?.length || 0;
      const pagas = (mens || []).filter((m: any) => m.status === 'pago').length;
      const vencidas = (mens || []).filter((m: any) => m.status === 'vencido').length;
      const sem_payment_id = (mens || [])
        .filter((m: any) => !m.asaas_payment_id && m.status === 'pendente')
        .map((m: any) => ({ crianca_nome: m.criancas?.nome || '?', valor: m.valor }));

      const { data: asaasStatus } = await supabase.rpc('get_escola_asaas_status', { p_escolinha_id: escolinhaId });

      const { data: errosRecentes } = await supabase
        .from('escola_asaas_admin_notifications')
        .select('tipo, mensagem, created_at')
        .eq('escolinha_id', escolinhaId)
        .order('created_at', { ascending: false })
        .limit(5);

      return {
        escolinha: esc as any,
        acessos: {
          total_30d: acessos?.length || 0,
          por_role,
          nunca_acessaram,
          ultimo_admin: esc.admin_user_id ? ultimoPorUser.get(esc.admin_user_id) || null : null,
          ultimo_socio: esc.socio_user_id ? ultimoPorUser.get(esc.socio_user_id) || null : null,
        },
        push: {
          config: pushConfig || {},
          admin_subs: esc.admin_user_id ? subsByUser.get(esc.admin_user_id) || 0 : 0,
          socio_subs: esc.socio_user_id ? subsByUser.get(esc.socio_user_id) || 0 : 0,
          responsaveis_sem_sub,
          professores_sem_sub,
          ultimos_envios: (ultimosEnvios || []) as any,
        },
        cobrancas: {
          mes_referencia: ym,
          geradas,
          pagas,
          vencidas,
          sem_payment_id,
          asaas_status: asaasStatus?.[0] || null,
          erros_recentes: (errosRecentes || []) as any,
        },
      };
    },
  });
}

export function useEscolinhasList() {
  return useQuery({
    queryKey: ['escolinhas-list-saude'],
    queryFn: async () => {
      const { data } = await supabase.from('escolinhas').select('id, nome').order('nome');
      return data || [];
    },
  });
}
