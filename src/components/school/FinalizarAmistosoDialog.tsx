import { useState, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useSchoolChildren, useSchoolTurmas } from '@/hooks/useSchoolData';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import ChildAvatar from '@/components/shared/ChildAvatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Trophy,
  Loader2,
  Goal,
  Medal,
  Users,
  Calendar,
  MapPin,
  Tag,
  Check,
  X,
  Plus,
  Trash2,
  AlertCircle,
  ThumbsUp,
  MessageSquare,
  ChevronRight,
  Info,
} from 'lucide-react';
import { toast } from 'sonner';
import type { EventoEsportivo } from '@/hooks/useEventosData';
import { useFinalizarEvento } from '@/hooks/useEventosData';
import { useAmistosoConvocacoes, type ConvocacaoWithCrianca } from '@/hooks/useAmistosoConvocacoesData';
import {
  useEventoGols,
  useCreateEventoGol,
  useDeleteEventoGol,
} from '@/hooks/useEventoGolsData';
import {
  useEventoPremiacoes,
  useCreateEventoPremiacao,
  useDeleteEventoPremiacao,
  TIPOS_PREMIACAO,
} from '@/hooks/useEventoPremiacoesData';
import { useEventoTimes, useCreateEventoTime, useAddAlunoToTime } from '@/hooks/useEventoTimesData';

interface FinalizarAmistosoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  evento: EventoEsportivo | null;
  onSuccess?: () => void;
}

interface PresencaState {
  [criancaId: string]: {
    presente: boolean | null;
    motivo_ausencia: string | null;
  };
}

interface DestaqueState {
  [criancaId: string]: boolean;
}

const MOTIVOS_AUSENCIA = [
  { value: 'nenhum', label: '—' },
  { value: 'sem_aviso', label: 'Sem aviso' },
  { value: 'justificado', label: 'Justificado' },
];

// Step definitions
type Step = 'presenca' | 'placar' | 'gols' | 'premiacoes' | 'observacoes';

const STEP_CONFIG: { key: Step; label: string; icon: React.ReactNode; hint: string }[] = [
  { key: 'presenca', label: 'Presença', icon: <Users className="w-4 h-4" />, hint: 'Confirme quem participou do jogo' },
  { key: 'placar', label: 'Placar', icon: <Goal className="w-4 h-4" />, hint: 'Informe o resultado da partida' },
  { key: 'gols', label: 'Gols', icon: <Trophy className="w-4 h-4" />, hint: 'Registre quem fez os gols' },
  { key: 'premiacoes', label: 'Prêmios', icon: <Medal className="w-4 h-4" />, hint: 'Destaque os melhores jogadores' },
  { key: 'observacoes', label: 'Resumo', icon: <MessageSquare className="w-4 h-4" />, hint: 'Adicione observações e marque destaques' },
];

export default function FinalizarAmistosoDialog({
  open,
  onOpenChange,
  evento,
  onSuccess,
}: FinalizarAmistosoDialogProps) {
  const queryClient = useQueryClient();
  
  // Step navigation
  const [currentStep, setCurrentStep] = useState<Step>('presenca');
  
  // Form state
  const [adversario, setAdversario] = useState('');
  const [placarTime1, setPlacarTime1] = useState('');
  const [placarTime2, setPlacarTime2] = useState('');
  const [presencas, setPresencas] = useState<PresencaState>({});
  const [destaques, setDestaques] = useState<DestaqueState>({});
  const [observacoesResultado, setObservacoesResultado] = useState('');
  const [selectedGolJogador, setSelectedGolJogador] = useState('');
  const [golQuantidade, setGolQuantidade] = useState('1');
  const [selectedPremiacao, setSelectedPremiacao] = useState('');
  const [selectedPremiacaoJogador, setSelectedPremiacaoJogador] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  
  // Turma filter for retroactive mode
  const [selectedTurmaIds, setSelectedTurmaIds] = useState<string[]>([]);
  
  // Data hooks
  const { data: convocacoes = [], isLoading: loadingConvocacoes } = useAmistosoConvocacoes(evento?.id || null);
  const { data: schoolChildren = [], isLoading: loadingSchoolChildren } = useSchoolChildren();
  const { data: turmas = [], isLoading: loadingTurmas } = useSchoolTurmas();
  const { data: times = [], isLoading: loadingTimes } = useEventoTimes(evento?.id);
  const { data: gols = [], isLoading: loadingGols } = useEventoGols(evento?.id || '');
  const { data: premiacoes = [], isLoading: loadingPremiacoes } = useEventoPremiacoes(evento?.id || '');
  
  // Mutations
  const finalizarMutation = useFinalizarEvento();
  const createTimeMutation = useCreateEventoTime();
  const addAlunoToTimeMutation = useAddAlunoToTime();
  const createGolMutation = useCreateEventoGol();
  const deleteGolMutation = useDeleteEventoGol();
  const createPremiacaoMutation = useCreateEventoPremiacao();
  const deletePremiacaoMutation = useDeleteEventoPremiacao();

  // Turma-children mapping — always loaded so admin can add athletes from turmas
  const [turmaChildrenMap, setTurmaChildrenMap] = useState<Record<string, string[]>>({});

  // Load turma-children relations (always, not just retroactive)
  useEffect(() => {
    if (!turmas.length) return;
    const loadTurmaChildren = async () => {
      const turmaIds = turmas.filter(t => t.status === 'ativa').map(t => t.id);
      if (!turmaIds.length) return;
      const { data } = await supabase
        .from('crianca_turma')
        .select('turma_id, crianca_id')
        .in('turma_id', turmaIds)
        .eq('ativo', true);
      if (data) {
        const map: Record<string, string[]> = {};
        data.forEach(ct => {
          if (!map[ct.turma_id]) map[ct.turma_id] = [];
          map[ct.turma_id].push(ct.crianca_id);
        });
        setTurmaChildrenMap(map);
      }
    };
    loadTurmaChildren();
  }, [turmas]);

  const hasScore = evento?.placar_time1 !== null && evento?.placar_time2 !== null;
  const getPlacar = (value: string, fallback: number | null) => {
    if (value === '') return 0;
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? fallback : parsed;
  };
  const localPlacar1 = hasScore ? evento?.placar_time1 : getPlacar(placarTime1, 0);
  const localPlacar2 = hasScore ? evento?.placar_time2 : getPlacar(placarTime2, 0);

  const schoolTeam = times[0];
  const getSchoolTeamName = () => {
    if (schoolTeam?.nome) return schoolTeam.nome;
    if (evento?.nome && evento.nome.includes(' x ')) return evento.nome.split(' x ')[0].trim();
    return evento?.categoria || 'Time da Escola';
  };
  const schoolTeamName = getSchoolTeamName();

  // Set of crianca IDs that come from existing convocations (not refused/canceled)
  const convocatedIds = useMemo(() => {
    return new Set(
      convocacoes
        .filter(c => c.status !== 'recusado' && c.status !== 'cancelado')
        .map(c => c.crianca_id)
    );
  }, [convocacoes]);

  // Extra athletes added via turma selection (not already convocated)
  const extraAthletes = useMemo((): ConvocacaoWithCrianca[] => {
    if (!evento || selectedTurmaIds.length === 0) return [];

    const allowedIds = new Set<string>();
    selectedTurmaIds.forEach(tId => {
      (turmaChildrenMap[tId] || []).forEach(cId => allowedIds.add(cId));
    });

    // Filter out those already in convocations
    const extraChildren = schoolChildren.filter(
      c => allowedIds.has(c.id) && !convocatedIds.has(c.id)
    );

    return extraChildren.map((child) => ({
      id: `extra-${child.id}`,
      evento_id: evento.id,
      crianca_id: child.id,
      valor: null,
      isento: true,
      status: 'isento',
      data_pagamento: null,
      notificado_em: null,
      presente: null,
      motivo_ausencia: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      crianca: {
        id: child.id,
        nome: child.nome,
        data_nascimento: child.data_nascimento,
        foto_url: child.foto_url,
      },
    }));
  }, [evento, selectedTurmaIds, turmaChildrenMap, schoolChildren, convocatedIds]);

  // Merged list: convocated athletes + extra from turmas
  const confirmedAthletes = useMemo(() => {
    const fromConvocacoes = convocacoes.filter(c => c.status !== 'recusado' && c.status !== 'cancelado');
    return [...fromConvocacoes, ...extraAthletes];
  }, [convocacoes, extraAthletes]);

  // Has any prior convocations?
  const hasConvocacoes = !loadingConvocacoes && convocacoes.filter(c => c.status !== 'recusado' && c.status !== 'cancelado').length > 0;

  // Initialize presencas when extraAthletes change (turma selection)
  useEffect(() => {
    const newPresencas: PresencaState = { ...presencas };
    let changed = false;
    extraAthletes.forEach(a => {
      if (!(a.crianca_id in newPresencas)) {
        newPresencas[a.crianca_id] = { presente: null, motivo_ausencia: null };
        changed = true;
      }
    });
    if (changed) setPresencas(newPresencas);
  }, [extraAthletes]);

  // Initialize form when dialog opens
  useEffect(() => {
    if (evento && open) {
      setAdversario(evento.adversario || '');
      setPlacarTime1(evento.placar_time1?.toString() || '');
      setPlacarTime2(evento.placar_time2?.toString() || '');
      setObservacoesResultado(evento.observacoes_resultado || '');
      setCurrentStep('presenca');
      setSelectedTurmaIds([]);
      setDestaques({});
      
      const initialPresencas: PresencaState = {};
      convocacoes.forEach(c => {
        if (c.status !== 'recusado' && c.status !== 'cancelado') {
          initialPresencas[c.crianca_id] = {
            presente: (c as any).presente ?? null,
            motivo_ausencia: (c as any).motivo_ausencia || null,
          };
        }
      });
      setPresencas(initialPresencas);
    }
  }, [evento, open, convocacoes]);

  const presentAthletes = useMemo(() => {
    return confirmedAthletes.filter(c => presencas[c.crianca_id]?.presente === true);
  }, [confirmedAthletes, presencas]);

  const totalGolsRegistrados = useMemo(() => gols.reduce((acc, g) => acc + g.quantidade, 0), [gols]);
  const maxGols = localPlacar1 ?? 0;
  const remainingGols = maxGols - totalGolsRegistrados;

  const availableForGoals = useMemo(() => {
    const registeredIds = new Set(gols.map(g => g.crianca_id));
    return presentAthletes.filter(a => !registeredIds.has(a.crianca_id));
  }, [presentAthletes, gols]);

  const availablePremiacoes = useMemo(() => {
    const usedTipos = new Set(premiacoes.map(p => p.tipo_premiacao));
    return TIPOS_PREMIACAO.filter(t => !usedTipos.has(t.value));
  }, [premiacoes]);

  const activeTurmas = useMemo(() => turmas.filter(t => t.status === 'ativa'), [turmas]);

  if (!evento) return null;

  const isLoading = loadingConvocacoes || loadingTimes || loadingGols || loadingPremiacoes || loadingSchoolChildren || loadingTurmas;

  const currentStepIndex = STEP_CONFIG.findIndex(s => s.key === currentStep);
  const currentStepConfig = STEP_CONFIG[currentStepIndex];

  const handlePresencaChange = (criancaId: string, presente: boolean) => {
    setPresencas(prev => ({
      ...prev,
      [criancaId]: {
        ...prev[criancaId],
        presente,
        motivo_ausencia: presente ? null : prev[criancaId]?.motivo_ausencia || null,
      },
    }));
  };

  const handleMotivoChange = (criancaId: string, motivo: string) => {
    setPresencas(prev => ({
      ...prev,
      [criancaId]: { ...prev[criancaId], motivo_ausencia: motivo === 'nenhum' ? null : motivo || null },
    }));
  };

  const handleToggleDestaque = (criancaId: string) => {
    setDestaques(prev => ({ ...prev, [criancaId]: !prev[criancaId] }));
  };

  const handleTurmaToggle = (turmaId: string) => {
    setSelectedTurmaIds(prev => 
      prev.includes(turmaId) ? prev.filter(id => id !== turmaId) : [...prev, turmaId]
    );
  };

  const handleSelectAllPresent = () => {
    const newPresencas = { ...presencas };
    confirmedAthletes.forEach(c => {
      newPresencas[c.crianca_id] = { presente: true, motivo_ausencia: null };
    });
    setPresencas(newPresencas);
  };

  const handleClearAll = () => {
    const newPresencas = { ...presencas };
    confirmedAthletes.forEach(c => {
      newPresencas[c.crianca_id] = { presente: null, motivo_ausencia: null };
    });
    setPresencas(newPresencas);
  };

  const canAdvanceFromPresenca = () => {
    // At least one athlete must be marked present
    return confirmedAthletes.some(c => presencas[c.crianca_id]?.presente === true);
  };

  const handleNextStep = () => {
    const idx = currentStepIndex;
    if (idx < STEP_CONFIG.length - 1) {
      // Skip gols step if score is 0
      const nextStep = STEP_CONFIG[idx + 1];
      if (nextStep.key === 'gols' && (localPlacar1 ?? 0) === 0) {
        setCurrentStep(STEP_CONFIG[idx + 2]?.key || 'observacoes');
      } else {
        setCurrentStep(nextStep.key);
      }
    }
  };

  const handlePrevStep = () => {
    const idx = currentStepIndex;
    if (idx > 0) {
      const prevStep = STEP_CONFIG[idx - 1];
      if (prevStep.key === 'gols' && (localPlacar1 ?? 0) === 0) {
        setCurrentStep(STEP_CONFIG[idx - 2]?.key || 'presenca');
      } else {
        setCurrentStep(prevStep.key);
      }
    }
  };

  const handleAddGol = async () => {
    if (!selectedGolJogador) { toast.error('Selecione um jogador'); return; }
    const qtd = parseInt(golQuantidade, 10);
    if (isNaN(qtd) || qtd <= 0 || qtd > remainingGols) {
      toast.error(`Máximo de ${remainingGols} gol(s) permitido(s)`);
      return;
    }
    try {
      let teamId = schoolTeam?.id;
      if (!teamId) {
        const newTeam = await createTimeMutation.mutateAsync({ eventoId: evento.id, nome: schoolTeamName });
        teamId = newTeam.id;
      }
      await createGolMutation.mutateAsync({ eventoId: evento.id, timeId: teamId, criancaId: selectedGolJogador, quantidade: qtd });
      setSelectedGolJogador('');
      setGolQuantidade('1');
      toast.success('Gol registrado');
    } catch {
      toast.error('Erro ao registrar gol');
    }
  };

  const handleDeleteGol = async (golId: string) => {
    try {
      await deleteGolMutation.mutateAsync({ id: golId, eventoId: evento.id });
      toast.success('Gol removido');
    } catch { toast.error('Erro ao remover gol'); }
  };

  const handleAddPremiacao = async () => {
    if (!selectedPremiacao || !selectedPremiacaoJogador) return;
    try {
      await createPremiacaoMutation.mutateAsync({ eventoId: evento.id, criancaId: selectedPremiacaoJogador, tipoPremiacao: selectedPremiacao });
      setSelectedPremiacao('');
      setSelectedPremiacaoJogador('');
      toast.success('Premiação registrada');
    } catch { toast.error('Erro ao registrar premiação'); }
  };

  const handleDeletePremiacao = async (premiacaoId: string) => {
    try {
      await deletePremiacaoMutation.mutateAsync({ id: premiacaoId, eventoId: evento.id });
      toast.success('Premiação removida');
    } catch { toast.error('Erro ao remover premiação'); }
  };

  const getTipoEmoji = (tipo: string) => {
    switch (tipo) {
      case 'melhor_jogador': return '🏆';
      case 'melhor_goleiro': return '🧤';
      case 'artilheiro': return '⚽';
      case 'melhor_defesa': return '🛡️';
      case 'destaque': return '⭐';
      default: return '🏅';
    }
  };
  const getTipoLabel = (tipo: string) => TIPOS_PREMIACAO.find(t => t.value === tipo)?.label || tipo;

  const handleSave = async () => {
    const placar1 = placarTime1 === '' ? 0 : parseInt(placarTime1, 10);
    const placar2 = placarTime2 === '' ? 0 : parseInt(placarTime2, 10);
    if (isNaN(placar1) || isNaN(placar2) || placar1 < 0 || placar2 < 0) {
      toast.error('Placar inválido');
      return;
    }
    if (!confirmedAthletes.some(c => presencas[c.crianca_id]?.presente === true)) {
      toast.error('Selecione pelo menos 1 atleta que participou');
      return;
    }

    setIsSaving(true);
    try {
      let teamId = schoolTeam?.id;
      if (!teamId) {
        const newTeam = await createTimeMutation.mutateAsync({ eventoId: evento.id, nome: evento.categoria || 'Time Principal' });
        teamId = newTeam.id;
      }

      const existingAlunoIds = new Set(schoolTeam?.alunos?.map((a: any) => a.crianca_id) || []);
      const presenteAtletas = confirmedAthletes.filter(c => presencas[c.crianca_id]?.presente === true);
      
      for (const atleta of presenteAtletas) {
        if (!existingAlunoIds.has(atleta.crianca_id)) {
          await addAlunoToTimeMutation.mutateAsync({ timeId: teamId, criancaId: atleta.crianca_id, eventoId: evento.id });
        }
      }

      await finalizarMutation.mutateAsync({
        id: evento.id,
        time1_id: teamId,
        adversario: adversario.trim() || null,
        placar_time1: placar1,
        placar_time2: placar2,
        status: 'realizado',
        observacoes_resultado: observacoesResultado.trim() || null,
      });

      // Save presence for each athlete
      for (const atleta of presenteAtletas) {
        const isExtraAthlete = !convocatedIds.has(atleta.crianca_id);
        if (isExtraAthlete) {
          // Insert new convocation for athletes added via turma selection
          await supabase
            .from('amistoso_convocacoes')
            .insert({
              evento_id: evento.id,
              crianca_id: atleta.crianca_id,
              valor: null,
              isento: true,
              status: 'isento',
              presente: true,
              notificado_em: null,
              destaque: destaques[atleta.crianca_id] || false,
            });
        } else {
          // Update existing convocation
          await supabase
            .from('amistoso_convocacoes')
            .update({
              presente: true,
              motivo_ausencia: null,
              destaque: destaques[atleta.crianca_id] || false,
            })
            .eq('evento_id', evento.id)
            .eq('crianca_id', atleta.crianca_id);
        }
      }

      // Update absent convocated athletes
      const absentConvocated = confirmedAthletes.filter(
        c => convocatedIds.has(c.crianca_id) && presencas[c.crianca_id]?.presente === false
      );
      for (const atleta of absentConvocated) {
        const ps = presencas[atleta.crianca_id];
        await supabase
          .from('amistoso_convocacoes')
          .update({
            presente: false,
            motivo_ausencia: ps?.motivo_ausencia || null,
            destaque: false,
          })
          .eq('evento_id', evento.id)
          .eq('crianca_id', atleta.crianca_id);
      }

      queryClient.invalidateQueries({ queryKey: ['school-eventos'] });
      queryClient.invalidateQueries({ queryKey: ['eventos-esportivos'] });
      queryClient.invalidateQueries({ queryKey: ['amistoso-convocacoes'] });
      queryClient.invalidateQueries({ queryKey: ['evento-times'] });
      queryClient.invalidateQueries({ queryKey: ['evento-gols'] });
      queryClient.invalidateQueries({ queryKey: ['evento-premiacoes'] });
      queryClient.invalidateQueries({ queryKey: ['aluno-historico'] });
      queryClient.invalidateQueries({ queryKey: ['financeiro-historico-unificado'] });
      queryClient.invalidateQueries({ queryKey: ['eventos-convocacoes-counts'] });

      toast.success('🎉 Jogo finalizado com sucesso!');
      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      toast.error(error.message || 'Erro ao finalizar jogo');
    } finally {
      setIsSaving(false);
    }
  };

  // --- Render helpers ---
  const renderStepIndicator = () => (
    <div className="flex items-center gap-1 mb-3 overflow-x-auto scrollbar-hide">
      {STEP_CONFIG.map((step, idx) => {
        // Skip gols if score is 0
        if (step.key === 'gols' && (localPlacar1 ?? 0) === 0 && currentStep !== 'gols') return null;
        const isCurrent = step.key === currentStep;
        const isPast = idx < currentStepIndex;
        const stepNumber = idx + 1;
        return (
          <button
            key={step.key}
            onClick={() => {
              if (isPast) setCurrentStep(step.key);
            }}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              isCurrent
                ? 'bg-primary text-primary-foreground'
                : isPast
                ? 'bg-primary/20 text-primary cursor-pointer hover:bg-primary/30'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {step.icon}
            <span>{step.label}</span>
          </button>
        );
      })}
    </div>
  );

  const renderHint = () => (
    <div className="flex items-start gap-2.5 p-3 rounded-lg bg-blue-600/10 border-2 border-blue-500/30 mb-4">
      <Info className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
      <p className="text-sm font-semibold text-blue-700">{currentStepConfig?.hint}</p>
    </div>
  );

  const renderPresencaStep = () => (
    <div className="space-y-3">
      {/* Turma selector to add more athletes */}
      {activeTurmas.length > 0 && (
        <div className="space-y-2">
          <Label className="text-xs sm:text-sm font-medium">
            {hasConvocacoes ? 'Adicionar atletas de outras turmas' : 'Selecione a(s) turma(s) que participaram'}
          </Label>
          <div className="flex flex-wrap gap-1.5">
            {activeTurmas.map(turma => (
              <Badge
                key={turma.id}
                variant={selectedTurmaIds.includes(turma.id) ? 'default' : 'outline'}
                className="cursor-pointer transition-colors text-[10px] sm:text-xs"
                onClick={() => handleTurmaToggle(turma.id)}
              >
                {turma.nome}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Convocated athletes section */}
      {hasConvocacoes && extraAthletes.length > 0 && (
        <Separator />
      )}

      <div className="flex items-center justify-between">
        <Badge variant="outline" className="text-[10px] sm:text-xs">
          {confirmedAthletes.filter(c => presencas[c.crianca_id]?.presente === true).length}/{confirmedAthletes.length} presentes
        </Badge>
        <div className="flex gap-1.5">
          <Button variant="outline" size="sm" className="text-[10px] sm:text-xs h-7" onClick={handleSelectAllPresent}>
            <Check className="w-3 h-3 mr-1" /> Todos
          </Button>
          <Button variant="outline" size="sm" className="text-[10px] sm:text-xs h-7" onClick={handleClearAll}>
            Limpar
          </Button>
        </div>
      </div>

      {confirmedAthletes.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground text-sm">
          {!hasConvocacoes ? 'Selecione uma turma acima para ver os atletas.' : 'Nenhum atleta para este amistoso. Selecione turmas acima para adicionar.'}
        </div>
      ) : (
        <div className="space-y-1.5">
          {confirmedAthletes.map((conv) => {
            const ps = presencas[conv.crianca_id];
            const isPresente = ps?.presente === true;
            const isAusente = ps?.presente === false;
            return (
              <div
                key={conv.id}
                className={`flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg border transition-colors ${
                  isPresente ? 'bg-emerald-500/10 border-emerald-500/30'
                    : isAusente ? 'bg-destructive/10 border-destructive/30'
                    : 'bg-muted/30'
                }`}
              >
                <ChildAvatar fotoUrl={conv.crianca?.foto_url} nome={conv.crianca?.nome || '?'} className="h-7 w-7 sm:h-8 sm:w-8 shrink-0" fallbackClassName="text-[10px] sm:text-xs" />
                <span className="flex-1 font-medium truncate text-xs sm:text-sm">{conv.crianca?.nome}</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button type="button" size="sm" variant={isPresente ? 'default' : 'outline'} className={`h-7 w-7 sm:h-8 sm:w-8 p-0 ${isPresente ? 'bg-emerald-600 hover:bg-emerald-700' : ''}`} onClick={(e) => { e.preventDefault(); e.stopPropagation(); handlePresencaChange(conv.crianca_id, true); }}>
                    <Check className="w-3.5 h-3.5" />
                  </Button>
                  <Button type="button" size="sm" variant={isAusente ? 'destructive' : 'outline'} className="h-7 w-7 sm:h-8 sm:w-8 p-0" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handlePresencaChange(conv.crianca_id, false); }}>
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
                {isAusente && (
                  <Select value={ps?.motivo_ausencia || ''} onValueChange={(v) => handleMotivoChange(conv.crianca_id, v)}>
                    <SelectTrigger className="w-24 sm:w-28 h-7 text-[10px] sm:text-xs shrink-0"><SelectValue placeholder="Motivo" /></SelectTrigger>
                    <SelectContent>
                      {MOTIVOS_AUSENCIA.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const renderPlacarStep = () => (
    <div className="space-y-4">
      {/* Compact editable scoreboard */}
      <div className="bg-gradient-to-r from-emerald-500/10 to-emerald-500/5 rounded-lg p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1 text-center min-w-0">
            <span className="font-bold text-xs sm:text-sm text-primary block truncate">{schoolTeamName}</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Input
              type="number"
              min="0"
              placeholder="0"
              value={placarTime1}
              onChange={(e) => setPlacarTime1(e.target.value)}
              className="w-14 h-10 text-center text-2xl font-bold p-0 border-2"
              disabled={hasScore}
            />
            <span className="text-lg font-bold text-muted-foreground">x</span>
            <Input
              type="number"
              min="0"
              placeholder="0"
              value={placarTime2}
              onChange={(e) => setPlacarTime2(e.target.value)}
              className="w-14 h-10 text-center text-2xl font-bold p-0 border-2"
              disabled={hasScore}
            />
          </div>
          <div className="flex-1 text-center min-w-0">
            <span className="font-bold text-xs sm:text-sm text-muted-foreground block truncate">{adversario || evento?.adversario || 'Adversário'}</span>
          </div>
        </div>
      </div>

      {!evento?.adversario && !hasScore && (
        <div className="space-y-2">
          <Label className="text-sm font-medium">Nome do Adversário</Label>
          <Input placeholder="Ex: Botafogo, Vasco..." value={adversario} onChange={(e) => setAdversario(e.target.value)} />
        </div>
      )}
    </div>
  );

  const renderGolsStep = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Badge variant="outline" className={remainingGols === 0 ? 'bg-emerald-500/10 text-emerald-700' : ''}>
          {totalGolsRegistrados}/{maxGols} gols registrados
        </Badge>
      </div>

      {totalGolsRegistrados > maxGols && (
        <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
          <AlertCircle className="w-4 h-4" />
          <span>Total de gols excede o placar final!</span>
        </div>
      )}

      {remainingGols > 0 && availableForGoals.length > 0 && (
        <div className="flex gap-2 items-end">
          <div className="flex-1 space-y-1">
            <Label>Jogador</Label>
            <Select value={selectedGolJogador} onValueChange={setSelectedGolJogador}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {availableForGoals.map(a => <SelectItem key={a.crianca_id} value={a.crianca_id}>{a.crianca?.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="w-20 space-y-1">
            <Label>Gols</Label>
            <Input type="number" min="1" max={remainingGols} value={golQuantidade} onChange={(e) => setGolQuantidade(e.target.value)} className="text-center" />
          </div>
          <Button onClick={handleAddGol} disabled={!selectedGolJogador || createGolMutation.isPending}>
            {createGolMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          </Button>
        </div>
      )}

      {remainingGols === 0 && maxGols > 0 && (
        <div className="p-3 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-sm text-emerald-700">
          ✅ Todos os gols foram distribuídos!
        </div>
      )}

      {gols.length > 0 && (
        <div className="space-y-2">
          {gols.map(gol => (
            <div key={gol.id} className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <span className="text-lg">⚽</span>
              <Avatar className="h-7 w-7">
                <AvatarImage src={gol.crianca?.foto_url || undefined} />
                <AvatarFallback className="text-xs">{gol.crianca?.nome?.split(' ').map(n => n[0]).join('').slice(0, 2)}</AvatarFallback>
              </Avatar>
              <span className="flex-1 font-medium">{gol.crianca?.nome}</span>
              <Badge variant="secondary">{gol.quantidade} gol(s)</Badge>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleDeleteGol(gol.id)} disabled={deleteGolMutation.isPending}>
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderPremiacoesStep = () => (
    <div className="space-y-4">
      {premiacoes.length > 0 && (
        <Badge variant="outline">{premiacoes.length} premiação(ões)</Badge>
      )}

      {availablePremiacoes.length > 0 && presentAthletes.length > 0 && (
        <div className="flex gap-2 items-end">
          <div className="flex-1 space-y-1">
            <Label>Tipo</Label>
            <Select value={selectedPremiacao} onValueChange={setSelectedPremiacao}>
              <SelectTrigger><SelectValue placeholder="Premiação" /></SelectTrigger>
              <SelectContent>
                {availablePremiacoes.map(t => <SelectItem key={t.value} value={t.value}>{getTipoEmoji(t.value)} {t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 space-y-1">
            <Label>Jogador</Label>
            <Select value={selectedPremiacaoJogador} onValueChange={setSelectedPremiacaoJogador}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {presentAthletes.map(a => <SelectItem key={a.crianca_id} value={a.crianca_id}>{a.crianca?.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleAddPremiacao} disabled={!selectedPremiacao || !selectedPremiacaoJogador || createPremiacaoMutation.isPending}>
            {createPremiacaoMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          </Button>
        </div>
      )}

      {premiacoes.length === 0 ? (
        <div className="text-center py-4 text-muted-foreground text-sm">
          Nenhuma premiação registrada. (opcional)
        </div>
      ) : (
        <div className="space-y-2">
          {premiacoes.map(p => (
            <div key={p.id} className="flex items-center gap-3 p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg">
              <span className="text-xl">{getTipoEmoji(p.tipo_premiacao)}</span>
              <Avatar className="h-7 w-7">
                <AvatarImage src={p.crianca?.foto_url || undefined} />
                <AvatarFallback className="text-xs">{p.crianca?.nome?.split(' ').map(n => n[0]).join('').slice(0, 2)}</AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="font-medium">{p.crianca?.nome}</div>
                <div className="text-xs text-muted-foreground">{getTipoLabel(p.tipo_premiacao)}</div>
              </div>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleDeletePremiacao(p.id)} disabled={deletePremiacaoMutation.isPending}>
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderObservacoesStep = () => (
    <div className="space-y-6">
      {/* Joinha section */}
      <div className="space-y-3">
        <h3 className="font-semibold flex items-center gap-2 text-sm">
          <ThumbsUp className="w-4 h-4 text-blue-600" />
          Destaque do Jogo
        </h3>
        <div className="p-2 rounded-md bg-blue-500/10 border border-blue-500/20">
          <p className="text-xs text-blue-700">
            👍 Marque os jogadores que se destacaram. Isso aparecerá na jornada do atleta.
          </p>
        </div>
        <div className="space-y-2">
          {presentAthletes.map(a => (
            <div
              key={a.crianca_id}
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                destaques[a.crianca_id]
                  ? 'bg-blue-500/10 border-blue-500/30 ring-1 ring-blue-500/20'
                  : 'bg-muted/30 hover:bg-muted/50'
              }`}
              onClick={() => handleToggleDestaque(a.crianca_id)}
            >
              <Avatar className="h-8 w-8">
                <AvatarImage src={a.crianca?.foto_url || undefined} />
                <AvatarFallback className="text-xs">{a.crianca?.nome?.split(' ').map(n => n[0]).join('').slice(0, 2)}</AvatarFallback>
              </Avatar>
              <span className="flex-1 font-medium text-sm">{a.crianca?.nome}</span>
              <div className={`p-1.5 rounded-full transition-colors ${destaques[a.crianca_id] ? 'bg-blue-600 text-white' : 'bg-muted text-muted-foreground'}`}>
                <ThumbsUp className="w-4 h-4" />
              </div>
            </div>
          ))}
        </div>
      </div>

      <Separator />

      {/* Observations */}
      <div className="space-y-3">
        <h3 className="font-semibold flex items-center gap-2 text-sm">
          <MessageSquare className="w-4 h-4" />
          Observações sobre o jogo
        </h3>
        <Textarea
          placeholder="Ex: Jogo equilibrado, adversário forte. Time mostrou evolução na marcação..."
          value={observacoesResultado}
          onChange={(e) => setObservacoesResultado(e.target.value)}
          rows={3}
        />
      </div>
    </div>
  );

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 'presenca': return renderPresencaStep();
      case 'placar': return renderPlacarStep();
      case 'gols': return renderGolsStep();
      case 'premiacoes': return renderPremiacoesStep();
      case 'observacoes': return renderObservacoesStep();
      default: return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-1rem)] sm:max-w-2xl max-h-[95vh] sm:max-h-[90vh] flex flex-col overflow-hidden p-4 sm:p-6">
        <DialogHeader className="flex-shrink-0 space-y-2">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Trophy className="w-5 h-5 text-emerald-600 shrink-0" />
            Finalizar Jogo
          </DialogTitle>
          {/* Event name - prominent */}
          {evento.nome && (
            <p className="text-sm sm:text-base font-bold text-foreground">{evento.nome}</p>
          )}
          {/* Event info bar */}
          <div className="flex flex-wrap gap-1.5 text-xs sm:text-sm text-muted-foreground">
            <Badge variant="outline" className="gap-1 text-[10px] sm:text-xs">
              <Calendar className="w-3 h-3" />
              {format(parseISO(evento.data), "dd/MM/yyyy", { locale: ptBR })}
            </Badge>
            {evento.local && (
              <Badge variant="outline" className="gap-1 text-[10px] sm:text-xs">
                <MapPin className="w-3 h-3" />
                <span className="truncate max-w-[120px] sm:max-w-none">{evento.local}</span>
              </Badge>
            )}
            {evento.categoria && (
              <Badge variant="outline" className="gap-1 text-[10px] sm:text-xs">
                <Tag className="w-3 h-3" />
                {evento.categoria}
              </Badge>
            )}
          </div>
        </DialogHeader>

        {/* Step indicator */}
        {renderStepIndicator()}

        <ScrollArea className="flex-1 pr-2 sm:pr-4 overflow-y-auto" style={{ maxHeight: 'calc(95vh - 260px)' }}>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="pb-4">
              {renderHint()}
              {renderCurrentStep()}
            </div>
          )}
        </ScrollArea>

        {/* Footer with navigation */}
        <div className="flex items-center justify-between pt-3 border-t gap-2">
          <div>
            {currentStepIndex > 0 && (
              <Button variant="outline" size="sm" onClick={handlePrevStep} className="text-xs sm:text-sm">
                Voltar
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} className="text-xs sm:text-sm">
              Cancelar
            </Button>
            {currentStep === 'observacoes' ? (
              <Button onClick={handleSave} size="sm" disabled={isSaving || isLoading} className="bg-emerald-600 hover:bg-emerald-700 text-xs sm:text-sm">
                {isSaving ? (
                  <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Salvando...</>
                ) : (
                  '✅ Finalizar Jogo'
                )}
              </Button>
            ) : (
              <Button
                onClick={handleNextStep}
                size="sm"
                disabled={currentStep === 'presenca' && !canAdvanceFromPresenca()}
                className="text-xs sm:text-sm"
              >
                Próximo
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
