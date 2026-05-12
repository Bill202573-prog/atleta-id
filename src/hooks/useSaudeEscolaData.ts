import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface LoginAttemptRow {
  id: string;
  email: string;
  user_id: string | null;
  user_role: string | null;
  success: boolean;
  failure_reason: string | null;
  error_message: string | null;
  ip: string | null;
  attempted_at: string;
}

export interface CobrancaDetalhe {
  id: string;
  crianca_nome: string;
  responsavel_nome: string | null;
  valor: number;
  status: string;
  data_vencimento: string | null;
  data_pagamento: string | null;
  asaas_payment_id: string | null;
  push_enviado: boolean;
}

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
    responsaveis_sem_sub: { id: string; nome: string; user_id: string | null; motivo: string }[];
    professores_sem_sub: { id: string; nome: string; user_id: string | null; motivo: string }[];
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
    detalhes: CobrancaDetalhe[];
  };
  login_attempts: LoginAttemptRow[];
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

      // Razão provável de não ter push: nunca acessou > permissão (não temos como saber sem signal do client) > sem app
      const inferMotivo = (userId: string | null) => {
        if (!userId) return 'sem_conta';
        if (!userIdsComAcesso.has(userId)) return 'nunca_acessou';
        return 'permissao_pendente';
      };

      const responsaveis_sem_sub = (responsaveis || [])
        .filter((r: any) => r.user_id && !subsByUser.has(r.user_id))
        .map((r: any) => ({ id: r.id, nome: r.nome, user_id: r.user_id, motivo: inferMotivo(r.user_id) }));
      const professores_sem_sub = (professores || [])
        .filter((p: any) => p.user_id && !subsByUser.has(p.user_id))
        .map((p: any) => ({ id: p.id, nome: p.nome, user_id: p.user_id, motivo: inferMotivo(p.user_id) }));

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
        .select('id, status, asaas_payment_id, valor, data_vencimento, data_pagamento, crianca_id, criancas(nome)')
        .eq('escolinha_id', escolinhaId)
        .eq('mes_referencia', ym);

      const geradas = mens?.length || 0;
      const pagas = (mens || []).filter((m: any) => m.status === 'pago').length;
      const vencidas = (mens || []).filter((m: any) => m.status === 'vencido').length;
      const sem_payment_id = (mens || [])
        .filter((m: any) => !m.asaas_payment_id && m.status === 'pendente')
        .map((m: any) => ({ crianca_nome: m.criancas?.nome || '?', valor: m.valor }));

      // Cruzar responsável por criança
      const criancaIds = Array.from(new Set((mens || []).map((m: any) => m.crianca_id).filter(Boolean)));
      const { data: respLinksMap } = criancaIds.length
        ? await supabase
            .from('crianca_responsavel')
            .select('crianca_id, responsaveis(nome)')
            .in('crianca_id', criancaIds)
        : { data: [] as any[] };
      const respPorCrianca = new Map<string, string>();
      (respLinksMap || []).forEach((l: any) => {
        if (!respPorCrianca.has(l.crianca_id) && l.responsaveis?.nome) {
          respPorCrianca.set(l.crianca_id, l.responsaveis.nome);
        }
      });

      // Push de cobrança enviado por criança (mês corrente)
      const monthStart = new Date(`${ym}-01T00:00:00Z`).toISOString();
      const { data: pushCobrancas } = await supabase
        .from('push_notifications_log')
        .select('crianca_id, tipo')
        .eq('escolinha_id', escolinhaId)
        .gte('enviado_em', monthStart)
        .ilike('tipo', '%cobranca%');
      const pushPorCrianca = new Set<string>((pushCobrancas || []).map((p: any) => p.crianca_id).filter(Boolean));

      const detalhes: CobrancaDetalhe[] = (mens || []).map((m: any) => ({
        id: m.id,
        crianca_nome: m.criancas?.nome || '?',
        responsavel_nome: respPorCrianca.get(m.crianca_id) || null,
        valor: m.valor,
        status: m.status,
        data_vencimento: m.data_vencimento,
        data_pagamento: m.data_pagamento,
        asaas_payment_id: m.asaas_payment_id,
        push_enviado: pushPorCrianca.has(m.crianca_id),
      }));

      const { data: asaasStatus } = await supabase.rpc('get_escola_asaas_status', { p_escolinha_id: escolinhaId });

      const { data: errosRecentes } = await supabase
        .from('escola_asaas_admin_notifications')
        .select('tipo, mensagem, created_at')
        .eq('escolinha_id', escolinhaId)
        .order('created_at', { ascending: false })
        .limit(5);

      // ---- Login attempts (últimos 30d) ----
      const { data: loginAttempts } = await supabase
        .from('login_attempts')
        .select('id, email, user_id, user_role, success, failure_reason, error_message, ip, attempted_at')
        .eq('escolinha_id', escolinhaId)
        .gte('attempted_at', since)
        .order('attempted_at', { ascending: false })
        .limit(200);

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
          detalhes,
        },
        login_attempts: (loginAttempts || []) as any,
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
