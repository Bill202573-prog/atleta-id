import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sparkles, ChevronRight } from 'lucide-react';
import {
  useResumoMensal,
  useResumoMensalEnabled,
  getDefaultResumoRef,
  NOMES_MESES,
} from '@/hooks/useResumoMensal';

interface Props {
  criancaId: string;
  childName: string;
}

export function ResumoMesCard({ criancaId, childName }: Props) {
  const navigate = useNavigate();
  const { data: enabled } = useResumoMensalEnabled(criancaId);
  const { ano, mes } = getDefaultResumoRef();
  const { data, isLoading } = useResumoMensal(enabled ? criancaId : null, ano, mes);

  if (!enabled) return null;

  const firstName = childName?.split(' ')[0] || 'seu atleta';

  return (
    <Card
      className="mb-4 overflow-hidden border-0 shadow-md cursor-pointer transition-transform hover:scale-[1.01] active:scale-[0.99]"
      onClick={() => navigate(`/dashboard/jornada/resumo/${criancaId}/${ano}/${mes}`)}
    >
      <div className="relative p-4 bg-gradient-to-br from-primary via-primary to-primary/80 text-primary-foreground">
        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider opacity-90 mb-1">
          <Sparkles className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Resumo do Mês · {NOMES_MESES[mes - 1]} {ano}</span>
        </div>
        <p className="text-base font-semibold leading-snug break-words pr-1">
          Veja como foi o mês {firstName ? `de ${firstName}` : ''}
        </p>
        {data && !isLoading && (
          <p className="text-xs opacity-90 mt-1">
            {data.presenca.percentual}% de presença · {data.participacoes.jogos} jogo{data.participacoes.jogos === 1 ? '' : 's'}
          </p>
        )}
        <div className="mt-3 flex justify-end">
          <Button
            variant="secondary"
            size="sm"
            className="gap-1"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/dashboard/jornada/resumo/${criancaId}/${ano}/${mes}`);
            }}
          >
            Ver resumo
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}

export default ResumoMesCard;
