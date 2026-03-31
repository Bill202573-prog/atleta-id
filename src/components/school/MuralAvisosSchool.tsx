import { useState } from 'react';
import { LinkifyText } from '@/components/shared/LinkifyText';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useSchoolComunicados, useConfirmLeitura, ComunicadoComLeitura } from '@/hooks/useComunicadosData';
import { useSchoolPendencias, Pendencia } from '@/hooks/useSchoolPendenciasData';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Bell, AlertTriangle, Info, Megaphone, Loader2, CheckCircle2, Swords, ClipboardList, X, ExternalLink } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { parseLocalDate } from '@/lib/utils';

const tipoConfig = {
  informativo: {
    icon: Info,
    color: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
    label: 'Informativo',
  },
  importante: {
    icon: Megaphone,
    color: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
    label: 'Importante',
  },
  urgente: {
    icon: AlertTriangle,
    color: 'bg-destructive/10 text-destructive border-destructive/20',
    label: 'Urgente',
  },
};

interface MuralAvisosSchoolProps {
  escolinhaId: string;
}

const DISMISSED_KEY = 'dismissed-pendencias';

function getDismissed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]');
  } catch { return []; }
}

function dismissPendencia(id: string) {
  const list = getDismissed();
  if (!list.includes(id)) {
    list.push(id);
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(list));
  }
}

const MuralAvisosSchool = ({ escolinhaId }: MuralAvisosSchoolProps) => {
  const { data: comunicados = [], isLoading } = useSchoolComunicados(escolinhaId);
  const { data: pendencias = [] } = useSchoolPendencias(escolinhaId);
  const confirmLeitura = useConfirmLeitura();
  const [dismissed, setDismissed] = useState<string[]>(getDismissed);

  const handleConfirmRead = async (comunicado: ComunicadoComLeitura) => {
    try {
      await confirmLeitura.mutateAsync({
        comunicadoId: comunicado.id,
        escolinhaId: escolinhaId,
      });
      toast.success('Leitura confirmada!');
    } catch (error) {
      toast.error('Erro ao confirmar leitura');
    }
  };

  const handleDismiss = (id: string) => {
    dismissPendencia(id);
    setDismissed(prev => [...prev, id]);
  };

  const unreadCount = comunicados.filter(c => !c.lido).length;
  const visiblePendencias = pendencias.filter(p => !dismissed.includes(p.id));
  const totalAlerts = unreadCount + visiblePendencias.length;

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="w-4 h-4" />
            Comunicados e Pendências
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (comunicados.length === 0 && visiblePendencias.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="w-4 h-4" />
            Comunicados e Pendências
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6 text-muted-foreground">
            <CheckCircle2 className="w-8 h-8 mx-auto mb-2 opacity-50 text-emerald-500" />
            <p className="text-sm">Tudo em dia! Nenhuma pendência ou comunicado.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={totalAlerts > 0 ? 'border-primary/50' : ''}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Bell className="w-4 h-4" />
          Comunicados e Pendências
          {totalAlerts > 0 && (
            <Badge variant="destructive" className="ml-2">
              {totalAlerts}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="max-h-[500px]">
          <div className="space-y-2 p-4 pt-0">
            {/* Pendências do sistema */}
            {visiblePendencias.map((pendencia) => (
              <PendenciaCard key={pendencia.id} pendencia={pendencia} onDismiss={pendencia.tipo === 'chamada_pendente' ? handleDismiss : undefined} />
            ))}

            {/* Comunicados do admin */}
            {comunicados.map((comunicado) => {
              const config = tipoConfig[comunicado.tipo];
              const Icon = config.icon;

              return (
                <div
                  key={comunicado.id}
                  className={`p-3 rounded-lg border transition-all ${
                    comunicado.lido
                      ? 'bg-secondary/20 border-border opacity-70'
                      : comunicado.tipo === 'urgente'
                      ? 'bg-destructive/5 border-destructive/30'
                      : comunicado.tipo === 'importante'
                      ? 'bg-amber-500/5 border-amber-500/30'
                      : 'bg-primary/5 border-primary/30'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-1.5 rounded-md ${config.color}`}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h4 className="font-semibold text-sm text-foreground">
                          {comunicado.titulo}
                        </h4>
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${config.color}`}>
                          {config.label}
                        </Badge>
                        {comunicado.lido && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                            <CheckCircle2 className="w-2.5 h-2.5 mr-1" />
                            Lido
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                        {comunicado.mensagem}
                      </p>
                      <div className="flex items-center justify-between mt-3">
                        <span className="text-[10px] text-muted-foreground">
                          {formatDistanceToNow(new Date(comunicado.created_at), {
                            addSuffix: true,
                            locale: ptBR,
                          })}
                        </span>
                        {!comunicado.lido && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => handleConfirmRead(comunicado)}
                            disabled={confirmLeitura.isPending}
                          >
                            {confirmLeitura.isPending ? (
                              <Loader2 className="w-3 h-3 animate-spin mr-1" />
                            ) : (
                              <CheckCircle2 className="w-3 h-3 mr-1" />
                            )}
                            Confirmar Leitura
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

function PendenciaCard({ pendencia, onDismiss }: { pendencia: Pendencia; onDismiss?: (id: string) => void }) {
  if (pendencia.tipo === 'amistoso_aberto') {
    return (
      <div className="p-3 rounded-lg border bg-amber-500/5 border-amber-500/30">
        <div className="flex items-start gap-3">
          <div className="p-1.5 rounded-md bg-amber-500/10 text-amber-600">
            <Swords className="w-3.5 h-3.5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h4 className="font-semibold text-sm text-foreground">
                Amistoso em aberto
              </h4>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-amber-500/10 text-amber-600 border-amber-500/20">
                {pendencia.diasAtraso} dia{pendencia.diasAtraso > 1 ? 's' : ''} de atraso
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              <strong>{pendencia.nome}</strong> — {parseLocalDate(pendencia.data).toLocaleDateString('pt-BR')}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Preencha placar, presenças e finalize o amistoso.
            </p>
            <div className="mt-2">
              <Link to="/dashboard/amistosos">
                <Button size="sm" variant="outline" className="h-7 text-xs">
                  <ExternalLink className="w-3 h-3 mr-1" />
                  Ir para Amistosos
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // chamada_pendente
  return (
    <div className="p-3 rounded-lg border bg-orange-500/5 border-orange-500/30">
      <div className="flex items-start gap-3">
        <div className="p-1.5 rounded-md bg-orange-500/10 text-orange-600">
          <ClipboardList className="w-3.5 h-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h4 className="font-semibold text-sm text-foreground">
              Chamada não realizada
            </h4>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-orange-500/10 text-orange-600 border-orange-500/20">
              {pendencia.diasAtraso} dia{pendencia.diasAtraso > 1 ? 's' : ''} de atraso
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            <strong>{pendencia.turma_nome}</strong> — {parseLocalDate(pendencia.data).toLocaleDateString('pt-BR')}
          </p>
        </div>
        {onDismiss && (
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-muted-foreground hover:text-foreground shrink-0"
            onClick={() => onDismiss(pendencia.id)}
            title="Descartar aviso"
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

export default MuralAvisosSchool;
