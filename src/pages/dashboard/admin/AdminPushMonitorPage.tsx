import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Bell, Users, Shield, GraduationCap, Send, MessageCircle, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAdminEscolasList, usePushMonitor } from '@/hooks/usePushMonitor';

const TIPO_LABEL: Record<string, string> = {
  comunicado: 'Comunicados',
  cobranca: 'Cobranças',
  aniversario: 'Aniversário (pais)',
  aniversario_admin: 'Aniversário (admin)',
  admin_pendencias: 'Pendências (admin)',
  resumo_mensal: 'Resumo Mensal',
  convocacao: 'Convocações',
  evento: 'Eventos',
};

function fmtDate(d?: string) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return d;
  }
}

function waLink(phone: string | null, nome: string) {
  if (!phone) return null;
  const clean = phone.replace(/\D/g, '');
  if (clean.length < 10) return null;
  const msg = encodeURIComponent(
    `Oi, ${nome.split(' ')[0]}! Notamos que você ainda não está recebendo as notificações do ATLETA ID. Para ativar: abra o app no celular, vá em qualquer aviso e aceite quando o navegador pedir permissão de notificações. 📲⚽`
  );
  return `https://wa.me/55${clean}?text=${msg}`;
}

export default function AdminPushMonitorPage() {
  const { data: escolas, isLoading: loadingEscolas } = useAdminEscolasList();
  const [escolaId, setEscolaId] = useState<string | null>(null);

  const currentId = escolaId || escolas?.[0]?.id || null;
  const { data, isLoading } = usePushMonitor(currentId);

  const cobertura = data?.cobertura;
  const paisPct = useMemo(() => {
    if (!cobertura?.pais_total) return 0;
    return Math.round((cobertura.pais_com_push / cobertura.pais_total) * 100);
  }, [cobertura]);
  const profsPct = useMemo(() => {
    if (!cobertura?.professores_total) return 0;
    return Math.round((cobertura.professores_com_push / cobertura.professores_total) * 100);
  }, [cobertura]);

  return (
    <div className="container max-w-5xl mx-auto p-3 sm:p-4 space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 shrink-0 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
          <Bell className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold">Monitor de Push</h1>
          <p className="text-sm text-muted-foreground break-words">
            Cobertura e histórico de notificações push por escola.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Escola</CardTitle>
          <CardDescription>Escolha a escolinha para inspecionar.</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingEscolas ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            <Select value={currentId || undefined} onValueChange={(v) => setEscolaId(v)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione uma escola" />
              </SelectTrigger>
              <SelectContent>
                {(escolas || []).map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </CardContent>
      </Card>

      {isLoading || !data ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : (
        <>
          {/* Cobertura */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" /> Pais com push
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {cobertura!.pais_com_push}
                  <span className="text-base font-normal text-muted-foreground"> / {cobertura!.pais_total}</span>
                </p>
                <Progress value={paisPct} className="mt-2 h-2" />
                <p className="text-xs text-muted-foreground mt-1">{paisPct}% de cobertura</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <GraduationCap className="h-4 w-4 text-primary" /> Professores
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {cobertura!.professores_com_push}
                  <span className="text-base font-normal text-muted-foreground"> / {cobertura!.professores_total}</span>
                </p>
                <Progress value={profsPct} className="mt-2 h-2" />
                <p className="text-xs text-muted-foreground mt-1">{profsPct}% de cobertura</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Shield className="h-4 w-4 text-primary" /> Admin da escola
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{cobertura!.admins_devices}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  device(s) registrado(s) — {cobertura!.admins_total} admin(s)
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Send className="h-4 w-4 text-primary" /> Envios (30d)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{cobertura!.envios_30d}</p>
                <p className="text-xs text-muted-foreground mt-1">push enviados nos últimos 30 dias</p>
              </CardContent>
            </Card>
          </div>

          {/* Envios por tipo */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Envios por tipo (últimos 30 dias)</CardTitle>
            </CardHeader>
            <CardContent>
              {data.envios_por_tipo.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum envio nos últimos 30 dias.</p>
              ) : (
                <div className="overflow-x-auto -mx-3 sm:mx-0">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-xs text-muted-foreground">
                        <th className="text-left p-2 font-medium">Tipo</th>
                        <th className="text-right p-2 font-medium">Enviados</th>
                        <th className="text-right p-2 font-medium">Entregues</th>
                        <th className="text-right p-2 font-medium">Último</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.envios_por_tipo.map((t) => (
                        <tr key={t.tipo} className="border-b last:border-0">
                          <td className="p-2">{TIPO_LABEL[t.tipo] || t.tipo}</td>
                          <td className="p-2 text-right font-medium">{t.total}</td>
                          <td className="p-2 text-right">{t.entregues}</td>
                          <td className="p-2 text-right text-muted-foreground whitespace-nowrap">{fmtDate(t.ultimo)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pais sem push */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-500" />
                Pais sem push ativo ({data.pais_sem_push.length})
              </CardTitle>
              <CardDescription>
                Esses responsáveis não autorizaram notificação no navegador. Envie um WhatsApp pedindo para ativar.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.pais_sem_push.length === 0 ? (
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  Todos os pais ativos estão recebendo push.
                </p>
              ) : (
                data.pais_sem_push.map((p) => {
                  const wa = waLink(p.telefone, p.nome);
                  return (
                    <div key={p.responsavel_id} className="flex items-start justify-between gap-3 p-3 rounded-lg border bg-card">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm break-words">{p.nome}</p>
                        <p className="text-xs text-muted-foreground break-words mt-0.5">
                          {p.filhos.join(', ') || '—'}
                        </p>
                        {p.telefone && (
                          <p className="text-xs text-muted-foreground mt-0.5">{p.telefone}</p>
                        )}
                      </div>
                      {wa ? (
                        <Button asChild size="sm" variant="outline" className="shrink-0">
                          <a href={wa} target="_blank" rel="noopener noreferrer">
                            <MessageCircle className="h-4 w-4 mr-1" /> WhatsApp
                          </a>
                        </Button>
                      ) : (
                        <Badge variant="secondary" className="shrink-0">sem telefone</Badge>
                      )}
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          {/* Histórico */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Histórico recente</CardTitle>
              <CardDescription>Últimos 50 envios desta escola.</CardDescription>
            </CardHeader>
            <CardContent>
              {data.historico.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum push registrado.</p>
              ) : (
                <div className="space-y-2">
                  {data.historico.map((h) => (
                    <div key={h.id} className="p-3 rounded-lg border bg-card text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium break-words">{h.titulo}</p>
                          <p className="text-xs text-muted-foreground break-words mt-0.5">{h.mensagem}</p>
                        </div>
                        <Badge variant={h.entregue ? 'default' : 'secondary'} className="shrink-0">
                          {TIPO_LABEL[h.tipo] || h.tipo}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-2 text-xs text-muted-foreground">
                        <span className="truncate">→ {h.destinatario}</span>
                        <span className="shrink-0 whitespace-nowrap">{fmtDate(h.enviado_em)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
