import { useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useSchoolChildrenWithRelations } from '@/hooks/useSchoolData';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  DollarSign, 
  Search, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  TrendingUp,
  Users,
  Calendar,
  CreditCard,
  Ban,
  List,
  User,
  Building2,
  ExternalLink,
  Clock,
  RefreshCw,
  Send,
  Landmark,
  FileBarChart,
  ArrowLeft,
  LayoutDashboard,
  ClipboardList,
  BarChart3,
  Receipt
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { parseLocalDate } from '@/lib/utils';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { toast } from 'sonner';
import MensalidadeActionsDialog from '@/components/school/MensalidadeActionsDialog';
import AlunoFinanceiroHistorico from '@/components/school/AlunoFinanceiroHistorico';
import PixCheckoutDialog from '@/components/school/PixCheckoutDialog';
import CadastroBancarioForm from '@/components/school/CadastroBancarioForm';
import GenerateBillingDialog from '@/components/school/GenerateBillingDialog';
import FinancialReportSection from '@/components/school/FinancialReportSection';
import MonthlyBillingReport from '@/components/school/MonthlyBillingReport';
import { useStudentRegistration } from '@/contexts/StudentRegistrationContext';
import { logAdminAction } from '@/contexts/AdminSchoolContext';

interface MensalidadeDetail {
  id: string;
  crianca_id: string;
  crianca_nome: string;
  mes_referencia: string;
  valor: number;
  valor_pago: number | null;
  status: string;
  data_vencimento: string;
  data_pagamento: string | null;
  forma_pagamento: string | null;
  observacoes: string | null;
  asaas_pix_url: string | null;
  asaas_payment_id: string | null;
}

interface GrowthData {
  mes: string;
  mesLabel: string;
  alunos: number;
  receita: number;
}

const monthNames = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const formatMesReferencia = (mes: string) => {
  const [year, month] = mes.split('-');
  return `${monthNames[parseInt(month)]}/${year}`;
};

// SaaS billing types
interface HistoricoCobrancaSaas {
  id: string;
  escolinha_id: string;
  mes_referencia: string;
  valor: number;
  status: string;
  data_vencimento: string | null;
  data_pagamento: string | null;
  metodo_pagamento: string | null;
  asaas_pix_url: string | null;
  plano?: { nome: string } | null;
}

interface EscolinhaFinanceiro {
  id: string;
  escolinha_id: string;
  plano_id: string | null;
  valor_mensal: number | null;
  status: string;
  data_inicio_cobranca: string | null;
  plano?: { nome: string; valor_mensal: number } | null;
}

const statusCobrancaLabels: Record<string, string> = {
  pago: 'Pago',
  a_vencer: 'A Vencer',
  atrasado: 'Atrasado',
  cancelado: 'Cancelado'
};

const statusCobrancaColors: Record<string, string> = {
  pago: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  a_vencer: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  atrasado: 'bg-destructive/10 text-destructive border-destructive/20',
  cancelado: 'bg-muted text-muted-foreground border-muted'
};

type FinanceiroView = 'menu' | 'dashboard' | 'por-aluno' | 'todas' | 'cobrancas-mes' | 'relatorio' | 'assinatura' | 'cadastro-bancario';

interface ReportMenuItem {
  id: FinanceiroView;
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  badge?: string;
}

const SchoolFinanceiroPage = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeView, setActiveView] = useState<FinanceiroView>('menu');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterMonth, setFilterMonth] = useState<string>('all');
  
  // Action dialog state
  const [selectedMensalidade, setSelectedMensalidade] = useState<MensalidadeDetail | null>(null);
  const [actionType, setActionType] = useState<'pagar' | 'isentar' | null>(null);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);

  // PIX Checkout state
  const [pixCheckoutOpen, setPixCheckoutOpen] = useState(false);
  const [selectedCobranca, setSelectedCobranca] = useState<HistoricoCobrancaSaas | null>(null);

  // Generate billing dialog state
  const [generateBillingDialogOpen, setGenerateBillingDialogOpen] = useState(false);

  const { data: children = [] } = useSchoolChildrenWithRelations(undefined, true);
  const { openEditDialog } = useStudentRegistration();

  // Fetch escola status for tab styling AND cadastro bancario for API key check
  const { data: escolinha } = useQuery({
    queryKey: ['escola-status-financeiro', user?.escolinhaId],
    queryFn: async () => {
      if (!user?.escolinhaId) return null;
      
      const { data: escolaData, error: escolaError } = await supabase
        .from('escolinhas')
        .select('status_financeiro_escola')
        .eq('id', user.escolinhaId)
        .single();
      if (escolaError) throw escolaError;
      
      const { data: cadastroData } = await supabase
        .from('escola_cadastro_bancario')
        .select('asaas_api_key, asaas_status')
        .eq('escolinha_id', user.escolinhaId)
        .maybeSingle();
      
      return {
        status_financeiro_escola: escolaData?.status_financeiro_escola,
        hasAsaasApiKey: !!cadastroData?.asaas_api_key,
        asaasStatus: cadastroData?.asaas_status
      };
    },
    enabled: !!user?.escolinhaId,
  });

  const statusFinanceiroEscola = escolinha?.status_financeiro_escola || 'NAO_CONFIGURADO';
  const isCadastroBancarioAprovado = statusFinanceiroEscola === 'APROVADO' || 
    (escolinha?.hasAsaasApiKey && (escolinha?.asaasStatus === 'approved' || statusFinanceiroEscola === 'EM_ANALISE'));

  // Fetch SaaS subscription info
  const { data: escolinhaFinanceiro } = useQuery({
    queryKey: ['escola-financeiro', user?.escolinhaId],
    queryFn: async () => {
      if (!user?.escolinhaId) return null;

      const { data, error } = await supabase
        .from('escolinha_financeiro')
        .select(`
          id,
          escolinha_id,
          plano_id,
          valor_mensal,
          status,
          data_inicio_cobranca,
          plano:planos_saas(nome, valor_mensal)
        `)
        .eq('escolinha_id', user.escolinhaId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data as EscolinhaFinanceiro | null;
    },
    enabled: !!user?.escolinhaId,
  });

  // Fetch SaaS billing history
  const { data: historicoSaas = [], isLoading: loadingHistorico } = useQuery({
    queryKey: ['escola-historico-saas', user?.escolinhaId],
    queryFn: async () => {
      if (!user?.escolinhaId) return [];

      const { data, error } = await supabase
        .from('historico_cobrancas')
        .select(`
          id,
          escolinha_id,
          mes_referencia,
          valor,
          status,
          data_vencimento,
          data_pagamento,
          metodo_pagamento,
          asaas_pix_url,
          plano:planos_saas(nome)
        `)
        .eq('escolinha_id', user.escolinhaId)
        .order('mes_referencia', { ascending: false });

      if (error) throw error;
      return (data || []) as HistoricoCobrancaSaas[];
    },
    enabled: !!user?.escolinhaId,
  });

  // Fetch detailed mensalidades
  const { data: mensalidades = [], isLoading: loadingMensalidades } = useQuery({
    queryKey: ['school-mensalidades-detail', user?.escolinhaId],
    queryFn: async () => {
      if (!user?.escolinhaId) return [];

      const { data, error } = await supabase
        .from('mensalidades')
        .select(`
          id,
          crianca_id,
          mes_referencia,
          valor,
          valor_pago,
          status,
          data_vencimento,
          data_pagamento,
          forma_pagamento,
          observacoes,
          asaas_pix_url,
          asaas_payment_id,
          crianca:criancas!mensalidades_crianca_id_fkey(nome)
        `)
        .eq('escolinha_id', user.escolinhaId)
        .order('mes_referencia', { ascending: false });

      if (error) throw error;

      const result = data?.map(m => {
        const criancaNome = (m.crianca as any)?.nome || 
          children.find(c => c.id === m.crianca_id)?.nome || 
          'Aluno não encontrado';
        return {
          ...m,
          crianca_nome: criancaNome
        } as MensalidadeDetail;
      }) || [];

      return result;
    },
    enabled: !!user?.escolinhaId,
  });

  // Fetch cobrancas_entrada
  const { data: cobrancasEntrada = [] } = useQuery({
    queryKey: ['escola-cobrancas-entrada', user?.escolinhaId],
    queryFn: async () => {
      if (!user?.escolinhaId) return [];

      const { data, error } = await supabase
        .from('cobrancas_entrada')
        .select(`
          id,
          status,
          valor_total,
          valor_matricula,
          valor_uniforme,
          valor_mensalidade,
          data_pagamento,
          created_at
        `)
        .eq('escolinha_id', user.escolinhaId)
        .eq('status', 'pago');

      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.escolinhaId,
  });

  // Fetch growth data
  const { data: growthData = [] } = useQuery({
    queryKey: ['school-growth-data', user?.escolinhaId],
    queryFn: async () => {
      if (!user?.escolinhaId) return [];

      const today = new Date();
      const currentMonth = today.getMonth() + 1;
      const currentYear = today.getFullYear();

      const months: { mes: string; year: number; month: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        let m = currentMonth - i;
        let y = currentYear;
        if (m <= 0) {
          m += 12;
          y -= 1;
        }
        months.push({
          mes: `${y}-${String(m).padStart(2, '0')}-01`,
          year: y,
          month: m
        });
      }

      const { data: mensalidadesData } = await supabase
        .from('mensalidades')
        .select('mes_referencia, valor_pago, status, data_pagamento')
        .eq('escolinha_id', user.escolinhaId)
        .eq('status', 'pago');

      const { data: entradasData } = await supabase
        .from('cobrancas_entrada')
        .select('valor_matricula, valor_uniforme, valor_mensalidade, data_pagamento')
        .eq('escolinha_id', user.escolinhaId)
        .eq('status', 'pago');

      const { data: criancaEscolinhas } = await supabase
        .from('crianca_escolinha')
        .select('crianca_id, data_inicio')
        .eq('escolinha_id', user.escolinhaId)
        .eq('ativo', true);

      const result: GrowthData[] = months.map(({ mes, month, year }) => {
        const mensalidadesMes = mensalidadesData?.filter(m => {
          if (!m.mes_referencia) return false;
          const [refY, refM] = m.mes_referencia.split('-').map(Number);
          return refY === year && refM === month;
        }) || [];
        const receitaMensalidades = mensalidadesMes.reduce((acc, m) => acc + Number(m.valor_pago || 0), 0);

        const entradasMes = entradasData?.filter(e => {
          if (!e.data_pagamento) return false;
          const payDate = new Date(e.data_pagamento);
          return payDate.getFullYear() === year && (payDate.getMonth() + 1) === month;
        }) || [];
        const receitaEntradas = entradasMes.reduce((acc, e) => {
          return acc + Number(e.valor_matricula || 0) + Number(e.valor_uniforme || 0) + Number(e.valor_mensalidade || 0);
        }, 0);

        const receita = receitaMensalidades + receitaEntradas;

        const endOfMonth = new Date(year, month, 0);
        const alunosAteMes = criancaEscolinhas?.filter(ce => {
          const dataInicio = new Date(ce.data_inicio);
          return dataInicio <= endOfMonth;
        }).length || 0;

        return {
          mes,
          mesLabel: monthNames[month],
          alunos: alunosAteMes,
          receita
        };
      });

      return result;
    },
    enabled: !!user?.escolinhaId,
  });

  // Mutation for updating mensalidade
  const updateMensalidade = useMutation({
    mutationFn: async ({ 
      id, 
      status, 
      dataPagamento, 
      valorPago, 
      observacao 
    }: { 
      id: string; 
      status: string; 
      dataPagamento?: string; 
      valorPago?: number; 
      observacao?: string; 
    }) => {
      const { data: mensalidade, error: fetchError } = await supabase
        .from('mensalidades')
        .select('asaas_payment_id')
        .eq('id', id)
        .single();
      
      if (fetchError) throw fetchError;
      
      if (status === 'pago' && mensalidade?.asaas_payment_id) {
        try {
          const { data: cancelResult, error: cancelError } = await supabase.functions.invoke(
            'cancel-asaas-payment-only',
            { body: { mensalidadeId: id } }
          );
          
          if (cancelError) {
            console.warn('Could not cancel Asaas payment, proceeding anyway:', cancelError);
          } else {
            console.log('Asaas payment cancelled:', cancelResult);
          }
        } catch (cancelErr) {
          console.warn('Error cancelling Asaas payment, proceeding anyway:', cancelErr);
        }
      }
      
      const updateData: Record<string, unknown> = { status };
      
      if (status === 'pago') {
        updateData.data_pagamento = dataPagamento;
        updateData.valor_pago = valorPago;
        updateData.forma_pagamento = 'manual';
        updateData.asaas_payment_id = null;
        updateData.asaas_pix_url = null;
      }
      
      if (observacao) {
        updateData.observacoes = observacao;
      }

      const { error } = await supabase
        .from('mensalidades')
        .update(updateData)
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['school-mensalidades-detail'] });
      queryClient.invalidateQueries({ queryKey: ['school-growth-data'] });
      queryClient.invalidateQueries({ queryKey: ['financeiro-historico-unificado'] });
      if (variables.status !== 'pago') {
        toast.success('Mensalidade atualizada com sucesso!');
      }
    },
    onError: (error: Error) => {
      toast.error('Erro ao atualizar mensalidade: ' + error.message);
    },
  });

  // Mutation for generating student billings via Asaas
  const generateStudentBilling = useMutation({
    mutationFn: async (mesReferencia: string) => {
      const { data, error } = await supabase.functions.invoke('generate-student-billing-asaas', {
        body: { 
          escolinha_id: user?.escolinhaId,
          mes_referencia: mesReferencia 
        },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Erro ao gerar cobranças');
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['school-mensalidades-detail'] });
      setGenerateBillingDialogOpen(false);
      if (data?.summary) {
        const { created, already_exists, skipped, errors } = data.summary;
        toast.success(`Cobranças geradas: ${created} novas, ${already_exists} já existentes, ${skipped} ignoradas, ${errors} erros`);
      } else {
        toast.success('Cobranças geradas com sucesso!');
      }
    },
    onError: (error: Error) => {
      toast.error('Erro ao gerar cobranças: ' + error.message);
    },
  });

  const handleGenerateBilling = async (mesReferencia: string) => {
    await generateStudentBilling.mutateAsync(mesReferencia);
  };

  const handleActionConfirm = async (data: { dataPagamento?: string; valorPago?: number; observacao?: string }) => {
    if (!selectedMensalidade || !actionType) return;

    await updateMensalidade.mutateAsync({
      id: selectedMensalidade.id,
      status: actionType === 'pagar' ? 'pago' : 'isento',
      dataPagamento: data.dataPagamento,
      valorPago: data.valorPago,
      observacao: data.observacao,
    });

    if (user?.id && user?.escolinhaId) {
      logAdminAction(user.id, user.escolinhaId, actionType === 'pagar' ? 'baixa_manual_mensalidade' : 'isentar_mensalidade', {
        mensalidade_id: selectedMensalidade.id,
        mes_referencia: selectedMensalidade.mes_referencia,
        crianca_nome: selectedMensalidade.crianca_nome,
        valor: selectedMensalidade.valor,
        valor_pago: data.valorPago,
        observacao: data.observacao,
      });
    }

    setActionDialogOpen(false);
    setSelectedMensalidade(null);
    setActionType(null);
  };

  const openActionDialog = (mensalidade: MensalidadeDetail, action: 'pagar' | 'isentar') => {
    setSelectedMensalidade(mensalidade);
    setActionType(action);
    setActionDialogOpen(true);
  };

  // Get unique months for filter
  const uniqueMonths = [...new Set(mensalidades.map(m => m.mes_referencia))].sort().reverse();

  const filteredMensalidades = mensalidades.filter(m => {
    const matchesSearch = m.crianca_nome.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'all' || m.status === filterStatus;
    const matchesMonth = filterMonth === 'all' || m.mes_referencia === filterMonth;
    return matchesSearch && matchesStatus && matchesMonth;
  });

  // Calculate totals
  const totalRecebidoMensalidades = mensalidades
    .filter(m => m.status === 'pago')
    .reduce((acc, m) => acc + Number(m.valor_pago || m.valor), 0);
  
  const totalRecebidoEntradas = cobrancasEntrada.reduce((acc, ce) => {
    return acc + Number(ce.valor_matricula || 0) + Number(ce.valor_uniforme || 0) + Number(ce.valor_mensalidade || 0);
  }, 0);
  
  const totalRecebido = totalRecebidoMensalidades + totalRecebidoEntradas;
    
  const totalPendente = mensalidades
    .filter(m => m.status === 'a_vencer' || m.status === 'atrasado')
    .reduce((acc, m) => acc + Number(m.valor), 0);

  const alunosAtivos = children.filter(c => c.ativo && c.status_financeiro === 'ativo').length;
  
  const currentMonthDate = new Date();
  const currentMonthNum = currentMonthDate.getMonth() + 1;
  const currentYearNum = currentMonthDate.getFullYear();
  const currentMonth = `${currentYearNum}-${String(currentMonthNum).padStart(2, '0')}-01`;
  const nextMonthNum = currentMonthNum === 12 ? 1 : currentMonthNum + 1;
  const nextYearNum = currentMonthNum === 12 ? currentYearNum + 1 : currentYearNum;
  const nextMonth = `${nextYearNum}-${String(nextMonthNum).padStart(2, '0')}-01`;
  
  const mensalidadesMesAtual = mensalidades.filter(m => m.mes_referencia === currentMonth).length;

  const billingStatusByMonth = useMemo(() => {
    const statusMap: Record<string, { total: number; pending: number; paid: number }> = {};
    
    [currentMonth, nextMonth].forEach(mes => {
      const mesMensalidades = mensalidades.filter(m => m.mes_referencia === mes);
      const paid = mesMensalidades.filter(m => m.status === 'pago').length;
      const pending = mesMensalidades.filter(m => m.status !== 'pago' && m.status !== 'isento').length;
      
      statusMap[mes] = {
        total: mesMensalidades.length,
        pending,
        paid
      };
    });
    
    return statusMap;
  }, [mensalidades, currentMonth, nextMonth]);

  const getMonthlySummary = () => {
    const today = new Date();
    const months = [];
    
    const alunosPagantes = children.filter(c => 
      c.ativo && c.status_financeiro === 'ativo'
    );
    const previsaoReceita = alunosPagantes.reduce((acc, c) => 
      acc + Number(c.valor_mensalidade || 170), 0
    );
    
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
      const mesMensalidades = mensalidades.filter(m => m.mes_referencia === mesRef && m.status !== 'cancelado');
      
      const pagos = mesMensalidades.filter(m => m.status === 'pago');
      const pendentes = mesMensalidades.filter(m => m.status !== 'pago' && m.status !== 'isento');
      
      const periodLabel = i === -1 ? 'Mês Anterior' : i === 0 ? 'Mês Atual' : 'Próximo Mês';
      const isProjection = i === 1;
      
      const hasCobranças = mesMensalidades.length > 0;
      
      months.push({
        mes: mesRef,
        mesLabel: `${monthNames[month]}/${year}`,
        periodLabel,
        isProjection,
        qtdPagos: pagos.length,
        totalPago: pagos.reduce((acc, m) => acc + Number(m.valor_pago || m.valor), 0),
        qtdPendentes: pendentes.length,
        totalPendente: pendentes.reduce((acc, m) => acc + Number(m.valor), 0),
        totalAlunos: mesMensalidades.length,
        previsaoReceita: isProjection && !hasCobranças ? previsaoReceita : undefined,
        qtdAlunosPagantes: isProjection && !hasCobranças ? alunosPagantes.length : undefined
      });
    }
    
    return months;
  };

  const monthlySummary = getMonthlySummary();

  if (loadingMensalidades) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Report menu items
  const reportMenuItems: ReportMenuItem[] = [
    {
      id: 'dashboard',
      title: 'Dashboard',
      description: 'Resumo financeiro, gráficos de receita e crescimento de alunos',
      icon: <LayoutDashboard className="w-7 h-7" />,
      color: 'from-primary/15 to-primary/5 border-primary/30',
    },
    {
      id: 'cobrancas-mes',
      title: 'Cobranças por Mês',
      description: 'Visualize e gerencie cobranças de cada mês, gere PIX e acompanhe o status',
      icon: <ClipboardList className="w-7 h-7" />,
      color: 'from-blue-500/15 to-blue-500/5 border-blue-500/30',
    },
    {
      id: 'por-aluno',
      title: 'Histórico por Aluno',
      description: 'Consulte o histórico financeiro completo de cada aluno individualmente',
      icon: <User className="w-7 h-7" />,
      color: 'from-violet-500/15 to-violet-500/5 border-violet-500/30',
    },
    {
      id: 'todas',
      title: 'Todas as Mensalidades',
      description: 'Lista completa de mensalidades com filtros por status e período',
      icon: <List className="w-7 h-7" />,
      color: 'from-amber-500/15 to-amber-500/5 border-amber-500/30',
    },
    {
      id: 'relatorio',
      title: 'Relatório por Categoria',
      description: 'Receitas separadas por matrículas, uniformes e mensalidades',
      icon: <BarChart3 className="w-7 h-7" />,
      color: 'from-emerald-500/15 to-emerald-500/5 border-emerald-500/30',
    },
    {
      id: 'assinatura',
      title: 'Minha Assinatura',
      description: 'Informações do seu plano e cobranças da plataforma',
      icon: <Building2 className="w-7 h-7" />,
      color: 'from-rose-500/15 to-rose-500/5 border-rose-500/30',
    },
    {
      id: 'cadastro-bancario',
      title: 'Cadastro Bancário',
      description: 'Configure sua conta bancária para receber pagamentos via PIX',
      icon: <Landmark className="w-7 h-7" />,
      color: !isCadastroBancarioAprovado 
        ? 'from-destructive/15 to-destructive/5 border-destructive/30'
        : 'from-slate-500/15 to-slate-500/5 border-slate-500/30',
      badge: !isCadastroBancarioAprovado ? 'Pendente' : undefined,
    },
  ];

  const getViewTitle = (view: FinanceiroView): string => {
    const item = reportMenuItems.find(i => i.id === view);
    return item?.title || 'Financeiro';
  };

  // ─── RENDER REPORT MENU ───
  const renderReportMenu = () => (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Financeiro</h1>
        <p className="text-muted-foreground">Escolha o relatório ou área que deseja consultar</p>
      </div>

      {/* Quick stats bar */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
          <DollarSign className="w-5 h-5 text-emerald-600 shrink-0" />
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground truncate">Recebido</p>
            <p className="text-sm font-bold text-foreground truncate">
              R$ {totalRecebido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground truncate">Pendente</p>
            <p className="text-sm font-bold text-foreground truncate">
              R$ {totalPendente.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary border border-border/50">
          <Users className="w-5 h-5 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground truncate">Alunos Ativos</p>
            <p className="text-sm font-bold text-foreground">{alunosAtivos}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary border border-border/50">
          <Calendar className="w-5 h-5 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground truncate">Mês Atual</p>
            <p className="text-sm font-bold text-foreground">{mensalidadesMesAtual} cobranças</p>
          </div>
        </div>
      </div>

      {/* Report cards grid - tighter on desktop */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {reportMenuItems.map((item) => (
          <Card
            key={item.id}
            className={`bg-gradient-to-br ${item.color} cursor-pointer transition-all hover:scale-[1.02] hover:shadow-md active:scale-[0.98]`}
            onClick={() => setActiveView(item.id)}
          >
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-background/60 text-foreground shrink-0">
                  {item.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-foreground">{item.title}</h3>
                    {item.badge && (
                      <Badge variant="destructive" className="text-xs">
                        {item.badge}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    {item.description}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );

  // ─── RENDER DASHBOARD ───
  const renderDashboard = () => (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-gradient-to-br from-emerald-500/10 to-emerald-500/5">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-emerald-500/20">
                <DollarSign className="w-6 h-6 text-emerald-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Recebido</p>
                <p className="text-2xl font-bold text-foreground">
                  R$ {totalRecebido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-amber-500/10 to-amber-500/5">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-amber-500/20">
                <AlertCircle className="w-6 h-6 text-amber-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Pendente</p>
                <p className="text-2xl font-bold text-foreground">
                  R$ {totalPendente.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-secondary">
                <Users className="w-6 h-6 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total de Alunos</p>
                <p className="text-2xl font-bold text-foreground">{alunosAtivos}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-secondary">
                <Calendar className="w-6 h-6 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Mensalidades (Mês Atual)</p>
                <p className="text-2xl font-bold text-foreground">{mensalidadesMesAtual}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Monthly Summary */}
      {monthlySummary.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Resumo Mensal</CardTitle>
              <CardDescription>Mês anterior, mês atual e projeção do próximo mês</CardDescription>
            </div>
            <Button
              onClick={() => setGenerateBillingDialogOpen(true)}
              disabled={generateStudentBilling.isPending || !isCadastroBancarioAprovado}
              className="gap-2"
              title={!isCadastroBancarioAprovado ? 'Complete o cadastro bancário primeiro' : ''}
            >
              {generateStudentBilling.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              <span className="hidden sm:inline">Gerar Cobranças PIX</span>
              <span className="sm:hidden">Cobranças</span>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              {monthlySummary.map((mes) => (
                <div
                  key={mes.mes}
                  className={`p-4 rounded-lg border transition-all ${
                    mes.isProjection 
                      ? 'bg-blue-500/5 border-blue-500/20' 
                      : 'bg-secondary/30 border-border/50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-semibold text-foreground">{mes.mesLabel}</h4>
                    <Badge variant="outline" className={`text-xs ${
                      mes.isProjection ? 'bg-blue-500/10 text-blue-600 border-blue-500/20' : ''
                    }`}>
                      {mes.periodLabel}
                    </Badge>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        <span className="text-muted-foreground">Pagos</span>
                      </div>
                      <div className="text-right">
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                          {mes.qtdPagos} alunos
                        </Badge>
                        <p className="text-sm font-medium text-emerald-600 mt-1">
                          R$ {mes.totalPago.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm">
                        <AlertCircle className="w-4 h-4 text-amber-500" />
                        <span className="text-muted-foreground">Pendentes</span>
                      </div>
                      <div className="text-right">
                        <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20">
                          {mes.qtdPendentes} alunos
                        </Badge>
                        <p className="text-sm font-medium text-amber-600 mt-1">
                          R$ {mes.totalPendente.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                    </div>
                    {mes.totalAlunos === 0 && mes.isProjection && (
                      <div className="pt-2 border-t border-border/50 mt-2">
                        {(mes as any).previsaoReceita ? (
                          <div className="text-center space-y-1">
                            <p className="text-xs text-muted-foreground">
                              Previsão baseada em {(mes as any).qtdAlunosPagantes} alunos pagantes
                            </p>
                            <p className="text-sm font-semibold text-blue-600">
                              Receita estimada: R$ {((mes as any).previsaoReceita as number).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </p>
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground italic text-center">
                            Cobranças ainda não geradas
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Growth Charts */}
      {growthData.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary" />
                <CardTitle className="text-base">Evolução da Receita</CardTitle>
              </div>
              <CardDescription>Receita mensal dos últimos 6 meses</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={growthData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="mesLabel" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(v) => `R$${v}`} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                      formatter={(value: number) => [`R$ ${value.toFixed(2)}`, 'Receita']}
                    />
                    <Bar dataKey="receita" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                <CardTitle className="text-base">Crescimento de Alunos</CardTitle>
              </div>
              <CardDescription>Total de alunos nos últimos 6 meses</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={growthData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="mesLabel" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                      formatter={(value: number) => [value, 'Alunos']}
                    />
                    <Line
                      type="monotone"
                      dataKey="alunos"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={{ fill: 'hsl(var(--primary))', strokeWidth: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );

  // ─── RENDER TODAS MENSALIDADES ───
  const renderTodasMensalidades = () => (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <CardTitle>Mensalidades</CardTitle>
            <CardDescription>Lista detalhada de todas as mensalidades</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 sm:w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar aluno..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pago">Pago</SelectItem>
                <SelectItem value="a_vencer">A Vencer</SelectItem>
                <SelectItem value="atrasado">Atrasado</SelectItem>
                <SelectItem value="isento">Isento</SelectItem>
                <SelectItem value="cancelado">Cancelado</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterMonth} onValueChange={setFilterMonth}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Mês" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os meses</SelectItem>
                {uniqueMonths.map(mes => (
                  <SelectItem key={mes} value={mes}>
                    {formatMesReferencia(mes)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {filteredMensalidades.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Nenhuma mensalidade encontrada.
          </div>
        ) : (
          <div className="space-y-3">
            {filteredMensalidades.map((mensalidade) => (
              <div
                key={mensalidade.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-lg bg-secondary/30 gap-3"
              >
                <div>
                  <h3
                    className="font-semibold text-foreground hover:text-primary hover:underline transition-colors cursor-pointer"
                    onClick={() => {
                      const child = children.find(c => c.id === mensalidade.crianca_id);
                      if (child) openEditDialog(child as any, user?.escolinhaId, 'financeiro');
                    }}
                  >
                    {mensalidade.crianca_nome}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {formatMesReferencia(mensalidade.mes_referencia)} • Venc: {format(parseLocalDate(mensalidade.data_vencimento), 'dd/MM/yyyy')}
                  </p>
                  {mensalidade.observacoes && (
                    <p className="text-xs text-muted-foreground mt-1 italic">{mensalidade.observacoes}</p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="font-bold text-foreground">
                      R$ {Number(mensalidade.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                    {mensalidade.data_pagamento && (
                      <p className="text-xs text-muted-foreground">
                        Pago em {format(new Date(mensalidade.data_pagamento), 'dd/MM/yyyy')}
                      </p>
                    )}
                  </div>
                  <Badge
                    className={
                      mensalidade.status === 'pago'
                        ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                        : mensalidade.status === 'atrasado'
                          ? 'bg-destructive/10 text-destructive border-destructive/20'
                          : mensalidade.status === 'isento'
                            ? 'bg-blue-500/10 text-blue-600 border-blue-500/20'
                            : mensalidade.status === 'cancelado'
                              ? 'bg-muted text-muted-foreground border-muted'
                              : 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                    }
                  >
                    {mensalidade.status === 'pago' ? 'Pago' : 
                     mensalidade.status === 'atrasado' ? 'Atrasado' : 
                     mensalidade.status === 'isento' ? 'Isento' : 
                     mensalidade.status === 'cancelado' ? 'Cancelado' : 'Pendente'}
                  </Badge>
                  
                  {mensalidade.status !== 'pago' && mensalidade.status !== 'isento' && mensalidade.status !== 'cancelado' && (
                    <div className="flex gap-1">
                      {mensalidade.asaas_pix_url && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 px-2 gap-1"
                          asChild
                        >
                          <a 
                            href={mensalidade.asaas_pix_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            title="Abrir link de pagamento PIX"
                          >
                            <ExternalLink className="w-4 h-4" />
                            <span className="hidden sm:inline">PIX</span>
                          </a>
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 px-2"
                        onClick={() => openActionDialog(mensalidade, 'pagar')}
                        title="Marcar como Pago"
                      >
                        <CreditCard className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 px-2"
                        onClick={() => openActionDialog(mensalidade, 'isentar')}
                        title="Marcar como Isento"
                      >
                        <Ban className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );

  // ─── RENDER ASSINATURA ───
  const renderAssinatura = () => (
    <div className="space-y-6">
      <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-primary" />
            <CardTitle>Minha Assinatura</CardTitle>
          </div>
          <CardDescription>Informações do seu plano e cobranças da plataforma</CardDescription>
        </CardHeader>
        <CardContent>
          {escolinhaFinanceiro ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="p-4 rounded-lg bg-background/50 border border-border/50">
                <p className="text-sm text-muted-foreground mb-1">Plano Atual</p>
                <p className="text-xl font-bold text-foreground">
                  {(escolinhaFinanceiro.plano as any)?.nome || 'Não definido'}
                </p>
              </div>
              <div className="p-4 rounded-lg bg-background/50 border border-border/50">
                <p className="text-sm text-muted-foreground mb-1">Valor Mensal</p>
                <p className="text-xl font-bold text-foreground">
                  R$ {(escolinhaFinanceiro.valor_mensal || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div className="p-4 rounded-lg bg-background/50 border border-border/50">
                <p className="text-sm text-muted-foreground mb-1">Status</p>
                <Badge className={
                  escolinhaFinanceiro.status === 'em_dia' 
                    ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                    : escolinhaFinanceiro.status === 'atrasado'
                      ? 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                      : 'bg-destructive/10 text-destructive border-destructive/20'
                }>
                  {escolinhaFinanceiro.status === 'em_dia' ? 'Em Dia' : 
                   escolinhaFinanceiro.status === 'atrasado' ? 'Atrasado' : 'Suspenso'}
                </Badge>
              </div>
            </div>
          ) : (
            <div className="text-center py-4 text-muted-foreground">
              <p>Nenhuma informação de assinatura encontrada.</p>
              <p className="text-sm mt-1">Entre em contato com o administrador.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Billing History */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-primary" />
            <CardTitle>Histórico de Cobranças</CardTitle>
          </div>
          <CardDescription>Suas faturas e pagamentos via PIX</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingHistorico ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : historicoSaas.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CreditCard className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Nenhuma cobrança encontrada.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {historicoSaas.map((cobranca) => {
                const mesDate = parseISO(cobranca.mes_referencia);
                const mesLabel = `${monthNames[mesDate.getMonth() + 1]} ${mesDate.getFullYear()}`;
                
                return (
                  <div
                    key={cobranca.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-lg bg-secondary/30 gap-3"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10">
                        <Calendar className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-foreground">{mesLabel}</h4>
                        <p className="text-sm text-muted-foreground">
                          {cobranca.data_vencimento 
                            ? `Vencimento: ${format(parseLocalDate(cobranca.data_vencimento), 'dd/MM/yyyy', { locale: ptBR })}`
                            : 'Sem vencimento definido'
                          }
                        </p>
                        {cobranca.data_pagamento && (
                          <p className="text-xs text-emerald-600">
                            Pago em {format(parseLocalDate(cobranca.data_pagamento), 'dd/MM/yyyy', { locale: ptBR })}
                          </p>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="font-bold text-foreground">
                          R$ {Number(cobranca.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </p>
                        {(cobranca.plano as any)?.nome && (
                          <p className="text-xs text-muted-foreground">{(cobranca.plano as any).nome}</p>
                        )}
                      </div>
                      
                      <Badge className={statusCobrancaColors[cobranca.status] || ''}>
                        {statusCobrancaLabels[cobranca.status] || cobranca.status}
                      </Badge>

                      {cobranca.status === 'pendente' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-2"
                          onClick={() => {
                            setSelectedCobranca(cobranca);
                            setPixCheckoutOpen(true);
                          }}
                        >
                          <CreditCard className="w-4 h-4" />
                          Pagar PIX
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );

  // ─── RENDER ACTIVE VIEW CONTENT ───
  const renderViewContent = () => {
    switch (activeView) {
      case 'dashboard':
        return renderDashboard();
      case 'por-aluno':
        return (
          <AlunoFinanceiroHistorico
            mensalidades={mensalidades}
            onMarkAsPaid={(m) => openActionDialog(m, 'pagar')}
            onMarkAsExempt={(m) => openActionDialog(m, 'isentar')}
          />
        );
      case 'todas':
        return renderTodasMensalidades();
      case 'cobrancas-mes':
        return <MonthlyBillingReport />;
      case 'relatorio':
        return <FinancialReportSection />;
      case 'assinatura':
        return renderAssinatura();
      case 'cadastro-bancario':
        return <CadastroBancarioForm />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {activeView === 'menu' ? (
        renderReportMenu()
      ) : (
        <>
          {/* Header with back button */}
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setActiveView('menu')}
              className="gap-2 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Voltar</span>
            </Button>
            <div className="h-6 w-px bg-border" />
            <div>
              <h1 className="text-xl font-bold text-foreground">{getViewTitle(activeView)}</h1>
            </div>
          </div>

          {renderViewContent()}
        </>
      )}

      {/* Action Dialog */}
      <MensalidadeActionsDialog
        open={actionDialogOpen}
        onOpenChange={setActionDialogOpen}
        mensalidade={selectedMensalidade}
        action={actionType}
        onConfirm={handleActionConfirm}
        isLoading={updateMensalidade.isPending}
      />

      {/* PIX Checkout Dialog */}
      {selectedCobranca && (
        <PixCheckoutDialog
          open={pixCheckoutOpen}
          onOpenChange={setPixCheckoutOpen}
          cobrancaId={selectedCobranca.id}
          valor={selectedCobranca.valor}
          mesReferencia={selectedCobranca.mes_referencia}
          onPaymentConfirmed={() => {
            queryClient.invalidateQueries({ queryKey: ['escola-historico-saas'] });
            queryClient.invalidateQueries({ queryKey: ['escola-financeiro'] });
          }}
        />
      )}

      {/* Generate Billing Dialog */}
      <GenerateBillingDialog
        open={generateBillingDialogOpen}
        onOpenChange={setGenerateBillingDialogOpen}
        onConfirm={handleGenerateBilling}
        isLoading={generateStudentBilling.isPending}
        billingStatusByMonth={billingStatusByMonth}
      />
    </div>
  );
};

export default SchoolFinanceiroPage;
