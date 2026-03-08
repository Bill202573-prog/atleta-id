import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAlunoHistorico } from '@/hooks/useAlunoHistoricoData';
import { 
  Trophy, 
  Target,
  Medal,
  Loader2,
  Award,
  Filter,
} from 'lucide-react';

interface DesempenhoTabProps {
  criancaId: string;
  childName: string;
}

const MESES = [
  { value: 'all', label: 'Todos os meses' },
  { value: '1', label: 'Janeiro' },
  { value: '2', label: 'Fevereiro' },
  { value: '3', label: 'Março' },
  { value: '4', label: 'Abril' },
  { value: '5', label: 'Maio' },
  { value: '6', label: 'Junho' },
  { value: '7', label: 'Julho' },
  { value: '8', label: 'Agosto' },
  { value: '9', label: 'Setembro' },
  { value: '10', label: 'Outubro' },
  { value: '11', label: 'Novembro' },
  { value: '12', label: 'Dezembro' },
];

const formatPremiacao = (tipo: string): string => {
  const map: Record<string, string> = {
    'artilheiro': 'Prêmio de Artilheiro',
    'melhor_jogador': 'Prêmio de Melhor Jogador',
    'melhor_goleiro': 'Prêmio de Melhor Goleiro',
    'destaque': 'Prêmio de Destaque',
    'fair_play': 'Prêmio Fair Play',
    'revelacao': 'Prêmio Revelação',
  };
  return map[tipo] || tipo.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
};

const SectionHeader = ({ icon: Icon, title }: { icon: React.ElementType; title: string }) => (
  <div className="flex items-center gap-2 bg-primary rounded-t-xl px-4 py-2.5">
    <Icon className="w-4 h-4 text-accent" />
    <span className="text-sm font-semibold text-accent">{title}</span>
  </div>
);

const DesempenhoTab = ({ criancaId, childName }: DesempenhoTabProps) => {
  const { data: eventosData, isLoading } = useAlunoHistorico(criancaId);
  
  const [mesSelecionado, setMesSelecionado] = useState('all');
  const [anoSelecionado, setAnoSelecionado] = useState('all');

  const anosDisponiveis = useMemo(() => {
    const anos = new Set<string>();
    eventosData?.eventos.forEach(e => {
      const ano = new Date(e.data).getFullYear().toString();
      anos.add(ano);
    });
    return Array.from(anos).sort((a, b) => b.localeCompare(a));
  }, [eventosData?.eventos]);

  const eventosFiltrados = useMemo(() => {
    if (!eventosData?.eventos) return [];
    return eventosData.eventos.filter(e => {
      const date = new Date(e.data);
      const matchMes = mesSelecionado === 'all' || (date.getMonth() + 1).toString() === mesSelecionado;
      const matchAno = anoSelecionado === 'all' || date.getFullYear().toString() === anoSelecionado;
      return matchMes && matchAno;
    });
  }, [eventosData?.eventos, mesSelecionado, anoSelecionado]);

  const statsFiltrados = useMemo(() => {
    const amistosos = eventosFiltrados.filter(e => e.tipo === 'amistoso');
    const campeonatos = eventosFiltrados.filter(e => e.tipo === 'campeonato');
    
    return {
      totalEventos: eventosFiltrados.length,
      totalGols: eventosFiltrados.reduce((acc, e) => acc + e.golsMarcados, 0),
      golsAmistosos: amistosos.reduce((acc, e) => acc + e.golsMarcados, 0),
      golsCampeonatos: campeonatos.reduce((acc, e) => acc + e.golsMarcados, 0),
      totalPremiacoes: eventosFiltrados.reduce((acc, e) => acc + e.premiacoes.length, 0),
      vitorias: eventosFiltrados.filter(e => e.resultado === 'vitoria').length,
      empates: eventosFiltrados.filter(e => e.resultado === 'empate').length,
      derrotas: eventosFiltrados.filter(e => e.resultado === 'derrota').length,
      totalAmistosos: amistosos.length,
      totalCampeonatos: campeonatos.length,
    };
  }, [eventosFiltrados]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Filtros */}
      <Card className="border-2 border-primary/40">
        <CardContent className="p-3">
          <div className="flex items-center gap-2 mb-2">
            <Filter className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Filtros</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Select value={mesSelecionado} onValueChange={setMesSelecionado}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Mês" />
              </SelectTrigger>
              <SelectContent>
                {MESES.map(mes => (
                  <SelectItem key={mes.value} value={mes.value}>
                    {mes.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={anoSelecionado} onValueChange={setAnoSelecionado}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Ano" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os anos</SelectItem>
                {anosDisponiveis.map(ano => (
                  <SelectItem key={ano} value={ano}>
                    {ano}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Gols Marcados */}
      <div className="rounded-xl border-2 border-primary/40 overflow-hidden">
        <SectionHeader icon={Target} title="Gols Marcados" />
        <div className="bg-card p-3">
          <div className="text-center pb-2">
            <p className="text-3xl font-bold text-foreground">{statsFiltrados.totalGols}</p>
            <p className="text-[10px] text-muted-foreground">gols no total</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg p-2.5 text-center bg-secondary border border-border">
              <p className="text-xl font-bold text-accent">{statsFiltrados.golsAmistosos}</p>
              <p className="text-[10px] text-muted-foreground">em amistosos</p>
              <span className="text-[10px] text-muted-foreground">({statsFiltrados.totalAmistosos} jogos)</span>
            </div>
            <div className="rounded-lg p-2.5 text-center bg-secondary border border-border">
              <p className="text-xl font-bold text-accent">{statsFiltrados.golsCampeonatos}</p>
              <p className="text-[10px] text-muted-foreground">em campeonatos</p>
              <span className="text-[10px] text-muted-foreground">({statsFiltrados.totalCampeonatos} jogos)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Row - Jogos e Premiações */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border-2 border-primary/40 overflow-hidden">
          <div className="bg-card p-3 text-center">
            <Medal className="w-6 h-6 mx-auto text-success mb-1" />
            <p className="text-2xl font-bold text-foreground">{statsFiltrados.totalEventos}</p>
            <p className="text-[10px] text-muted-foreground">Jogos disputados</p>
          </div>
        </div>
        <div className="rounded-xl border-2 border-primary/40 overflow-hidden">
          <div className="bg-card p-3 text-center">
            <Trophy className="w-6 h-6 mx-auto text-warning mb-1" />
            <p className="text-2xl font-bold text-foreground">{statsFiltrados.totalPremiacoes}</p>
            <p className="text-[10px] text-muted-foreground">Premiações</p>
          </div>
        </div>
      </div>

      {/* Resultados */}
      <div className="rounded-xl border-2 border-primary/40 overflow-hidden">
        <SectionHeader icon={Award} title="Resultados" />
        <div className="bg-card p-3">
          <div className="flex justify-around">
            <div className="text-center">
              <Badge variant="outline" className="bg-success/10 text-success border-success/30 mb-1 text-[10px] px-1.5 py-0">
                V
              </Badge>
              <p className="text-xl font-bold text-success">{statsFiltrados.vitorias}</p>
              <p className="text-[10px] text-muted-foreground">Vitórias</p>
            </div>
            <div className="text-center">
              <Badge variant="outline" className="bg-muted mb-1 text-[10px] px-1.5 py-0">
                E
              </Badge>
              <p className="text-xl font-bold text-muted-foreground">{statsFiltrados.empates}</p>
              <p className="text-[10px] text-muted-foreground">Empates</p>
            </div>
            <div className="text-center">
              <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 mb-1 text-[10px] px-1.5 py-0">
                D
              </Badge>
              <p className="text-xl font-bold text-destructive">{statsFiltrados.derrotas}</p>
              <p className="text-[10px] text-muted-foreground">Derrotas</p>
            </div>
          </div>
        </div>
      </div>

      {/* Premiações Recentes */}
      {eventosFiltrados.filter(e => e.premiacoes.length > 0).length > 0 && (
        <div className="rounded-xl border-2 border-primary/40 overflow-hidden">
          <SectionHeader icon={Trophy} title="Premiações" />
          <div className="bg-card p-3 space-y-2">
            {eventosFiltrados
              .filter(e => e.premiacoes.length > 0)
              .slice(0, 10)
              .map(evento => (
                <div key={evento.id} className="p-2.5 rounded-lg border border-primary/20 bg-secondary/50">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-xs text-foreground">{evento.nome}</p>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(evento.data).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                  <div className="mt-1.5 space-y-1">
                    {evento.premiacoes.map((p) => (
                      <div key={p.id} className="flex items-center gap-1.5">
                        <Trophy className="w-3 h-3 text-warning flex-shrink-0" />
                        <span className="text-xs text-foreground">{formatPremiacao(p.tipo)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default DesempenhoTab;
