import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Calendar,
  Search,
  CheckCircle2,
  Clock,
  AlertCircle,
  Ban,
  FileText,
  Users,
  Loader2,
  Plus,
  Smartphone,
  SmartphoneNfc,
  X
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useSchoolChildrenWithRelations } from '@/hooks/useSchoolData';
import { toast } from 'sonner';
import GenerateIndividualBillingDialog from './GenerateIndividualBillingDialog';
import { useStudentRegistration } from '@/contexts/StudentRegistrationContext';
import { useIsMobile } from '@/hooks/use-mobile';

const monthNames = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

interface StudentBillingStatus {
  criancaId: string;
  nome: string;
  status: 'emitida_paga' | 'emitida_pendente' | 'emitida_atrasada' | 'nao_emitida';
  statusFinanceiro: 'ativo' | 'suspenso' | 'isento';
  valorCadastrado?: number;
  mensalidadeId?: string;
  valor?: number;
  dataVencimento?: string;
  dataPagamento?: string;
  asaasPaymentId?: string | null;
  asaasPixUrl?: string | null;
  disponivelCelular: boolean;
}

const MonthlyBillingReport = () => {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const { data: children = [], isLoading: loadingChildren } = useSchoolChildrenWithRelations(undefined, true);
  const { openEditDialog } = useStudentRegistration();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterFinanceiro, setFilterFinanceiro] = useState<string>('all');
  const [filterDisponivel, setFilterDisponivel] = useState<string>('all');
  
  // Individual billing dialog state
  const [billingDialogOpen, setBillingDialogOpen] = useState(false);
  const [selectedStudentForBilling, setSelectedStudentForBilling] = useState<{ id: string; name: string } | null>(null);

  // Calculate month options: previous, current, next
  const monthOptions = useMemo(() => {
    const today = new Date();
    const options = [];

    for (let i = -1; i <= 1; i++) {
      let month = today.getMonth() + 1 + i;
      let year = today.getFullYear();
      if (month <= 0) {
        month += 12;
        year -= 1;
      } else if (month > 12) {
        month -= 12;
        year += 1;
      }
      const mesRef = `${year}-${String(month).padStart(2, '0')}-01`;
      const label = i === -1 ? 'Mês Anterior' : i === 0 ? 'Mês Atual' : 'Próximo Mês';
      options.push({
        value: mesRef,
        label: `${monthNames[month]}/${year}`,
        sublabel: label
      });
    }
    return options;
  }, []);

  const [selectedMonth, setSelectedMonth] = useState(monthOptions[1]?.value || '');

  const queryClient = useQueryClient();

  // Fetch mensalidades for the selected month - include Asaas fields
  const { data: mensalidades = [], isLoading: loadingMensalidades } = useQuery({
    queryKey: ['school-mensalidades-month-report', user?.escolinhaId, selectedMonth],
    queryFn: async () => {
      if (!user?.escolinhaId || !selectedMonth) return [];

      const { data, error } = await supabase
        .from('mensalidades')
        .select(`
          id,
          crianca_id,
          mes_referencia,
          valor,
          status,
          data_vencimento,
          data_pagamento,
          asaas_payment_id,
          asaas_pix_url
        `)
        .eq('escolinha_id', user.escolinhaId)
        .eq('mes_referencia', selectedMonth)
        .neq('status', 'cancelado');

      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.escolinhaId && !!selectedMonth,
  });

  // Fetch cobrancas_entrada that have mes_referencia_primeira_mensalidade matching selected month
  const { data: cobrancasEntrada = [] } = useQuery({
    queryKey: ['school-cobrancas-entrada-month', user?.escolinhaId, selectedMonth],
    queryFn: async () => {
      if (!user?.escolinhaId || !selectedMonth) return [];

      const { data, error } = await supabase
        .from('cobrancas_entrada')
        .select('crianca_id, mes_referencia_primeira_mensalidade, status, data_pagamento')
        .eq('escolinha_id', user.escolinhaId)
        .eq('mes_referencia_primeira_mensalidade', selectedMonth)
        .eq('status', 'pago');

      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.escolinhaId && !!selectedMonth,
  });

  // Mutation for generating individual billing
  const generateBillingMutation = useMutation({
    mutationFn: async ({ criancaId, mesReferencia }: { criancaId: string; mesReferencia: string }) => {
      const { data, error } = await supabase.functions.invoke('generate-student-billing-asaas', {
        body: { 
          escolinha_id: user?.escolinhaId, 
          mes_referencia: mesReferencia,
          crianca_id: criancaId
        }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data, variables) => {
      if (data?.results?.length > 0) {
        const result = data.results.find((r: any) => r.crianca_id === variables.criancaId);
        if (result) {
          if (result.status === 'already_exists') {
            toast.info('Mensalidade já existe para este mês');
            throw new Error('Mensalidade já existe para este mês');
          } else if (result.status === 'skipped') {
            toast.info(result.message || 'Aluno não elegível para cobrança');
            throw new Error(result.message || 'Aluno não elegível para cobrança');
          } else if (result.status !== 'created') {
            toast.error(result.message || 'Erro ao gerar cobrança');
            throw new Error(result.message || 'Erro ao gerar cobrança');
          }
        } else {
          if (data.summary?.skipped > 0) {
            toast.info('Aluno não elegível para cobrança neste mês');
            throw new Error('Aluno não elegível para cobrança neste mês');
          } else {
            toast.error('Nenhum resultado retornado para este aluno');
            throw new Error('Nenhum resultado retornado para este aluno');
          }
        }
      } else if (data?.error) {
        toast.error(data.error);
        throw new Error(data.error);
      }
      // Invalidate all related queries to refresh data including "disponível no celular"
      queryClient.invalidateQueries({ queryKey: ['school-mensalidades-month-report'] });
      queryClient.invalidateQueries({ queryKey: ['school-mensalidades-detail'] });
      queryClient.invalidateQueries({ queryKey: ['school-children'] });
      queryClient.invalidateQueries({ queryKey: ['school-children-relations'] });
      queryClient.invalidateQueries({ queryKey: ['school-cobrancas-entrada-month'] });
    },
    onError: (error: Error) => {
      if (!error.message.includes('já existe') && !error.message.includes('elegível')) {
        toast.error(`Erro ao gerar cobrança: ${error.message}`);
      }
    }
  });

  const handleOpenBillingDialog = (studentId: string, studentName: string) => {
    setSelectedStudentForBilling({ id: studentId, name: studentName });
    setBillingDialogOpen(true);
  };

  const handleConfirmBilling = async (mesReferencia: string) => {
    if (!selectedStudentForBilling) return;
    await generateBillingMutation.mutateAsync({
      criancaId: selectedStudentForBilling.id,
      mesReferencia
    });
  };

  // Build student billing status list
  const studentBillingData = useMemo((): StudentBillingStatus[] => {
    const activeChildren = children.filter(c => c.ativo);

    const paidViaEntradaSet = new Set(
      cobrancasEntrada.map(ce => ce.crianca_id)
    );

    return activeChildren.map(child => {
      const mensalidade = mensalidades.find(m => m.crianca_id === child.id);
      const statusFinanceiro = (child.status_financeiro || 'ativo') as 'ativo' | 'suspenso' | 'isento';
      const valorCadastrado = child.valor_mensalidade ?? 170;
      const paidViaEntrada = paidViaEntradaSet.has(child.id);

      if (paidViaEntrada && !mensalidade) {
        const entrada = cobrancasEntrada.find(ce => ce.crianca_id === child.id);
        return {
          criancaId: child.id,
          nome: child.nome,
          status: 'emitida_paga' as const,
          statusFinanceiro,
          valorCadastrado,
          valor: valorCadastrado,
          dataPagamento: entrada?.data_pagamento?.split('T')[0],
          disponivelCelular: true, // paid via entrada = was available
        };
      }

      if (!mensalidade) {
        return {
          criancaId: child.id,
          nome: child.nome,
          status: 'nao_emitida' as const,
          statusFinanceiro,
          valorCadastrado,
          disponivelCelular: false,
        };
      }

      const status = mensalidade.status?.toLowerCase();
      let billingStatus: StudentBillingStatus['status'];

      if (status === 'pago') {
        billingStatus = 'emitida_paga';
      } else if (status === 'atrasado') {
        billingStatus = 'emitida_atrasada';
      } else {
        // Check if due date has passed - if so, mark as overdue even if DB says 'a_vencer'
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (mensalidade.data_vencimento) {
          const [y, m, d] = mensalidade.data_vencimento.split('-').map(Number);
          const dueDate = new Date(y, m - 1, d);
          if (dueDate < today) {
            billingStatus = 'emitida_atrasada';
          } else {
            billingStatus = 'emitida_pendente';
          }
        } else {
          billingStatus = 'emitida_pendente';
        }
      }

      // A cobrança está disponível no celular se tem asaas_payment_id (PIX gerado via Asaas)
      const disponivelCelular = !!mensalidade.asaas_payment_id;

      return {
        criancaId: child.id,
        nome: child.nome,
        status: billingStatus,
        statusFinanceiro,
        valorCadastrado,
        mensalidadeId: mensalidade.id,
        valor: mensalidade.valor,
        dataVencimento: mensalidade.data_vencimento,
        dataPagamento: mensalidade.data_pagamento,
        asaasPaymentId: mensalidade.asaas_payment_id,
        asaasPixUrl: mensalidade.asaas_pix_url,
        disponivelCelular,
      };
    });
  }, [children, mensalidades, cobrancasEntrada]);

  // Filter the data
  const filteredData = useMemo(() => {
    return studentBillingData.filter(student => {
      const matchesSearch = student.nome.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = filterStatus === 'all' || student.status === filterStatus;
      const matchesFinanceiro = filterFinanceiro === 'all' || 
        (filterFinanceiro === 'isento' && student.statusFinanceiro === 'isento') ||
        (filterFinanceiro === 'pagante' && student.statusFinanceiro !== 'isento');
      const matchesDisponivel = filterDisponivel === 'all' ||
        (filterDisponivel === 'sim' && student.disponivelCelular) ||
        (filterDisponivel === 'nao' && !student.disponivelCelular && student.statusFinanceiro !== 'isento');
      return matchesSearch && matchesStatus && matchesFinanceiro && matchesDisponivel;
    });
  }, [studentBillingData, searchTerm, filterStatus, filterFinanceiro, filterDisponivel]);

  // Summary counts
  const summary = useMemo(() => {
    const pagantes = studentBillingData.filter(s => s.statusFinanceiro !== 'isento');
    const isentos = studentBillingData.filter(s => s.statusFinanceiro === 'isento');
    const emitidaPaga = pagantes.filter(s => s.status === 'emitida_paga').length;
    const emitidaPendente = pagantes.filter(s => s.status === 'emitida_pendente').length;
    const emitidaAtrasada = pagantes.filter(s => s.status === 'emitida_atrasada').length;
    const naoEmitida = pagantes.filter(s => s.status === 'nao_emitida').length;
    const totalEmitida = emitidaPaga + emitidaPendente + emitidaAtrasada;
    const disponivelCelularCount = pagantes.filter(s => s.disponivelCelular && s.status !== 'nao_emitida').length;

    return {
      emitidaPaga,
      emitidaPendente,
      emitidaAtrasada,
      naoEmitida,
      totalEmitida,
      totalPagantes: pagantes.length,
      totalIsentos: isentos.length,
      total: studentBillingData.length,
      disponivelCelular: disponivelCelularCount,
    };
  }, [studentBillingData]);

  const getStatusBadge = (status: StudentBillingStatus['status']) => {
    switch (status) {
      case 'emitida_paga':
        return (
          <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-xs">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Paga
          </Badge>
        );
      case 'emitida_pendente':
        return (
          <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20 text-xs">
            <Clock className="w-3 h-3 mr-1" />
            Pendente
          </Badge>
        );
      case 'emitida_atrasada':
        return (
          <Badge className="bg-destructive/10 text-destructive border-destructive/20 text-xs">
            <AlertCircle className="w-3 h-3 mr-1" />
            Atrasada
          </Badge>
        );
      case 'nao_emitida':
        return (
          <Badge variant="outline" className="text-muted-foreground text-xs">
            <Ban className="w-3 h-3 mr-1" />
            Não Emitida
          </Badge>
        );
    }
  };

  const getDisponivelBadge = (student: StudentBillingStatus) => {
    if (student.statusFinanceiro === 'isento') {
      return <span className="text-xs text-muted-foreground">-</span>;
    }
    if (student.status === 'nao_emitida') {
      return (
        <Badge variant="outline" className="text-muted-foreground text-xs gap-1">
          <X className="w-3 h-3" />
          Não gerada
        </Badge>
      );
    }
    if (student.disponivelCelular) {
      return (
        <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-xs gap-1">
          <SmartphoneNfc className="w-3 h-3" />
          Disponível
        </Badge>
      );
    }
    return (
      <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-xs gap-1">
        <Smartphone className="w-3 h-3" />
        Sem PIX
      </Badge>
    );
  };

  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return '-';
    const dateOnly = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
    const [year, month, day] = dateOnly.split('-').map(Number);
    if (!year || !month || !day) return '-';
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('pt-BR');
  };

  const isLoading = loadingChildren || loadingMensalidades;

  // Mobile card renderer for each student
  const renderStudentCard = (student: StudentBillingStatus) => {
    const valorDivergente = student.valor && student.valorCadastrado && student.valor !== student.valorCadastrado;
    const canGenerate = student.status === 'nao_emitida' && student.statusFinanceiro !== 'isento';
    const isGenerating = generateBillingMutation.isPending;

    return (
      <Card key={student.criancaId} className="border-border/60">
        <CardContent className="p-4 space-y-3">
          {/* Top row: Name + Status */}
          <div className="flex items-start justify-between gap-2">
            <button
              type="button"
              className="text-left font-semibold text-sm hover:text-primary hover:underline transition-colors cursor-pointer"
              onClick={() => {
                const child = children.find(c => c.id === student.criancaId);
                if (child) openEditDialog(child as any, user?.escolinhaId, 'financeiro');
              }}
            >
              {student.nome}
            </button>
            {getStatusBadge(student.status)}
          </div>

          {/* Info grid */}
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-xs text-muted-foreground">Tipo</span>
              <div className="mt-0.5">
                {student.statusFinanceiro === 'isento' ? (
                  <Badge variant="secondary" className="bg-purple-100 text-purple-700 text-xs">Isento</Badge>
                ) : (
                  <Badge variant="outline" className="text-xs">Pagante</Badge>
                )}
              </div>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Valor</span>
              <p className="font-semibold mt-0.5">
                {student.statusFinanceiro === 'isento' ? '-' : (
                  <span className={valorDivergente ? 'text-amber-600' : ''}>
                    R$ {(student.valor ?? student.valorCadastrado ?? 170).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    {valorDivergente && ' ⚠'}
                  </span>
                )}
              </p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Vencimento</span>
              <p className="mt-0.5">{formatDate(student.dataVencimento)}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Pagamento</span>
              <p className="mt-0.5">{formatDate(student.dataPagamento)}</p>
            </div>
          </div>

          {/* Disponível no celular */}
          <div className="flex items-center justify-between pt-2 border-t border-border/40">
            <span className="text-xs text-muted-foreground">No celular do responsável</span>
            {getDisponivelBadge(student)}
          </div>

          {/* Action button */}
          {canGenerate && (
            <Button
              size="sm"
              variant="outline"
              className="w-full gap-1.5 h-9"
              disabled={isGenerating}
              onClick={() => handleOpenBillingDialog(student.criancaId, student.nome)}
            >
              {isGenerating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Plus className="w-3.5 h-3.5" />
              )}
              Gerar Cobrança
            </Button>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header with Month Selector */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-primary/20 shrink-0">
                <FileText className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0">
                <CardTitle className="text-base">Relatório de Cobranças</CardTitle>
                <CardDescription className="text-xs">Status das cobranças por aluno</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Selecione o mês" />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      <div className="flex flex-col">
                        <span>{option.label}</span>
                        <span className="text-xs text-muted-foreground">{option.sublabel}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Summary Cards - 2x2 on mobile, 5 cols on desktop */}
      <div className="grid gap-2 grid-cols-2 sm:grid-cols-5">
        <Card 
          className={`cursor-pointer transition-all ${filterStatus === 'emitida_paga' ? 'ring-2 ring-emerald-500' : ''}`}
          onClick={() => setFilterStatus(filterStatus === 'emitida_paga' ? 'all' : 'emitida_paga')}
        >
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] text-muted-foreground leading-tight">Pagas</p>
                <p className="text-lg font-bold text-emerald-600">{summary.emitidaPaga}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer transition-all ${filterStatus === 'emitida_pendente' ? 'ring-2 ring-blue-500' : ''}`}
          onClick={() => setFilterStatus(filterStatus === 'emitida_pendente' ? 'all' : 'emitida_pendente')}
        >
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-500 shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] text-muted-foreground leading-tight">Pendentes</p>
                <p className="text-lg font-bold text-blue-600">{summary.emitidaPendente}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer transition-all ${filterStatus === 'emitida_atrasada' ? 'ring-2 ring-destructive' : ''}`}
          onClick={() => setFilterStatus(filterStatus === 'emitida_atrasada' ? 'all' : 'emitida_atrasada')}
        >
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] text-muted-foreground leading-tight">Atrasadas</p>
                <p className="text-lg font-bold text-destructive">{summary.emitidaAtrasada}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer transition-all ${filterStatus === 'nao_emitida' ? 'ring-2 ring-muted-foreground' : ''}`}
          onClick={() => setFilterStatus(filterStatus === 'nao_emitida' ? 'all' : 'nao_emitida')}
        >
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <Ban className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] text-muted-foreground leading-tight">Não Emitidas</p>
                <p className="text-lg font-bold text-muted-foreground">{summary.naoEmitida}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer transition-all col-span-2 sm:col-span-1 ${filterDisponivel === 'sim' ? 'ring-2 ring-emerald-500' : ''}`}
          onClick={() => setFilterDisponivel(filterDisponivel === 'sim' ? 'all' : 'sim')}
        >
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <SmartphoneNfc className="w-4 h-4 text-emerald-600 shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] text-muted-foreground leading-tight">No Celular</p>
                <p className="text-lg font-bold text-emerald-600">{summary.disponivelCelular}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Summary Info */}
      <Card>
        <CardContent className="p-3">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex gap-3 text-xs text-muted-foreground">
              <span>{summary.totalPagantes} pagantes</span>
              <span className="text-primary font-medium">{summary.totalIsentos} isentos</span>
            </div>
          </div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-muted-foreground">
              {summary.totalEmitida} de {summary.totalPagantes} cobranças emitidas
            </span>
            <span className="text-xs font-medium">
              {summary.totalPagantes > 0 ? Math.round((summary.totalEmitida / summary.totalPagantes) * 100) : 0}%
            </span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div 
              className="h-full bg-primary transition-all"
              style={{ width: `${summary.totalPagantes > 0 ? (summary.totalEmitida / summary.totalPagantes) * 100 : 0}%` }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar aluno..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-2">
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os status</SelectItem>
                  <SelectItem value="emitida_paga">Pagas</SelectItem>
                  <SelectItem value="emitida_pendente">Pendentes</SelectItem>
                  <SelectItem value="emitida_atrasada">Atrasadas</SelectItem>
                  <SelectItem value="nao_emitida">Não Emitidas</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterFinanceiro} onValueChange={setFilterFinanceiro}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="pagante">Pagantes</SelectItem>
                  <SelectItem value="isento">Isentos</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterDisponivel} onValueChange={setFilterDisponivel}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Celular" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="sim">No celular</SelectItem>
                  <SelectItem value="nao">Sem PIX</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : filteredData.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Nenhum aluno encontrado</p>
            </div>
          ) : isMobile ? (
            /* Mobile: Card layout */
            <div className="space-y-3">
              {filteredData.map(student => renderStudentCard(student))}
            </div>
          ) : (
            /* Desktop: Table layout */
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                        <TableHead className="min-w-[180px]">Aluno</TableHead>
                    <TableHead className="w-[80px] text-center">Tipo</TableHead>
                    <TableHead className="w-[100px] text-right">Valor</TableHead>
                    <TableHead className="w-[110px] text-center">Status</TableHead>
                    <TableHead className="w-[110px] text-center">Celular</TableHead>
                    <TableHead className="w-[100px] text-center">Vencimento</TableHead>
                    <TableHead className="w-[100px] text-center">Pagamento</TableHead>
                    <TableHead className="w-[90px] text-center">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredData.map((student) => {
                    const valorDivergente = student.valor && student.valorCadastrado && student.valor !== student.valorCadastrado;
                    const canGenerate = student.status === 'nao_emitida' && student.statusFinanceiro !== 'isento';
                    const isGenerating = generateBillingMutation.isPending;
                    return (
                      <TableRow key={student.criancaId}>
                        <TableCell className="font-medium">
                          <button
                            type="button"
                            className="text-left hover:text-primary hover:underline transition-colors cursor-pointer"
                            onClick={() => {
                              const child = children.find(c => c.id === student.criancaId);
                              if (child) openEditDialog(child as any, user?.escolinhaId, 'financeiro');
                            }}
                          >
                            {student.nome}
                          </button>
                        </TableCell>
                        <TableCell>
                          {student.statusFinanceiro === 'isento' ? (
                            <Badge variant="secondary" className="bg-purple-100 text-purple-700 text-xs">Isento</Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs">Pagante</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {student.statusFinanceiro === 'isento' ? (
                            <span className="text-muted-foreground">-</span>
                          ) : (
                            <span className={`font-medium ${valorDivergente ? 'text-amber-600' : ''}`}>
                              R$ {(student.valor ?? student.valorCadastrado ?? 170).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              {valorDivergente && <span className="ml-1 text-xs">⚠</span>}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">{getStatusBadge(student.status)}</TableCell>
                        <TableCell className="text-center">{getDisponivelBadge(student)}</TableCell>
                        <TableCell className="text-center text-sm">{formatDate(student.dataVencimento)}</TableCell>
                        <TableCell className="text-center text-sm">{formatDate(student.dataPagamento)}</TableCell>
                        <TableCell className="text-center">
                          {canGenerate ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1 h-8"
                              disabled={isGenerating}
                              onClick={() => handleOpenBillingDialog(student.criancaId, student.nome)}
                            >
                              {isGenerating ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Plus className="w-3 h-3" />
                              )}
                              Gerar
                            </Button>
                          ) : (
                            <span className="text-muted-foreground text-sm">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Individual Billing Dialog */}
      <GenerateIndividualBillingDialog
        open={billingDialogOpen}
        onOpenChange={(open) => {
          setBillingDialogOpen(open);
          if (!open) setSelectedStudentForBilling(null);
        }}
        onConfirm={handleConfirmBilling}
        isLoading={generateBillingMutation.isPending}
        studentName={selectedStudentForBilling?.name || ''}
      />
    </div>
  );
};

export default MonthlyBillingReport;
