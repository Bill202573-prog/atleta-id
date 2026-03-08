import { useState, useEffect, useMemo } from 'react';
import { format, parseISO, isPast } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, Swords, AlertTriangle, X as XIcon } from 'lucide-react';
import type { EventoEsportivo } from '@/hooks/useEventosData';
import { useEventosConvocacoesCounts } from '@/hooks/useAmistosoConvocacoesData';

interface AmistosoPendentesPopupProps {
  eventos: EventoEsportivo[];
  onFinalizar: (evento: EventoEsportivo) => void;
  onCancelar: (evento: EventoEsportivo) => void;
}

export default function AmistosoPendentesPopup({
  eventos,
  onFinalizar,
  onCancelar,
}: AmistosoPendentesPopupProps) {
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => {
    try {
      const stored = sessionStorage.getItem('dismissed-amistosos-pendentes');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  // Filter past amistosos that are still "agendado" (no campeonato)
  const pastAgendados = useMemo(() => {
    return eventos.filter(
      (e) =>
        !e.campeonato_id &&
        e.status === 'agendado' &&
        isPast(parseISO(e.data + 'T23:59:59')) &&
        !dismissedIds.has(e.id)
    );
  }, [eventos, dismissedIds]);

  const eventoIds = useMemo(() => pastAgendados.map((e) => e.id), [pastAgendados]);
  const { data: convCounts = {} } = useEventosConvocacoesCounts(eventoIds);

  // Show popup for all past agendado events (with or without convocations)
  const pendentes = pastAgendados;

  const currentEvento = pendentes[0] || null;
  const currentHasConvocacoes = currentEvento ? (convCounts[currentEvento.id] || 0) > 0 : false;

  const handleDismiss = (eventoId: string) => {
    setDismissedIds((prev) => {
      const next = new Set(prev);
      next.add(eventoId);
      sessionStorage.setItem(
        'dismissed-amistosos-pendentes',
        JSON.stringify([...next])
      );
      return next;
    });
  };

  if (!currentEvento) return null;

  return (
    <AlertDialog open={!!currentEvento}>
      <AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md mx-auto">
        <AlertDialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 rounded-full bg-amber-500/10 shrink-0">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <AlertDialogTitle className="text-base sm:text-lg leading-tight">
              Amistoso não finalizado
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p className="text-xs sm:text-sm text-muted-foreground">
                O amistoso abaixo já passou e não foi finalizado. Deseja registrar os resultados?
              </p>
              <div className="p-3 rounded-lg border bg-muted/30 space-y-1.5">
                <div className="flex items-center gap-2">
                  <Swords className="w-4 h-4 text-orange-500 shrink-0" />
                  <span className="font-bold text-foreground text-sm sm:text-base">
                    {currentEvento.nome}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {format(parseISO(currentEvento.data), "dd/MM/yyyy", { locale: ptBR })}
                  </span>
                  {currentEvento.local && (
                    <span>📍 {currentEvento.local}</span>
                  )}
                  {currentEvento.categoria && (
                    <Badge variant="outline" className="text-[10px] h-5">{currentEvento.categoria}</Badge>
                  )}
                </div>
              </div>
              <div className="p-2 rounded-md bg-blue-500/10 border border-blue-500/20">
                <p className="text-xs text-blue-700 font-medium">
                  {currentHasConvocacoes
                    ? '💡 Confirme a presença, lance o placar e registre os detalhes do jogo.'
                    : '💡 Selecione os participantes por turma e lance o placar do jogo.'
                  }
                </p>
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col gap-2 sm:flex-col mt-2">
          <AlertDialogAction
            onClick={() => onFinalizar(currentEvento)}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-sm h-11"
          >
            ✅ Sim, lançar resultados
          </AlertDialogAction>
          <AlertDialogCancel
            onClick={() => handleDismiss(currentEvento.id)}
            className="w-full text-sm"
          >
            Lembrar depois
          </AlertDialogCancel>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-destructive hover:text-destructive w-full"
            onClick={() => {
              onCancelar(currentEvento);
              handleDismiss(currentEvento.id);
            }}
          >
            <XIcon className="w-3 h-3 mr-1" />
            Não aconteceu (cancelar)
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
