import { useState } from 'react';
import { useAmistosoConvocacoesStats } from '@/hooks/useAmistosoConvocacoesData';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ChevronDown, ChevronUp, Users, Eye, CheckCircle, Gift, Loader2, CreditCard, AlertTriangle } from 'lucide-react';

interface AmistosoConvocacaoSummaryProps {
  eventoId: string;
  elegiveisCount?: number;
}

export function AmistosoConvocacaoSummary({ eventoId, elegiveisCount }: AmistosoConvocacaoSummaryProps) {
  const [isOpen, setIsOpen] = useState(true);
  const { data: stats, isLoading } = useAmistosoConvocacoesStats(eventoId);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-1">
        <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Carregando resumo...</span>
      </div>
    );
  }

  if (!stats || stats.convocados === 0) return null;

  const items = [
    {
      label: 'Convocados',
      value: stats.convocados,
      icon: Users,
      color: 'bg-muted text-muted-foreground border-border',
    },
    {
      label: 'Visualizados',
      value: stats.visualizados,
      icon: Eye,
      color: 'bg-green-500/10 text-green-600 border-green-500/20',
    },
    {
      label: 'Pagos',
      value: stats.pagos,
      icon: CheckCircle,
      color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
    },
    {
      label: 'Isentos',
      value: stats.isentos,
      icon: Gift,
      color: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
    },
    {
      label: 'PIX Gerados',
      value: stats.pixGerados,
      icon: CreditCard,
      color: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
    },
  ];

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          {isOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          Resumo
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex flex-wrap gap-2 mt-1" onClick={(e) => e.stopPropagation()}>
          {items.map(({ label, value, icon: Icon, color }) => (
            <Badge key={label} variant="outline" className={`${color} text-[11px] h-6 gap-1 font-normal`}>
              <Icon className="w-3 h-3" />
              {label} <span className="font-semibold">{value}</span>
            </Badge>
          ))}
          {stats.semPix > 0 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/20 text-[11px] h-6 gap-1 font-normal cursor-help">
                    <AlertTriangle className="w-3 h-3" />
                    Sem PIX <span className="font-semibold">{stats.semPix}</span>
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  <p className="font-medium text-xs mb-1">Atletas sem cobrança gerada:</p>
                  <ul className="text-xs space-y-0.5">
                    {stats.atletasSemPix.map((nome, i) => (
                      <li key={i}>• {nome}</li>
                    ))}
                  </ul>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
