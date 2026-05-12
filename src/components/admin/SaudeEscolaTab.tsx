import { useMemo, useState } from 'react';
import { useSaudeEscolaData, useEscolinhasList, type LoginAttemptRow, type CobrancaDetalhe } from '@/hooks/useSaudeEscolaData';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { CheckCircle2, XCircle, AlertTriangle, Bell, DollarSign, LogIn, Send, RefreshCw, ChevronDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const fmtDate = (s?: string | null) => s ? new Date(s).toLocaleString('pt-BR') : '—';
const fmtDay = (s?: string | null) => s ? new Date(s).toLocaleDateString('pt-BR') : '—';

const FAILURE_LABELS: Record<string, string> = {
  senha_incorreta: 'Senha incorreta',
  email_nao_confirmado: 'Email não confirmado',
  usuario_inexistente: 'Usuário não existe',
  rate_limited: 'Muitas tentativas',
  usuario_bloqueado: 'Usuário bloqueado',
  erro_rede: 'Erro de rede',
  sem_role: 'Sem perfil de acesso',
  outro: 'Outro',
  desconhecido: 'Desconhecido',
};

const MOTIVO_PUSH_LABELS: Record<string, { label: string; cor: string }> = {
  nunca_acessou: { label: 'Nunca abriu o app', cor: 'bg-amber-500/10 text-amber-700 border-amber-500/30' },
  permissao_pendente: { label: 'Não autorizou notificações', cor: 'bg-blue-500/10 text-blue-700 border-blue-500/30' },
  sem_conta: { label: 'Sem conta de usuário', cor: 'bg-muted text-muted-foreground' },
};

const STATUS_COBRANCA: Record<string, { label: string; classes: string }> = {
  pago: { label: 'Pago', classes: 'bg-green-500/10 text-green-700 border-green-500/30' },
  pendente: { label: 'Pendente', classes: 'bg-blue-500/10 text-blue-700 border-blue-500/30' },
  vencido: { label: 'Vencido', classes: 'bg-amber-500/10 text-amber-700 border-amber-500/30' },
  cancelado: { label: 'Cancelado', classes: 'bg-muted text-muted-foreground' },
};

const ymNow = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const monthOptions = (() => {
  const opts: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 18; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    opts.push({ value, label });
  }
  return opts;
})();

export function SaudeEscolaTab() {
  const { data: escolinhas } = useEscolinhasList();
  const [escolinhaId, setEscolinhaId] = useState<string | null>(null);
  const [sendingTest, setSendingTest] = useState<string | null>(null);
  const [loginFilter, setLoginFilter] = useState<'all' | 'success' | 'fail'>('all');
  const [mesCobranca, setMesCobranca] = useState<string>(ymNow());

  const { data, isLoading, refetch } = useSaudeEscolaData(escolinhaId, mesCobranca);

  const sendTestPush = async (userId: string, label: string) => {
    setSendingTest(userId);
    try {
      const res = await supabase.functions.invoke('send-push-notification', {
        body: {
          user_ids: [userId],
          title: '🔔 Teste de notificação',
          body: `Push de teste enviado para ${label} pelo painel admin.`,
        },
      });
      if (res.error) throw new Error(res.error.message);
      toast.success(`Push de teste enviado para ${label}`);
    } catch (e: any) {
      toast.error('Erro ao enviar push: ' + e.message);
    } finally {
      setSendingTest(null);
    }
  };

  const filteredAttempts = useMemo(() => {
    if (!data?.login_attempts) return [];
    if (loginFilter === 'success') return data.login_attempts.filter(a => a.success);
    if (loginFilter === 'fail') return data.login_attempts.filter(a => !a.success);
    return data.login_attempts;
  }, [data?.login_attempts, loginFilter]);

  const cobrancasPagas = data?.cobrancas.detalhes.filter(c => c.status === 'pago') || [];
  const cobrancasPendentes = data?.cobrancas.detalhes.filter(c => c.status === 'pendente') || [];
  const cobrancasVencidas = data?.cobrancas.detalhes.filter(c => c.status === 'vencido') || [];

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4 flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <div className="flex-1 w-full">
            <p className="text-sm font-medium mb-1">Selecione a escola</p>
            <Select value={escolinhaId || ''} onValueChange={setEscolinhaId}>
              <SelectTrigger><SelectValue placeholder="Escolha uma escolinha..." /></SelectTrigger>
              <SelectContent>
                {(escolinhas || []).map((e: any) => (
                  <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => refetch()} disabled={!escolinhaId || isLoading} size="sm">
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} /> Atualizar
          </Button>
        </CardContent>
      </Card>

      {!escolinhaId && (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Selecione uma escola para ver o painel de saúde</CardContent></Card>
      )}

      {data && (
        <>
          {/* ACESSOS */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><LogIn className="w-4 h-4" /> Acessos (últimos 30 dias)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-lg border">
                  <p className="text-xs text-muted-foreground">Total de logins</p>
                  <p className="text-2xl font-bold">{data.acessos.total_30d}</p>
                </div>
                <div className="p-3 rounded-lg border">
                  <p className="text-xs text-muted-foreground">Último admin</p>
                  <p className="text-sm font-medium">{fmtDate(data.acessos.ultimo_admin)}</p>
                </div>
                <div className="p-3 rounded-lg border">
                  <p className="text-xs text-muted-foreground">Último sócio</p>
                  <p className="text-sm font-medium">{fmtDate(data.acessos.ultimo_socio)}</p>
                </div>
                <div className="p-3 rounded-lg border">
                  <p className="text-xs text-muted-foreground">Por role</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {Object.entries(data.acessos.por_role).map(([r, c]) => (
                      <Badge key={r} variant="outline" className="text-xs">{r}: {c}</Badge>
                    ))}
                  </div>
                </div>
              </div>
              {data.acessos.nunca_acessaram.length > 0 && (
                <Collapsible>
                  <CollapsibleTrigger className="text-sm font-medium text-amber-600 flex items-center gap-1">
                    <ChevronDown className="w-4 h-4" /> Nunca acessaram ({data.acessos.nunca_acessaram.length})
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="max-h-40 overflow-y-auto space-y-1 mt-2">
                      {data.acessos.nunca_acessaram.map((u) => (
                        <div key={u.id} className="text-xs flex items-center gap-2 pl-2">
                          <Badge variant="secondary" className="text-[10px]">{u.tipo}</Badge>
                          <span>{u.nome}</span>
                        </div>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}
            </CardContent>
          </Card>

          {/* TENTATIVAS DE LOGIN */}
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" /> Tentativas de login (30 dias)
              </CardTitle>
              <div className="flex gap-1">
                {(['all', 'success', 'fail'] as const).map(f => (
                  <Button key={f} size="sm" variant={loginFilter === f ? 'default' : 'outline'} onClick={() => setLoginFilter(f)}>
                    {f === 'all' ? 'Todas' : f === 'success' ? 'Sucesso' : 'Falhas'}
                  </Button>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              {data.login_attempts.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Ainda não há tentativas registradas para esta escola. As tentativas começam a ser gravadas a partir do próximo login (sucesso ou falha).
                </p>
              ) : filteredAttempts.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma tentativa para o filtro selecionado.</p>
              ) : (
                <div className="max-h-80 overflow-y-auto space-y-1 text-xs">
                  {filteredAttempts.map((a: LoginAttemptRow) => (
                    <div key={a.id} className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 p-2 rounded border ${a.success ? 'border-green-500/30 bg-green-500/5' : 'border-destructive/30 bg-destructive/5'}`}>
                      <div className="flex items-center gap-2 min-w-0">
                        {a.success ? <CheckCircle2 className="w-3 h-3 text-green-600 shrink-0" /> : <XCircle className="w-3 h-3 text-destructive shrink-0" />}
                        <span className="font-mono truncate">{a.email}</span>
                        {a.user_role && <Badge variant="outline" className="text-[10px]">{a.user_role}</Badge>}
                        {!a.success && a.failure_reason && (
                          <Badge variant="destructive" className="text-[10px]">{FAILURE_LABELS[a.failure_reason] || a.failure_reason}</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        {a.error_message && !a.success && <span className="truncate max-w-[260px]" title={a.error_message}>{a.error_message}</span>}
                        <span>{fmtDate(a.attempted_at)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-muted-foreground mt-2">
                Mostrando até 200 tentativas mais recentes. Tentativas com email não vinculado a nenhum usuário desta escola não aparecem aqui.
              </p>
            </CardContent>
          </Card>

          {/* PUSH */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><Bell className="w-4 h-4" /> Notificações Push</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                {[
                  ['mensalidade_admin_push', 'Mensalidade'],
                  ['aniversario_admin_push', 'Aniversariantes'],
                  ['comunicado_admin_push', 'Comunicados'],
                  ['presenca_confirmada_admin_push', 'Presença'],
                ].map(([k, label]) => {
                  const on = data.push.config?.[k] !== false;
                  return (
                    <div key={k} className={`p-2 rounded border flex items-center gap-2 ${on ? 'border-green-500/30 bg-green-500/5' : 'border-muted bg-muted/30'}`}>
                      {on ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <XCircle className="w-4 h-4 text-muted-foreground" />}
                      <span>{label}</span>
                    </div>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 rounded-lg border">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Admin principal</p>
                      <p className="text-sm font-medium">{data.push.admin_subs} dispositivo(s)</p>
                    </div>
                    {data.escolinha.admin_user_id && (
                      <Button size="sm" variant="outline" disabled={sendingTest === data.escolinha.admin_user_id || data.push.admin_subs === 0}
                        onClick={() => sendTestPush(data.escolinha.admin_user_id!, 'admin')}>
                        <Send className="w-3 h-3 mr-1" /> Teste
                      </Button>
                    )}
                  </div>
                </div>
                <div className="p-3 rounded-lg border">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Sócio</p>
                      <p className="text-sm font-medium">{data.push.socio_subs} dispositivo(s)</p>
                    </div>
                    {data.escolinha.socio_user_id && (
                      <Button size="sm" variant="outline" disabled={sendingTest === data.escolinha.socio_user_id || data.push.socio_subs === 0}
                        onClick={() => sendTestPush(data.escolinha.socio_user_id!, 'sócio')}>
                        <Send className="w-3 h-3 mr-1" /> Teste
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="font-medium text-amber-600 mb-1">Responsáveis sem push ({data.push.responsaveis_sem_sub.length})</p>
                  <div className="max-h-48 overflow-y-auto space-y-1 pl-2">
                    {data.push.responsaveis_sem_sub.slice(0, 50).map(r => {
                      const m = MOTIVO_PUSH_LABELS[r.motivo] || MOTIVO_PUSH_LABELS.permissao_pendente;
                      return (
                        <div key={r.id} className="flex items-center justify-between gap-2">
                          <span className="truncate">• {r.nome}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${m.cor}`}>{m.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <p className="font-medium text-amber-600 mb-1">Professores sem push ({data.push.professores_sem_sub.length})</p>
                  <div className="max-h-48 overflow-y-auto space-y-1 pl-2">
                    {data.push.professores_sem_sub.slice(0, 50).map(p => {
                      const m = MOTIVO_PUSH_LABELS[p.motivo] || MOTIVO_PUSH_LABELS.permissao_pendente;
                      return (
                        <div key={p.id} className="flex items-center justify-between gap-2">
                          <span className="truncate">• {p.nome}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${m.cor}`}>{m.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-muted/40 text-xs space-y-1">
                <p className="font-medium">Por que tantos responsáveis aparecem "sem push"?</p>
                <p className="text-muted-foreground">
                  Por padrão o app passou a pedir permissão de notificação <strong>automaticamente</strong> a todo responsável e professor no primeiro acesso. Quem não recebe push está em uma destas situações: <strong>nunca abriu o app</strong> (não houve oportunidade de pedir permissão), <strong>negou a permissão no navegador</strong>, ou está no <strong>iPhone sem instalar o PWA</strong> (no iOS o push só funciona com o app instalado na tela inicial).
                </p>
              </div>

              {data.push.ultimos_envios.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">Últimos 10 envios</p>
                  <div className="space-y-1 text-xs">
                    {data.push.ultimos_envios.map((e, i) => (
                      <div key={i} className="flex items-center justify-between p-2 rounded border">
                        <div className="flex items-center gap-2">
                          {e.entregue ? <CheckCircle2 className="w-3 h-3 text-green-500" /> : <XCircle className="w-3 h-3 text-amber-500" />}
                          <Badge variant="outline" className="text-[10px]">{e.tipo}</Badge>
                          <span className="truncate max-w-xs">{e.titulo}</span>
                        </div>
                        <span className="text-muted-foreground">{fmtDate(e.enviado_em)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* COBRANÇAS */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <CardTitle className="text-base flex items-center gap-2"><DollarSign className="w-4 h-4" /> Cobranças ({data.cobrancas.mes_referencia})</CardTitle>
                <div className="w-full sm:w-56">
                  <Select value={mesCobranca} onValueChange={setMesCobranca}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {monthOptions.map(o => (
                        <SelectItem key={o.value} value={o.value} className="text-xs capitalize">{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-lg border"><p className="text-xs text-muted-foreground">Geradas</p><p className="text-2xl font-bold">{data.cobrancas.geradas}</p></div>
                <div className="p-3 rounded-lg border border-green-500/30"><p className="text-xs text-muted-foreground">Pagas</p><p className="text-2xl font-bold text-green-600">{data.cobrancas.pagas}</p></div>
                <div className="p-3 rounded-lg border border-amber-500/30"><p className="text-xs text-muted-foreground">Vencidas</p><p className="text-2xl font-bold text-amber-600">{data.cobrancas.vencidas}</p></div>
                <div className="p-3 rounded-lg border border-destructive/30"><p className="text-xs text-muted-foreground">Falha Asaas</p><p className="text-2xl font-bold text-destructive">{data.cobrancas.sem_payment_id.length}</p></div>
              </div>

              {data.cobrancas.asaas_status && (
                <div className="p-3 rounded-lg border bg-muted/30 text-xs">
                  <p className="font-medium mb-1">Subconta Asaas</p>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={data.cobrancas.asaas_status.subconta_criada ? 'default' : 'destructive'}>
                      {data.cobrancas.asaas_status.subconta_criada ? 'Criada' : 'Não criada'}
                    </Badge>
                    <Badge variant="outline">Status: {data.cobrancas.asaas_status.asaas_status || 'n/a'}</Badge>
                    {data.cobrancas.asaas_status.atualizado_em && (
                      <Badge variant="outline">Atualizado: {fmtDate(data.cobrancas.asaas_status.atualizado_em)}</Badge>
                    )}
                  </div>
                </div>
              )}

              {[
                { label: 'Pagas', items: cobrancasPagas, defaultOpen: false },
                { label: 'Pendentes (em dia)', items: cobrancasPendentes, defaultOpen: false },
                { label: 'Vencidas', items: cobrancasVencidas, defaultOpen: true },
              ].map(group => (
                group.items.length > 0 && (
                  <Collapsible key={group.label} defaultOpen={group.defaultOpen}>
                    <CollapsibleTrigger className="text-sm font-medium flex items-center gap-1">
                      <ChevronDown className="w-4 h-4" /> {group.label} ({group.items.length})
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="max-h-60 overflow-y-auto space-y-1 mt-2 text-xs">
                        {group.items.map((c: CobrancaDetalhe) => {
                          const st = STATUS_COBRANCA[c.status] || { label: c.status, classes: '' };
                          return (
                            <div key={c.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 p-2 rounded border">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className={`text-[10px] px-1.5 py-0.5 rounded border ${st.classes}`}>{st.label}</span>
                                <span className="truncate"><strong>{c.crianca_nome}</strong> {c.responsavel_nome ? `— ${c.responsavel_nome}` : ''}</span>
                              </div>
                              <div className="flex items-center gap-2 text-muted-foreground">
                                <span>R$ {Number(c.valor).toFixed(2)}</span>
                                {c.status === 'pago'
                                  ? <span>pago em {fmtDay(c.data_pagamento)}</span>
                                  : <span>vence {fmtDay(c.data_vencimento)}</span>}
                                {c.push_enviado
                                  ? <Badge variant="outline" className="text-[10px] text-green-700 border-green-500/30">push enviado</Badge>
                                  : <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-500/30">sem push</Badge>}
                                {!c.asaas_payment_id && <Badge variant="destructive" className="text-[10px]">sem ID Asaas</Badge>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )
              ))}

              {data.cobrancas.erros_recentes.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-1">Últimos erros Asaas</p>
                  <div className="space-y-1 text-xs">
                    {data.cobrancas.erros_recentes.map((e, i) => (
                      <div key={i} className="p-2 rounded border border-destructive/30 bg-destructive/5">
                        <Badge variant="destructive" className="text-[10px] mr-2">{e.tipo}</Badge>
                        {e.mensagem}
                        <span className="text-muted-foreground ml-2">— {fmtDate(e.created_at)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
