import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  RefreshCw,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Trophy,
  Target,
  Medal,
  Swords,
  Flag,
  Dumbbell,
} from 'lucide-react';

interface CarreiraIdSyncDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  criancaId: string | null;
  criancaNome: string;
}

type Step = 'ask' | 'no-account' | 'sync';

interface SyncDataType {
  key: string;
  label: string;
  description: string;
  icon: React.ReactNode;
}

const SYNC_DATA_TYPES: SyncDataType[] = [
  { key: 'atividade_externa', label: 'Atividades Externas', description: 'Treinos, aulas e atividades registradas', icon: <Dumbbell className="w-4 h-4" /> },
  { key: 'evento_gol', label: 'Gols', description: 'Gols marcados em eventos esportivos', icon: <Target className="w-4 h-4" /> },
  { key: 'evento_premiacao', label: 'Premiações', description: 'Prêmios individuais recebidos', icon: <Medal className="w-4 h-4" /> },
  { key: 'conquista_coletiva', label: 'Conquistas Coletivas', description: 'Títulos e conquistas da equipe', icon: <Trophy className="w-4 h-4" /> },
  { key: 'amistoso_convocacao', label: 'Amistosos', description: 'Convocações para amistosos', icon: <Swords className="w-4 h-4" /> },
  { key: 'campeonato_convocacao', label: 'Campeonatos', description: 'Convocações para campeonatos', icon: <Flag className="w-4 h-4" /> },
];

interface SyncResult {
  success: boolean;
  total_sent: number;
  total_errors: number;
  details: { type: string; count: number; errors: number }[];
}

export function CarreiraIdSyncDialog({ open, onOpenChange, criancaId, criancaNome }: CarreiraIdSyncDialogProps) {
  const [step, setStep] = useState<Step>('ask');
  const [selectedTypes, setSelectedTypes] = useState<Record<string, boolean>>(
    Object.fromEntries(SYNC_DATA_TYPES.map((t) => [t.key, true]))
  );
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);

  const handleToggle = (key: string) => {
    setSelectedTypes((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const selectedCount = Object.values(selectedTypes).filter(Boolean).length;

  const handleSync = async () => {
    if (!criancaId) return;

    const activeTypes = Object.entries(selectedTypes)
      .filter(([, v]) => v)
      .map(([k]) => k);

    if (activeTypes.length === 0) {
      toast.error('Selecione pelo menos um tipo de dado');
      return;
    }

    setSyncing(true);
    setSyncResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('sync-all-to-carreira', {
        body: { crianca_id: criancaId, data_types: activeTypes },
      });

      if (error) throw error;

      setSyncResult(data as SyncResult);

      if (data.total_errors > 0 && data.total_sent === 0) {
        toast.error('Não foi possível sincronizar. Verifique se o atleta possui perfil no Carreira ID.');
      } else if (data.total_sent > 0) {
        toast.success(`${data.total_sent} registro(s) sincronizado(s) com sucesso!`);
      } else {
        toast.info('Nenhum dado encontrado para sincronizar.');
      }
    } catch (err: any) {
      toast.error('Erro ao sincronizar: ' + err.message);
    } finally {
      setSyncing(false);
    }
  };

  const handleOpenChange = (value: boolean) => {
    if (!value) {
      // Reset state when closing
      setStep('ask');
      setSyncResult(null);
    }
    onOpenChange(value);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        {step === 'ask' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <RefreshCw className="w-5 h-5 text-primary" />
                Carreira ID
              </DialogTitle>
              <DialogDescription>
                Sincronize os dados de {criancaNome} com o Carreira ID para construir o currículo esportivo.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 pt-2">
              <p className="text-sm font-medium text-foreground">
                Você já possui uma conta no Carreira ID?
              </p>
              <div className="flex gap-3">
                <Button
                  onClick={() => setStep('sync')}
                  className="flex-1"
                  size="lg"
                >
                  Sim, já tenho
                </Button>
                <Button
                  onClick={() => setStep('no-account')}
                  variant="outline"
                  className="flex-1"
                  size="lg"
                >
                  Ainda não
                </Button>
              </div>
            </div>
          </>
        )}

        {step === 'no-account' && (
          <>
            <DialogHeader>
              <DialogTitle>Crie sua conta no Carreira ID</DialogTitle>
              <DialogDescription>
                Para sincronizar os dados, primeiro crie um perfil no Carreira ID.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 pt-2">
              <Alert className="border-primary/30 bg-primary/5">
                <AlertCircle className="h-4 w-4 text-primary" />
                <AlertDescription className="text-sm">
                  <ol className="list-decimal list-inside space-y-2 mt-1">
                    <li>
                      Acesse{' '}
                      <a
                        href="https://carreiraid.com.br"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-primary underline inline-flex items-center gap-1"
                      >
                        carreiraid.com.br <ExternalLink className="w-3 h-3" />
                      </a>
                    </li>
                    <li>Crie seu perfil usando o <strong>mesmo email</strong> que usa aqui</li>
                    <li>Cadastre o atleta com o <strong>mesmo nome</strong>: {criancaNome}</li>
                    <li>Depois de criar, volte aqui e refaça esse processo</li>
                  </ol>
                </AlertDescription>
              </Alert>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setStep('ask')}
                  className="flex-1"
                >
                  Voltar
                </Button>
                <Button
                  asChild
                  className="flex-1"
                >
                  <a href="https://carreiraid.com.br" target="_blank" rel="noopener noreferrer">
                    Criar conta <ExternalLink className="w-4 h-4 ml-1" />
                  </a>
                </Button>
              </div>
            </div>
          </>
        )}

        {step === 'sync' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <RefreshCw className="w-5 h-5 text-primary" />
                Sincronizar dados
              </DialogTitle>
              <DialogDescription>
                Escolha quais dados de {criancaNome} deseja enviar para o Carreira ID.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 pt-2">
              <Alert className="border-muted bg-muted/30">
                <AlertCircle className="h-4 w-4 text-muted-foreground" />
                <AlertDescription className="text-xs text-muted-foreground">
                  O atleta precisa ter perfil no Carreira ID com o <strong>mesmo email</strong> do responsável e <strong>mesmo nome</strong>.
                </AlertDescription>
              </Alert>

              {/* Toggles */}
              <div className="space-y-1">
                {SYNC_DATA_TYPES.map((type) => (
                  <div
                    key={type.key}
                    className="flex items-center justify-between py-3 border-b last:border-0 border-border/50"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-muted-foreground">{type.icon}</span>
                      <div>
                        <p className="text-sm font-medium">{type.label}</p>
                        <p className="text-xs text-muted-foreground">{type.description}</p>
                      </div>
                    </div>
                    <Switch
                      checked={selectedTypes[type.key] ?? true}
                      onCheckedChange={() => handleToggle(type.key)}
                      disabled={syncing}
                    />
                  </div>
                ))}
              </div>

              {/* Sync button */}
              <Button
                onClick={handleSync}
                disabled={syncing || selectedCount === 0}
                className="w-full"
                size="lg"
              >
                {syncing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Sincronizando...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Sincronizar {selectedCount} tipo(s)
                  </>
                )}
              </Button>

              {/* Result */}
              {syncResult && (
                <div className={`rounded-lg border p-3 space-y-2 ${
                  syncResult.total_errors > 0 && syncResult.total_sent === 0
                    ? 'border-destructive/50 bg-destructive/5'
                    : 'border-primary/50 bg-primary/5'
                }`}>
                  <div className="flex items-center gap-2">
                    {syncResult.total_sent > 0 ? (
                      <CheckCircle2 className="w-4 h-4 text-primary" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-destructive" />
                    )}
                    <span className="text-sm font-medium">
                      {syncResult.total_sent} enviado(s)
                      {syncResult.total_errors > 0 && `, ${syncResult.total_errors} erro(s)`}
                    </span>
                  </div>
                  {syncResult.details.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {syncResult.details.map((d) => (
                        <Badge
                          key={d.type}
                          variant={d.errors > 0 ? 'destructive' : 'secondary'}
                          className="text-xs"
                        >
                          {d.type}: {d.count} ok{d.errors > 0 && `, ${d.errors} erro`}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <Button
                variant="ghost"
                onClick={() => setStep('ask')}
                className="w-full text-muted-foreground"
                size="sm"
              >
                Voltar
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
