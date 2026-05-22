import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Sparkles, Search } from 'lucide-react';
import { useResumoMensalEscolas } from '@/hooks/useResumoMensalEscolas';

export default function AdminResumoMensalPage() {
  const { data, isLoading, toggle } = useResumoMensalEscolas();
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const list = data || [];
    if (!q.trim()) return list;
    const term = q.toLowerCase();
    return list.filter((e) => e.nome.toLowerCase().includes(term));
  }, [data, q]);

  const totalHabilitadas = (data || []).filter((e) => e.habilitado).length;

  return (
    <div className="container max-w-3xl mx-auto p-4 space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
          <Sparkles className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Resumo Mensal do Atleta</h1>
          <p className="text-sm text-muted-foreground">
            Escolha quais escolas recebem o resumo mensal automático.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Como funciona</CardTitle>
          <CardDescription>
            No dia 1 de cada mês, os responsáveis das crianças das escolas habilitadas recebem uma
            notificação push com o resumo do mês anterior. O bloco "Resumo do Mês" também passa a
            aparecer na Jornada desses atletas.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-base">Escolas ({totalHabilitadas} habilitadas)</CardTitle>
          </div>
          <div className="relative mt-2">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar escola..."
              className="pl-9"
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? (
            <>
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Nenhuma escola encontrada.
            </p>
          ) : (
            filtered.map((e) => (
              <div
                key={e.escolinha_id}
                className="flex items-center justify-between gap-3 p-3 rounded-lg border bg-card"
              >
                <div className="min-w-0">
                  <p className="font-medium truncate">{e.nome}</p>
                  {e.habilitado && e.habilitado_em && (
                    <p className="text-xs text-muted-foreground">
                      Desde {new Date(e.habilitado_em).toLocaleDateString('pt-BR')}
                    </p>
                  )}
                </div>
                <Switch
                  checked={e.habilitado}
                  disabled={toggle.isPending}
                  onCheckedChange={(checked) =>
                    toggle.mutate({ escolinha_id: e.escolinha_id, habilitar: checked })
                  }
                />
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
