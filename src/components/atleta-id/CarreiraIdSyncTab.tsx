import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PerfilAtleta } from '@/hooks/useAtletaIdData';
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

interface CarreiraIdSyncTabProps {
  perfil: PerfilAtleta;
}

interface SyncDataType {
  key: string;
  label: string;
  description: string;
  icon: React.ReactNode;
}

const SYNC_DATA_TYPES: SyncDataType[] = [
  {
    key: 'atividade_externa',
    label: 'Atividades Externas',
    description: 'Treinos, aulas e atividades registradas',
    icon: <Dumbbell className="w-4 h-4" />,
  },
  {
    key: 'evento_gol',
    label: 'Gols',
    description: 'Gols marcados em eventos esportivos',
    icon: <Target className="w-4 h-4" />,
  },
  {
    key: 'evento_premiacao',
    label: 'Premiações',
    description: 'Prêmios individuais recebidos',
    icon: <Medal className="w-4 h-4" />,
  },
  {
    key: 'conquista_coletiva',
    label: 'Conquistas Coletivas',
    description: 'Títulos e conquistas da equipe',
    icon: <Trophy className="w-4 h-4" />,
  },
  {
    key: 'amistoso_convocacao',
    label: 'Amistosos',
    description: 'Convocações para amistosos',
    icon: <Swords className="w-4 h-4" />,
  },
  {
    key: 'campeonato_convocacao',
    label: 'Campeonatos',
    description: 'Convocações para campeonatos',
    icon: <Flag className="w-4 h-4" />,
  },
];

interface SyncResult {
  success: boolean;
  total_sent: number;
  total_errors: number;
  details: { type: string; count: number; errors: number }[];
}

export function CarreiraIdSyncTab({ perfil }: CarreiraIdSyncTabProps) {
  const [selectedTypes, setSelectedTypes] = useState<Record<string, boolean>>(
    Object.fromEntries(SYNC_DATA_TYPES.map((t) => [t.key, true]))
  );
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);

  const criancaId = perfil.crianca_id;

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
        toast.error(
          'Não foi possível sincronizar. Verifique se o atleta possui perfil no Carreira ID.'
        );
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

  if (!criancaId) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Este perfil não está vinculado a uma criança cadastrada. A sincronização com o Carreira ID
          requer um vínculo com o cadastro da escolinha.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      {/* Info card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-primary" />
            Sincronizar com Carreira ID
          </CardTitle>
          <CardDescription>
            Envie os dados do atleta para o Carreira ID. Escolha quais tipos de dado deseja
            sincronizar.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Alert: precisa ter perfil no Carreira */}
      <Alert className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
        <AlertCircle className="h-4 w-4 text-amber-600" />
        <AlertDescription className="text-amber-800 dark:text-amber-200">
          Para sincronizar, o atleta precisa ter um perfil criado no{' '}
          <a
            href="https://carreira-id.lovable.app"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium underline inline-flex items-center gap-1"
          >
            Carreira ID <ExternalLink className="w-3 h-3" />
          </a>{' '}
          com o <strong>mesmo email</strong> do responsável e <strong>mesmo nome</strong> do atleta.
        </AlertDescription>
      </Alert>

      {/* Toggles por tipo de dado */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Dados para sincronizar</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
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
        </CardContent>
      </Card>

      {/* Botão de sync */}
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
            Sincronizar {selectedCount} tipo(s) de dado
          </>
        )}
      </Button>

      {/* Resultado */}
      {syncResult && (
        <Card
          className={
            syncResult.total_errors > 0 && syncResult.total_sent === 0
              ? 'border-destructive/50'
              : 'border-green-500/50'
          }
        >
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center gap-2">
              {syncResult.total_sent > 0 ? (
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              ) : (
                <AlertCircle className="w-5 h-5 text-destructive" />
              )}
              <span className="font-medium">
                {syncResult.total_sent} enviado(s)
                {syncResult.total_errors > 0 && `, ${syncResult.total_errors} erro(s)`}
              </span>
            </div>

            {syncResult.details.length > 0 && (
              <div className="flex flex-wrap gap-2">
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
          </CardContent>
        </Card>
      )}
    </div>
  );
}
