import { useState } from 'react';
import { useSaudeEscolaData, useEscolinhasList } from '@/hooks/useSaudeEscolaData';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle2, XCircle, AlertTriangle, Bell, DollarSign, Users, LogIn, Send, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const fmtDate = (s?: string | null) => s ? new Date(s).toLocaleString('pt-BR') : '—';

export function SaudeEscolaTab() {
  const { data: escolinhas } = useEscolinhasList();
  const [escolinhaId, setEscolinhaId] = useState<string | null>(null);
  const [authFailures, setAuthFailures] = useState<any[] | null>(null);
  const [loadingFailures, setLoadingFailures] = useState(false);
  const [sendingTest, setSendingTest] = useState<string | null>(null);

  const { data, isLoading, refetch } = useSaudeEscolaData(escolinhaId);

  const loadAuthFailures = async () => {
    setLoadingFailures(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke('admin-auth-failures', {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      if (res.error) throw new Error(res.error.message);
      setAuthFailures(res.data?.failures || []);
      if (res.data?.note) toast.info(res.data.note);
    } catch (e: any) {
      toast.error('Falha ao carregar tentativas: ' + e.message);
      setAuthFailures([]);
    } finally {
      setLoadingFailures(false);
    }
  };

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
                <div>
                  <p className="text-sm font-medium text-amber-600 mb-2">
                    Nunca acessaram ({data.acessos.nunca_acessaram.length})
                  </p>
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {data.acessos.nunca_acessaram.map((u) => (
                      <div key={u.id} className="text-xs flex items-center gap-2 pl-2">
                        <Badge variant="secondary" className="text-[10px]">{u.tipo}</Badge>
                        <span>{u.nome}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* TENTATIVAS COM FALHA */}
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-500" /> Tentativas de login com falha</CardTitle>
              <Button onClick={loadAuthFailures} disabled={loadingFailures} size="sm" variant="outline">
                <RefreshCw className={`w-4 h-4 mr-2 ${loadingFailures ? 'animate-spin' : ''}`} /> Carregar
              </Button>
            </CardHeader>
            <CardContent>
              {authFailures === null ? (
                <p className="text-sm text-muted-foreground">Clique em "Carregar" para buscar as tentativas recentes do projeto.</p>
              ) : authFailures.length === 0 ? (
                <p className="text-sm text-green-600">Nenhuma tentativa com falha registrada.</p>
              ) : (
                <div className="max-h-60 overflow-y-auto space-y-1 text-xs">
                  {authFailures.slice(0, 50).map((f: any, i: number) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded border">
                      <div className="flex items-center gap-2">
                        <Badge variant="destructive" className="text-[10px]">{f.status}</Badge>
                        <span className="font-mono">{f.path}</span>
                      </div>
                      <span className="text-muted-foreground truncate max-w-xs">{f.msg || f.error}</span>
                    </div>
                  ))}
                </div>
              )}
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
                  <div className="max-h-32 overflow-y-auto space-y-1 pl-2">
                    {data.push.responsaveis_sem_sub.slice(0, 30).map(r => <div key={r.id}>• {r.nome}</div>)}
                  </div>
                </div>
                <div>
                  <p className="font-medium text-amber-600 mb-1">Professores sem push ({data.push.professores_sem_sub.length})</p>
                  <div className="max-h-32 overflow-y-auto space-y-1 pl-2">
                    {data.push.professores_sem_sub.slice(0, 30).map(p => <div key={p.id}>• {p.nome}</div>)}
                  </div>
                </div>
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
              <CardTitle className="text-base flex items-center gap-2"><DollarSign className="w-4 h-4" /> Cobranças ({data.cobrancas.mes_referencia})</CardTitle>
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

              {data.cobrancas.sem_payment_id.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-destructive mb-1">Mensalidades pendentes sem ID Asaas ({data.cobrancas.sem_payment_id.length})</p>
                  <div className="max-h-40 overflow-y-auto space-y-1 text-xs pl-2">
                    {data.cobrancas.sem_payment_id.map((m, i) => (
                      <div key={i}>• {m.crianca_nome} — R$ {Number(m.valor).toFixed(2)}</div>
                    ))}
                  </div>
                </div>
              )}

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
