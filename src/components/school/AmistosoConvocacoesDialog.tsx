import { useState, useMemo, useEffect } from 'react';
import { differenceInYears } from 'date-fns';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import ChildAvatar from '@/components/shared/ChildAvatar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Search, Users, Loader2, Save, UserCheck, DollarSign, Gift, CheckCircle, Clock, Send, Bell, Filter, Mail, Eye, XCircle, CreditCard, AlertTriangle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useEligibleAthletes } from '@/hooks/useCampeonatoConvocacoesData';
import {
  useAmistosoConvocacoes,
  useUpsertAmistosoConvocacoes,
  type CreateAmistosoConvocacaoInput,
} from '@/hooks/useAmistosoConvocacoesData';
import { useAuth } from '@/contexts/AuthContext';
import { useSchoolTurmas, getTurmaCategoriaBadge } from '@/hooks/useSchoolData';

interface AmistosoConvocacoesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventoId: string;
  eventoNome: string;
  categoria: string | null;
  taxaParticipacao: number | null;
  taxaJuiz: number | null;
  cobrarTaxaParticipacao: boolean;
  cobrarTaxaJuiz: boolean;
  /** When provided, only athletes with these IDs will be shown (e.g., for championship games) */
  allowedAtletaIds?: string[];
}

interface AtletaConvocacao {
  crianca_id: string;
  nome: string;
  idade: number;
  categoria: string;
  foto_url: string | null;
  convocado: boolean;
  valor: number | null;
  isento: boolean;
  useValorPadrao: boolean;
  status?: string;
  dataPagamento?: string | null;
  notificadoEm?: string | null;
  visualizado_em?: string | null;
  asaas_payment_id?: string | null;
}

export function AmistosoConvocacoesDialog({
  open,
  onOpenChange,
  eventoId,
  eventoNome,
  categoria,
  taxaParticipacao,
  taxaJuiz,
  cobrarTaxaParticipacao,
  cobrarTaxaJuiz,
  allowedAtletaIds,
}: AmistosoConvocacoesDialogProps) {
  const { user } = useAuth();
  const escolinhaId = user?.escolinhaId || null;
  
  const [searchTerm, setSearchTerm] = useState('');
  const [convocacoes, setConvocacoes] = useState<Map<string, AtletaConvocacao>>(new Map());
  const [initialized, setInitialized] = useState(false);
  const [selectedTurmaIds, setSelectedTurmaIds] = useState<string[]>([]);

  // Fetch school turmas for filter
  const { data: turmas = [] } = useSchoolTurmas();
  const activeTurmas = useMemo(() => turmas.filter(t => t.ativo), [turmas]);

  // Calculate total fee (taxa de participação + taxa de juiz if cobrar is true)
  const valorPadrao = useMemo(() => {
    let total = 0;
    if (cobrarTaxaParticipacao && taxaParticipacao) total += taxaParticipacao;
    if (cobrarTaxaJuiz && taxaJuiz) total += taxaJuiz;
    return total > 0 ? total : null;
  }, [taxaParticipacao, taxaJuiz, cobrarTaxaParticipacao, cobrarTaxaJuiz]);

  const { data: eligibleAthletes, isLoading: loadingAthletes } = useEligibleAthletes(
    selectedTurmaIds.length > 0 ? null : categoria,
    escolinhaId,
    selectedTurmaIds.length > 0 ? selectedTurmaIds : undefined,
  );
  const { data: existingConvocacoes, isLoading: loadingConvocacoes } = useAmistosoConvocacoes(eventoId);
  const upsertConvocacoes = useUpsertAmistosoConvocacoes();

  const toggleTurma = (turmaId: string) => {
    setSelectedTurmaIds(prev =>
      prev.includes(turmaId) ? prev.filter(id => id !== turmaId) : [...prev, turmaId]
    );
    setInitialized(false);
  };

  const handleSelectAll = () => {
    setConvocacoes(prev => {
      const map = new Map(prev);
      map.forEach((atleta, key) => {
        if (atleta.status !== 'pago' && atleta.status !== 'confirmado' && atleta.status !== 'recusado') {
          map.set(key, { ...atleta, convocado: true });
        }
      });
      return map;
    });
  };

  const handleDeselectAll = () => {
    setConvocacoes(prev => {
      const map = new Map(prev);
      map.forEach((atleta, key) => {
        if (atleta.status !== 'pago' && atleta.status !== 'confirmado' && atleta.status !== 'recusado' && !atleta.notificadoEm) {
          map.set(key, { ...atleta, convocado: false });
        }
      });
      return map;
    });
  };

  // Reset initialization when dialog opens
  useEffect(() => {
    if (!open) {
      setInitialized(false);
      setSearchTerm('');
      setSelectedTurmaIds([]);
    }
  }, [open]);

  // Initialize convocacoes state from existing data and eligible athletes
  useEffect(() => {
    if (!eligibleAthletes || loadingConvocacoes || initialized || !open) return;

    const map = new Map<string, AtletaConvocacao>();

    // Filter athletes by allowedAtletaIds if provided (for championship games)
    const filteredAthletes = allowedAtletaIds && allowedAtletaIds.length > 0
      ? eligibleAthletes.filter(a => allowedAtletaIds.includes(a.id))
      : eligibleAthletes;

    // First, add all eligible athletes as not convocado
    filteredAthletes.forEach(atleta => {
      map.set(atleta.id, {
        crianca_id: atleta.id,
        nome: atleta.nome,
        idade: atleta.idade,
        categoria: atleta.categoria,
        foto_url: atleta.foto_url,
        convocado: false,
        valor: null,
        isento: false,
        useValorPadrao: true,
      });
    });

    // Then, update with existing convocacoes
    if (existingConvocacoes) {
      existingConvocacoes.forEach(conv => {
        const existing = map.get(conv.crianca_id);
        if (existing) {
          map.set(conv.crianca_id, {
            ...existing,
            convocado: true,
            valor: conv.valor,
            isento: conv.isento,
            useValorPadrao: conv.valor === null && !conv.isento,
            status: conv.status,
            dataPagamento: conv.data_pagamento,
            notificadoEm: (conv as any).notificado_em,
            visualizado_em: (conv as any).visualizado_em || null,
            asaas_payment_id: (conv as any).asaas_payment_id || null,
          });
        } else if (conv.crianca) {
          const birthDate = new Date(conv.crianca.data_nascimento);
          const idade = differenceInYears(new Date(), birthDate);
          const birthYear = parseInt(conv.crianca.data_nascimento.split('T')[0].split('-')[0], 10);
          const sub = new Date().getFullYear() - birthYear;
          map.set(conv.crianca_id, {
            crianca_id: conv.crianca_id,
            nome: conv.crianca.nome,
            idade,
            categoria: `Sub-${sub}`,
            foto_url: conv.crianca.foto_url,
            convocado: true,
            valor: conv.valor,
            isento: conv.isento,
            useValorPadrao: conv.valor === null && !conv.isento,
            status: conv.status,
            dataPagamento: conv.data_pagamento,
            notificadoEm: (conv as any).notificado_em,
            visualizado_em: (conv as any).visualizado_em || null,
            asaas_payment_id: (conv as any).asaas_payment_id || null,
          });
        }
      });
    }

    setConvocacoes(map);
    setInitialized(true);
  }, [eligibleAthletes, existingConvocacoes, categoria, initialized, open]);

  // Keep tracking fields (visualizado_em, notificadoEm, status) in sync after initialization
  useEffect(() => {
    if (!initialized || !existingConvocacoes) return;
    setConvocacoes(prev => {
      const map = new Map(prev);
      let changed = false;
      existingConvocacoes.forEach(conv => {
        const existing = map.get(conv.crianca_id);
        if (existing) {
          const newViz = (conv as any).visualizado_em || null;
          const newNotif = (conv as any).notificado_em || null;
          const newStatus = conv.status;
          if (existing.visualizado_em !== newViz || existing.notificadoEm !== newNotif || existing.status !== newStatus) {
            map.set(conv.crianca_id, {
              ...existing,
              visualizado_em: newViz,
              notificadoEm: newNotif,
              status: newStatus,
              dataPagamento: conv.data_pagamento,
            });
            changed = true;
          }
        }
      });
      return changed ? map : prev;
    });
  }, [existingConvocacoes, initialized]);

  const filteredAtletas = useMemo(() => {
    const atletas = Array.from(convocacoes.values());
    if (!searchTerm) return atletas;

    return atletas.filter(atleta =>
      atleta.nome.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [convocacoes, searchTerm]);

  const convocadosCount = useMemo(() => {
    return Array.from(convocacoes.values()).filter(a => a.convocado).length;
  }, [convocacoes]);

  const pagosCount = useMemo(() => {
    return Array.from(convocacoes.values()).filter(a => a.convocado && a.status === 'pago').length;
  }, [convocacoes]);

  const isentosCount = useMemo(() => {
    return Array.from(convocacoes.values()).filter(a => a.convocado && a.isento).length;
  }, [convocacoes]);

  const recusadosCount = useMemo(() => {
    return Array.from(convocacoes.values()).filter(a => a.convocado && a.status === 'recusado').length;
  }, [convocacoes]);

  const visualizadosCount = useMemo(() => {
    return Array.from(convocacoes.values()).filter(a => a.convocado && a.visualizado_em).length;
  }, [convocacoes]);

  const pixGeradosCount = useMemo(() => {
    return Array.from(convocacoes.values()).filter(a => a.convocado && !a.isento && a.status !== 'recusado' && a.valor && a.valor > 0 && !!a.asaas_payment_id).length;
  }, [convocacoes]);

  const semPixList = useMemo(() => {
    return Array.from(convocacoes.values()).filter(a => a.convocado && !a.isento && a.status !== 'recusado' && a.valor && a.valor > 0 && !a.asaas_payment_id && !!a.notificadoEm);
  }, [convocacoes]);

  const handleToggleConvocado = (criancaId: string) => {
    setConvocacoes(prev => {
      const map = new Map(prev);
      const atleta = map.get(criancaId);
      if (atleta) {
        map.set(criancaId, { ...atleta, convocado: !atleta.convocado });
      }
      return map;
    });
  };

  const handleToggleIsento = (criancaId: string) => {
    setConvocacoes(prev => {
      const map = new Map(prev);
      const atleta = map.get(criancaId);
      if (atleta) {
        const newIsento = !atleta.isento;
        map.set(criancaId, { 
          ...atleta, 
          isento: newIsento,
          useValorPadrao: !newIsento && atleta.valor === null,
          valor: newIsento ? null : atleta.valor,
        });
      }
      return map;
    });
  };

  const handleValorChange = (criancaId: string, value: string) => {
    setConvocacoes(prev => {
      const map = new Map(prev);
      const atleta = map.get(criancaId);
      if (atleta) {
        const numValue = value ? parseFloat(value) : null;
        map.set(criancaId, { 
          ...atleta, 
          valor: numValue,
          useValorPadrao: false,
        });
      }
      return map;
    });
  };

  const handleUseValorPadrao = (criancaId: string) => {
    setConvocacoes(prev => {
      const map = new Map(prev);
      const atleta = map.get(criancaId);
      if (atleta) {
        map.set(criancaId, { 
          ...atleta, 
          valor: null,
          useValorPadrao: true,
          isento: false,
        });
      }
      return map;
    });
  };

  const handleSave = async (enviarNotificacoes = false) => {
    const convocados = Array.from(convocacoes.values())
      .filter(a => a.convocado)
      .map(a => ({
        evento_id: eventoId,
        crianca_id: a.crianca_id,
        valor: a.isento ? null : (a.useValorPadrao ? valorPadrao : a.valor),
        isento: a.isento,
      })) as CreateAmistosoConvocacaoInput[];

    try {
      const result = await upsertConvocacoes.mutateAsync({ 
        eventoId, 
        convocacoes: convocados,
        enviarNotificacoes,
        valorPadrao,
      });
      
      if (enviarNotificacoes && result.newNotifications > 0) {
        toast.success(`${result.newNotifications} convocação(ões) enviada(s) com cobrança PIX gerada!`);
      } else {
        toast.success(`${convocados.length} atleta(s) convocado(s) com sucesso!`);
      }
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || 'Erro ao salvar convocações');
    }
  };

  const pendingNotifications = useMemo(() => {
    return Array.from(convocacoes.values()).filter(a => a.convocado && !a.notificadoEm).length;
  }, [convocacoes]);

  const isLoading = loadingAthletes || loadingConvocacoes;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-sm sm:text-base">
            <Users className="w-4 h-4 sm:w-5 sm:h-5" />
            Convocação - {eventoNome}
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            Selecione os atletas que serão convocados para este jogo
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-3 overflow-y-auto flex-1 min-h-0">
            {/* Turma Filter */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Filter className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">Filtrar por turma:</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {activeTurmas.map(turma => {
                  const isSelected = selectedTurmaIds.includes(turma.id);
                  const categoriaLabel = getTurmaCategoriaBadge(turma);
                  return (
                    <Button
                      key={turma.id}
                      variant={isSelected ? 'default' : 'outline'}
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => toggleTurma(turma.id)}
                    >
                      {turma.nome}
                      {categoriaLabel && (
                        <Badge variant="secondary" className="ml-1 text-[10px] px-1 py-0">{categoriaLabel}</Badge>
                      )}
                    </Button>
                  );
                })}
                {selectedTurmaIds.length > 0 && (
                  <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => { setSelectedTurmaIds([]); setInitialized(false); }}>
                    Limpar filtro
                  </Button>
                )}
              </div>
            </div>
            {/* Stats - compact inline */}
            <div className="flex flex-wrap gap-2">
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-muted/50 rounded-md">
                <Users className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Elegíveis</span>
                <span className="text-sm font-bold">{convocacoes.size}</span>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-primary/10 rounded-md">
                <UserCheck className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs text-primary">Convocados</span>
                <span className="text-sm font-bold">{convocadosCount}</span>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-purple-500/10 rounded-md">
                <Eye className="w-3.5 h-3.5 text-purple-600" />
                <span className="text-xs text-purple-600">Visualizados</span>
                <span className="text-sm font-bold">{visualizadosCount}</span>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-500/10 rounded-md">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-xs text-emerald-600">Pagos</span>
                <span className="text-sm font-bold">{pagosCount}</span>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-500/10 rounded-md">
                <Gift className="w-3.5 h-3.5 text-amber-600" />
                <span className="text-xs text-amber-600">Isentos</span>
                <span className="text-sm font-bold">{isentosCount}</span>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-orange-500/10 rounded-md">
                <XCircle className="w-3.5 h-3.5 text-orange-600" />
                <span className="text-xs text-orange-600">Recusados</span>
                <span className="text-sm font-bold">{recusadosCount}</span>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-500/10 rounded-md">
                <CreditCard className="w-3.5 h-3.5 text-blue-600" />
                <span className="text-xs text-blue-600">PIX Gerados</span>
                <span className="text-sm font-bold">{pixGeradosCount}</span>
              </div>
              {semPixList.length > 0 && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-red-500/10 rounded-md cursor-help">
                        <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                        <span className="text-xs text-red-600">Sem PIX</span>
                        <span className="text-sm font-bold text-red-600">{semPixList.length}</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-xs">
                      <p className="font-medium text-xs mb-1">Atletas sem cobrança gerada:</p>
                      <ul className="text-xs space-y-0.5">
                        {semPixList.map((a) => (
                          <li key={a.crianca_id}>• {a.nome}</li>
                        ))}
                      </ul>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-muted/50 rounded-md">
                <DollarSign className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Valor Padrão</span>
                <span className="text-sm font-bold">
                  {valorPadrao ? `R$ ${valorPadrao.toFixed(2)}` : '-'}
                </span>
              </div>
            </div>

            {/* Search + Select All */}
            <div className="flex gap-2 items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar atleta..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Button variant="outline" size="sm" onClick={handleSelectAll} className="whitespace-nowrap">
                <UserCheck className="w-4 h-4 mr-1" />
                Todos
              </Button>
              {convocadosCount > 0 && (
                <Button variant="ghost" size="sm" onClick={handleDeselectAll} className="whitespace-nowrap text-muted-foreground">
                  Limpar
                </Button>
              )}
            </div>

            {/* Table - Desktop */}
            <div className="rounded-md border overflow-x-auto max-h-[350px] overflow-y-auto hidden sm:block">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="w-[50px]">Convocar</TableHead>
                    <TableHead>Atleta</TableHead>
                    <TableHead>Idade</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead className="w-[80px]">Isentar</TableHead>
                    <TableHead className="w-[100px]">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAtletas.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        {convocacoes.size === 0
                          ? 'Nenhum atleta elegível encontrado para esta categoria'
                          : 'Nenhum atleta encontrado com a busca'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredAtletas.map(atleta => (
                      <TableRow 
                        key={atleta.crianca_id} 
                        className={
                          atleta.status === 'recusado' 
                            ? 'bg-red-500/10' 
                            : atleta.status === 'pago' || atleta.status === 'confirmado'
                              ? 'bg-emerald-500/10' 
                              : atleta.convocado 
                                ? 'bg-primary/5' 
                                : ''
                        }
                      >
                        <TableCell>
                          <Checkbox
                            checked={atleta.convocado}
                            onCheckedChange={() => handleToggleConvocado(atleta.crianca_id)}
                            disabled={atleta.status === 'pago' || atleta.status === 'confirmado' || atleta.status === 'recusado'}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <ChildAvatar fotoUrl={atleta.foto_url} nome={atleta.nome} className="h-8 w-8" fallbackClassName="text-xs" />
                            <div>
                              <span className="font-medium">{atleta.nome}</span>
                              <Badge variant="outline" className="ml-2 text-xs">{atleta.categoria}</Badge>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{atleta.idade} anos</TableCell>
                        <TableCell>
                          {atleta.convocado && !atleta.isento ? (
                            atleta.status === 'pago' ? (
                              <span className="font-medium text-emerald-600">
                                R$ {(atleta.valor ?? valorPadrao ?? 0).toFixed(2)}
                              </span>
                            ) : (
                              <div className="flex items-center gap-2">
                                <Input
                                  type="number"
                                  placeholder={valorPadrao ? `R$ ${valorPadrao}` : 'Valor'}
                                  value={atleta.valor ?? ''}
                                  onChange={(e) => handleValorChange(atleta.crianca_id, e.target.value)}
                                  className="w-24 h-8"
                                  step="0.01"
                                  min="0"
                                />
                                {atleta.useValorPadrao && (
                                  <Badge variant="secondary" className="text-xs">
                                    Padrão
                                  </Badge>
                                )}
                              </div>
                            )
                          ) : atleta.isento ? (
                            <span className="text-muted-foreground">-</span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {atleta.convocado && atleta.status !== 'pago' && atleta.status !== 'confirmado' && atleta.status !== 'recusado' ? (
                            <div className="flex items-center gap-2">
                              <Checkbox
                                id={`isento-${atleta.crianca_id}`}
                                checked={atleta.isento}
                                onCheckedChange={() => handleToggleIsento(atleta.crianca_id)}
                              />
                              <label 
                                htmlFor={`isento-${atleta.crianca_id}`}
                                className="text-xs text-muted-foreground cursor-pointer"
                              >
                                Isentar
                              </label>
                            </div>
                          ) : atleta.convocado && atleta.isento ? (
                            <span className="text-xs text-amber-600 font-medium">Isento</span>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          {atleta.convocado && (
                            <TooltipProvider>
                              <div className="flex items-center gap-1.5">
                                {atleta.status === 'pago' || atleta.status === 'confirmado' ? (
                                  <Badge className="bg-emerald-500/20 text-emerald-700 border-emerald-500/30">
                                    <CheckCircle className="w-3 h-3 mr-1" />
                                    Confirmado
                                  </Badge>
                                ) : atleta.status === 'recusado' ? (
                                  <Badge className="bg-red-500/20 text-red-700 border-red-500/30">
                                    <XCircle className="w-3 h-3 mr-1" />
                                    Recusado
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-orange-600 border-orange-300 bg-orange-50">
                                    <Clock className="w-3 h-3 mr-1" />
                                    Pendente
                                  </Badge>
                                )}
                                {atleta.notificadoEm && atleta.status !== 'pago' && atleta.status !== 'confirmado' && atleta.status !== 'recusado' && (
                                  <div className="flex items-center gap-0.5 ml-1">
                                    <Tooltip>
                                      <TooltipTrigger>
                                        <Mail className="w-3.5 h-3.5 text-blue-500" />
                                      </TooltipTrigger>
                                      <TooltipContent>Enviado</TooltipContent>
                                    </Tooltip>
                                    {atleta.visualizado_em ? (
                                      <Tooltip>
                                        <TooltipTrigger>
                                          <Eye className="w-3.5 h-3.5 text-purple-500" />
                                        </TooltipTrigger>
                                        <TooltipContent>Visualizado</TooltipContent>
                                      </Tooltip>
                                    ) : null}
                                  </div>
                                )}
                              </div>
                            </TooltipProvider>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Mobile List */}
            <div className="sm:hidden max-h-[400px] overflow-y-auto">
              {filteredAtletas.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground text-sm">
                  {convocacoes.size === 0
                    ? 'Nenhum atleta elegível'
                    : 'Nenhum atleta encontrado'}
                </p>
              ) : (
                <div className="divide-y divide-border">
                  {filteredAtletas.map(atleta => (
                    <div 
                      key={atleta.crianca_id} 
                      className={`px-3 py-3 ${
                        atleta.status === 'recusado' 
                          ? 'bg-red-500/10' 
                          : atleta.status === 'pago' || atleta.status === 'confirmado'
                            ? 'bg-emerald-500/10' 
                            : atleta.convocado 
                              ? 'bg-primary/5' 
                              : ''
                      }`}
                    >
                      {/* Row 1: Checkbox + Photo + Name */}
                      <div className="flex items-center gap-2.5">
                        <Checkbox
                          checked={atleta.convocado}
                          onCheckedChange={() => handleToggleConvocado(atleta.crianca_id)}
                          disabled={atleta.status === 'pago' || atleta.status === 'confirmado' || atleta.status === 'recusado'}
                          className="h-5 w-5 flex-shrink-0"
                        />
                        <ChildAvatar fotoUrl={atleta.foto_url} nome={atleta.nome} className="h-11 w-11 flex-shrink-0" fallbackClassName="text-sm" />
                        <span className="font-semibold text-sm leading-tight flex-1 min-w-0 truncate">{atleta.nome}</span>
                      </div>

                      {/* Row 2: Category + Age + Sent + Viewed (tabulated) */}
                      <div className="flex items-center gap-3 mt-1.5 ml-[4.25rem]">
                        <Badge variant="outline" className="text-[11px] h-5 px-1.5 font-medium">{atleta.categoria}</Badge>
                        <span className="text-xs text-muted-foreground w-8">{atleta.idade}a</span>
                        {atleta.convocado && atleta.notificadoEm ? (
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1">
                              <Mail className="w-4 h-4 text-blue-500" />
                              <span className="text-[11px] text-blue-600">Enviado</span>
                            </div>
                            {atleta.visualizado_em ? (
                              <div className="flex items-center gap-1">
                                <Eye className="w-4 h-4 text-purple-500" />
                                <span className="text-[11px] text-purple-600">Visto</span>
                              </div>
                            ) : (
                              <span className="text-[11px] text-muted-foreground">Não visto</span>
                            )}
                          </div>
                        ) : atleta.convocado ? (
                          <span className="text-[11px] text-muted-foreground">Não enviado</span>
                        ) : null}
                      </div>

                      {/* Row 3: Value + Exempt + Status */}
                      {atleta.convocado && (
                        <div className="flex items-center gap-3 mt-2 ml-[4.25rem]">
                          {/* Valor */}
                          <div className="flex items-center gap-1.5">
                            {!atleta.isento ? (
                              atleta.status === 'pago' ? (
                                <span className="text-xs font-semibold text-emerald-600">
                                  R$ {(atleta.valor ?? valorPadrao ?? 0).toFixed(2)}
                                </span>
                              ) : (
                                <Input
                                  type="number"
                                  placeholder={valorPadrao ? `${valorPadrao}` : '0'}
                                  value={atleta.valor ?? ''}
                                  onChange={(e) => handleValorChange(atleta.crianca_id, e.target.value)}
                                  className="w-20 h-7 text-xs px-2"
                                  step="0.01"
                                  min="0"
                                />
                              )
                            ) : (
                              <span className="text-xs text-amber-600 font-semibold">Isento</span>
                            )}
                          </div>

                          {/* Isentar toggle */}
                          {atleta.status !== 'pago' && atleta.status !== 'confirmado' && atleta.status !== 'recusado' && (
                            <div className="flex items-center gap-1">
                              <Checkbox
                                id={`isento-m-${atleta.crianca_id}`}
                                checked={atleta.isento}
                                onCheckedChange={() => handleToggleIsento(atleta.crianca_id)}
                                className="h-4 w-4"
                              />
                              <label htmlFor={`isento-m-${atleta.crianca_id}`} className="text-[11px] text-muted-foreground">
                                Isentar
                              </label>
                            </div>
                          )}

                          {/* Status badge - pushed to the right */}
                          <div className="ml-auto">
                            {atleta.status === 'pago' || atleta.status === 'confirmado' ? (
                              <Badge className="bg-emerald-500/20 text-emerald-700 border-emerald-500/30 text-[11px] h-5 px-2">
                                <CheckCircle className="w-3 h-3 mr-1" />
                                Confirmado
                              </Badge>
                            ) : atleta.status === 'recusado' ? (
                              <Badge className="bg-red-500/20 text-red-700 border-red-500/30 text-[11px] h-5 px-2">
                                <XCircle className="w-3 h-3 mr-1" />
                                Recusado
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-orange-600 border-orange-300 bg-orange-50 text-[11px] h-5 px-2">
                                <Clock className="w-3 h-3 mr-1" />
                                Pendente
                              </Badge>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pt-3 border-t flex-shrink-0">
              <p className="text-xs sm:text-sm text-muted-foreground">
                {pendingNotifications > 0 
                  ? `📨 ${pendingNotifications} atleta(s) selecionado(s) sem notificação — clique "Enviar" para notificar`
                  : '✅ Todos os convocados já foram notificados'}
              </p>
              <div className="flex gap-2 w-full sm:w-auto">
                <Button variant="outline" size="sm" className="flex-1 sm:flex-none" onClick={() => handleSave(false)} disabled={upsertConvocacoes.isPending}>
                  {upsertConvocacoes.isPending ? (
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4 mr-1" />
                  )}
                  Salvar
                </Button>
                <Button size="sm" className="flex-1 sm:flex-none" onClick={() => handleSave(true)} disabled={upsertConvocacoes.isPending || pendingNotifications === 0}>
                  {upsertConvocacoes.isPending ? (
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4 mr-1" />
                  )}
                  Enviar
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
