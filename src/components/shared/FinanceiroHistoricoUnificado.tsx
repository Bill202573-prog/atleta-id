import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  History,
  Trash2,
  CheckCircle2,
  Clock,
  AlertCircle,
  Receipt,
  Loader2,
  School,
  QrCode,
  CreditCard,
  Ban,
  Swords,
  Trophy,
  GraduationCap,
  Shirt,
  ShoppingBag,
  RefreshCw
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { logAdminAction } from '@/contexts/AdminSchoolContext';
import MensalidadeActionsDialog from '@/components/school/MensalidadeActionsDialog';

interface FinanceiroHistoricoUnificadoProps {
  criancaId: string;
  canDelete?: boolean;
  responsavelId?: string;
  childName?: string;
  escolinhaId?: string;
}

interface MensalidadeItem {
  id: string;
  tipo: 'mensalidade';
  descricao: string;
  valor: number;
  data_vencimento: string;
  data_pagamento: string | null;
  status: string;
  escolinha_nome: string | null;
  sortDate: string;
  asaas_pix_url: string | null;
  asaas_payment_id: string | null;
}

interface EventoItem {
  id: string;
  tipo: 'amistoso' | 'campeonato';
  descricao: string;
  valor: number | null;
  data_evento: string;
  data_pagamento: string | null;
  status: string;
  escolinha_nome: string | null;
  isento: boolean;
  sortDate: string;
  taxa_participacao?: number | null;
  taxa_juiz?: number | null;
  cobrar_taxa_participacao?: boolean;
  cobrar_taxa_juiz?: boolean;
}

interface MatriculaItem {
  id: string;
  tipo: 'matricula';
  descricao: string;
  valor_total: number;
  valor_matricula: number;
  valor_uniforme: number;
  valor_mensalidade: number;
  data_criacao: string;
  data_pagamento: string | null;
  status: string;
  escolinha_nome: string | null;
  sortDate: string;
}

interface PedidoLojaItem {
  id: string;
  tipo: 'pedido_loja';
  descricao: string;
  numero_pedido: number | null;
  valor: number;
  data_criacao: string;
  data_pagamento: string | null;
  status: string;
  escolinha_nome: string | null;
  sortDate: string;
}

type FinanceiroItem = MensalidadeItem | EventoItem | MatriculaItem | PedidoLojaItem;

const monthNames = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const formatMesReferencia = (mes: string) => {
  const [year, month] = mes.split('-');
  return `${monthNames[parseInt(month)]}/${year}`;
};

const getTipoIcon = (tipo: string) => {
  switch (tipo) {
    case 'mensalidade': return <CreditCard className="w-4 h-4 text-primary" />;
    case 'amistoso': return <Swords className="w-4 h-4 text-orange-500" />;
    case 'campeonato': return <Trophy className="w-4 h-4 text-amber-500" />;
    case 'matricula': return <GraduationCap className="w-4 h-4 text-primary" />;
    case 'pedido_loja': return <ShoppingBag className="w-4 h-4 text-violet-500" />;
    default: return <Receipt className="w-4 h-4 text-muted-foreground" />;
  }
};

const getTipoBadge = (tipo: string) => {
  const labels: Record<string, string> = {
    mensalidade: 'Mensalidade',
    amistoso: 'Amistoso',
    campeonato: 'Campeonato',
    matricula: 'Matrícula',
    pedido_loja: 'Loja',
  };
  return <Badge variant="outline" className="text-[10px] px-1.5 py-0">{labels[tipo] || tipo}</Badge>;
};

const getStatusBadge = (status: string, isento?: boolean) => {
  if (isento) return <Badge variant="secondary" className="text-xs">Isento</Badge>;
  const s = status?.toLowerCase();
  if (s === 'pago' || s === 'confirmado') return <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-xs">Pago</Badge>;
  if (s === 'atrasado') return <Badge className="bg-destructive/10 text-destructive border-destructive/20 text-xs">Atrasado</Badge>;
  if (s === 'recusado' || s === 'cancelado') return <Badge variant="secondary" className="text-xs">{s === 'recusado' ? 'Recusado' : 'Cancelado'}</Badge>;
  if (s === 'isento') return <Badge variant="secondary" className="text-xs">Isento</Badge>;
  return <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20 text-xs">Pendente</Badge>;
};

const getItemDisplayValue = (item: FinanceiroItem): number | null => {
  if (item.tipo === 'matricula') {
    return (item as MatriculaItem).valor_total;
  }
  if (item.tipo === 'mensalidade') {
    return item.valor;
  }
  if (item.tipo === 'pedido_loja') {
    return (item as PedidoLojaItem).valor;
  }
  return (item as EventoItem).valor;
};

const FinanceiroHistoricoUnificado = ({ criancaId, canDelete = false, responsavelId, childName, escolinhaId }: FinanceiroHistoricoUnificadoProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<FinanceiroItem | null>(null);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  
  // Action dialog state for baixa/isentar
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [selectedMensalidade, setSelectedMensalidade] = useState<MensalidadeItem | null>(null);
  const [actionType, setActionType] = useState<'pagar' | 'isentar' | null>(null);
  
  const scopedEscolinhaId = escolinhaId || (canDelete ? user?.escolinhaId : undefined);

  // Fetch all financial items for the child
  const { data: items = [], isLoading } = useQuery({
    queryKey: ['financeiro-historico-unificado', criancaId, responsavelId, scopedEscolinhaId],
    queryFn: async () => {
      // Fetch mensalidades - now includes asaas fields
      let mensalidadesQuery = supabase
        .from('mensalidades')
        .select(`
          id,
          mes_referencia,
          valor,
          data_vencimento,
          data_pagamento,
          status,
          escolinha_id,
          asaas_pix_url,
          asaas_payment_id,
          escolinha:escolinhas!mensalidades_escolinha_id_fkey(nome)
        `)
        .eq('crianca_id', criancaId)
        .neq('status', 'cancelado');
      
      if (scopedEscolinhaId) {
        mensalidadesQuery = mensalidadesQuery.eq('escolinha_id', scopedEscolinhaId);
      }
      
      const { data: mensalidades, error: mensalidadesError } = await mensalidadesQuery
        .order('mes_referencia', { ascending: false });

      if (mensalidadesError) throw mensalidadesError;

      // Fetch amistoso convocacoes
      let amistososQuery = supabase
        .from('amistoso_convocacoes')
        .select(`
          id,
          status,
          valor,
          data_pagamento,
          isento,
          evento:eventos_esportivos!amistoso_convocacoes_evento_id_fkey!inner(
            nome,
            data,
            adversario,
            escolinha_id,
            taxa_participacao,
            taxa_juiz,
            cobrar_taxa_participacao,
            cobrar_taxa_juiz,
            escolinha:escolinhas!eventos_esportivos_escolinha_id_fkey(nome)
          )
        `)
        .eq('crianca_id', criancaId);

      if (scopedEscolinhaId) {
        amistososQuery = amistososQuery.eq('evento.escolinha_id', scopedEscolinhaId);
      }

      const { data: amistosos, error: amistososError } = await amistososQuery
        .order('created_at', { ascending: false });

      if (amistososError) throw amistososError;

      // Fetch cobrancas_entrada
      let matriculasQuery = supabase
        .from('cobrancas_entrada')
        .select(`
          id,
          valor_total,
          valor_matricula,
          valor_uniforme,
          valor_mensalidade,
          status,
          data_pagamento,
          created_at,
          escolinha_id,
          escolinha:escolinhas!cobrancas_entrada_escolinha_id_fkey(nome)
        `)
        .eq('crianca_id', criancaId)
        .eq('status', 'pago');

      if (scopedEscolinhaId) {
        matriculasQuery = matriculasQuery.eq('escolinha_id', scopedEscolinhaId);
      }

      const { data: matriculas, error: matriculasError } = await matriculasQuery
        .order('created_at', { ascending: false });

      if (matriculasError) throw matriculasError;

      // Fetch pedidos da loja
      let pedidosQuery = supabase
        .from('pedidos_loja')
        .select(`
          id,
          numero_pedido,
          valor_total,
          status,
          data_pagamento,
          created_at,
          escolinha_id,
          escolinha:escolinhas!pedidos_loja_escolinha_id_fkey(nome)
        `)
        .eq('crianca_id', criancaId);

      if (responsavelId) {
        pedidosQuery = pedidosQuery.eq('responsavel_id', responsavelId);
      }
      if (scopedEscolinhaId) {
        pedidosQuery = pedidosQuery.eq('escolinha_id', scopedEscolinhaId);
      }

      const { data: pedidos, error: pedidosError } = await pedidosQuery
        .order('created_at', { ascending: false });

      if (pedidosError) throw pedidosError;

      // Transform mensalidades
      const mensalidadeItems: MensalidadeItem[] = (mensalidades || []).map(m => ({
        id: m.id,
        tipo: 'mensalidade' as const,
        descricao: formatMesReferencia(m.mes_referencia),
        valor: m.valor,
        data_vencimento: m.data_vencimento,
        data_pagamento: m.data_pagamento,
        status: m.status,
        escolinha_nome: (m.escolinha as any)?.nome || null,
        sortDate: m.mes_referencia,
        asaas_pix_url: m.asaas_pix_url,
        asaas_payment_id: m.asaas_payment_id,
      }));

      // Transform amistosos
      const amistosoItems: EventoItem[] = (amistosos || []).filter(a => a.evento).map(a => {
        const evento = a.evento as any;
        const adversario = evento?.adversario ? ` vs ${evento.adversario}` : '';
        return {
          id: a.id,
          tipo: 'amistoso' as const,
          descricao: `${evento?.nome || 'Amistoso'}${adversario}`,
          valor: a.valor,
          data_evento: evento?.data,
          data_pagamento: a.data_pagamento,
          status: a.status,
          escolinha_nome: evento?.escolinha?.nome || null,
          isento: a.isento || false,
          sortDate: evento?.data || a.data_pagamento || '',
          taxa_participacao: evento?.taxa_participacao,
          taxa_juiz: evento?.taxa_juiz,
          cobrar_taxa_participacao: evento?.cobrar_taxa_participacao,
          cobrar_taxa_juiz: evento?.cobrar_taxa_juiz,
        };
      });

      // Transform matriculas
      const matriculaItems: MatriculaItem[] = (matriculas || []).map(m => ({
        id: m.id,
        tipo: 'matricula' as const,
        descricao: 'Matrícula + Uniforme',
        valor_total: m.valor_total,
        valor_matricula: m.valor_matricula,
        valor_uniforme: m.valor_uniforme,
        valor_mensalidade: m.valor_mensalidade,
        data_criacao: m.created_at,
        data_pagamento: m.data_pagamento,
        status: m.status,
        escolinha_nome: (m.escolinha as any)?.nome || null,
        sortDate: m.created_at,
      }));

      // Transform pedidos da loja
      const pedidoItems: PedidoLojaItem[] = (pedidos || []).map(p => ({
        id: p.id,
        tipo: 'pedido_loja' as const,
        descricao: `Pedido Loja #${p.numero_pedido || p.id.slice(0, 8)}`,
        numero_pedido: p.numero_pedido,
        valor: p.valor_total,
        data_criacao: p.created_at,
        data_pagamento: p.data_pagamento,
        status: p.status,
        escolinha_nome: (p.escolinha as any)?.nome || null,
        sortDate: p.created_at,
      }));

      // Combine and sort
      const allItems: FinanceiroItem[] = [...mensalidadeItems, ...amistosoItems, ...matriculaItems, ...pedidoItems];
      allItems.sort((a, b) => b.sortDate.localeCompare(a.sortDate));

      return allItems;
    },
    enabled: !!criancaId,
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (item: FinanceiroItem) => {
      if (item.tipo === 'mensalidade') {
        const { data, error } = await supabase.functions.invoke('cancel-mensalidade-payment', {
          body: { mensalidadeId: item.id },
        });
        if (error) throw error;
        if (!data.success) throw new Error(data.error || 'Erro ao cancelar cobrança');
      } else if (item.tipo === 'amistoso') {
        const { data, error } = await supabase.functions.invoke('cancel-amistoso-payment', {
          body: { convocacaoId: item.id },
        });
        if (error) throw error;
        if (!data.success) throw new Error(data.error || 'Erro ao cancelar cobrança');
      }
    },
    onSuccess: (_, item) => {
      toast.success('Registro cancelado com sucesso');
      if (user?.id && user?.escolinhaId) {
        logAdminAction(user.id, user.escolinhaId, 'cancelar_cobranca_ficha', {
          tipo: item.tipo,
          id: item.id,
          descricao: item.descricao,
        });
      }
      queryClient.invalidateQueries({ queryKey: ['financeiro-historico-unificado', criancaId] });
      queryClient.invalidateQueries({ queryKey: ['mensalidades-historico', criancaId] });
      queryClient.invalidateQueries({ queryKey: ['guardian-mensalidades', criancaId] });
      queryClient.invalidateQueries({ queryKey: ['school-mensalidades-detail'] });
      queryClient.invalidateQueries({ queryKey: ['school-mensalidades-month-report'] });
      queryClient.invalidateQueries({ queryKey: ['guardian-amistoso-convocacoes'] });
      setDeleteDialogOpen(false);
      setItemToDelete(null);
    },
    onError: (error: Error) => {
      toast.error('Erro ao cancelar registro: ' + error.message);
    },
  });

  // Regenerate PIX mutation
  const regeneratePixMutation = useMutation({
    mutationFn: async (mensalidadeId: string) => {
      setRegeneratingId(mensalidadeId);
      const { data, error } = await supabase.functions.invoke('generate-mensalidade-pix', {
        body: { mensalidade_id: mensalidadeId },
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Erro ao gerar PIX');
      return data;
    },
    onSuccess: (_, mensalidadeId) => {
      toast.success('PIX gerado com sucesso!');
      if (user?.id && user?.escolinhaId) {
        logAdminAction(user.id, user.escolinhaId, 'regenerar_pix_ficha', { mensalidade_id: mensalidadeId });
      }
      queryClient.invalidateQueries({ queryKey: ['financeiro-historico-unificado', criancaId] });
      queryClient.invalidateQueries({ queryKey: ['school-mensalidades-detail'] });
      queryClient.invalidateQueries({ queryKey: ['school-mensalidades-month-report'] });
      setRegeneratingId(null);
    },
    onError: (error: Error) => {
      toast.error('Erro ao gerar PIX: ' + error.message);
      setRegeneratingId(null);
    },
  });

  // Update mensalidade mutation (baixa manual / isentar)
  const updateMutation = useMutation({
    mutationFn: async ({ id, status, dataPagamento, valorPago, observacao }: {
      id: string; status: string; dataPagamento?: string; valorPago?: number; observacao?: string;
    }) => {
      if (status === 'pago') {
        const m = items.find(x => x.id === id && x.tipo === 'mensalidade') as MensalidadeItem | undefined;
        if (m?.asaas_payment_id) {
          try { await supabase.functions.invoke('cancel-asaas-payment-only', { body: { mensalidadeId: id } }); }
          catch (e) { console.warn('Could not cancel Asaas payment:', e); }
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
      if (observacao) updateData.observacoes = observacao;

      const { error } = await supabase.from('mensalidades').update(updateData).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      toast.success(variables.status === 'pago' ? 'Baixa realizada com sucesso!' : 'Mensalidade marcada como isenta');
      if (user?.id && user?.escolinhaId) {
        logAdminAction(user.id, user.escolinhaId, variables.status === 'pago' ? 'baixa_manual_ficha' : 'isentar_ficha', {
          mensalidade_id: variables.id,
        });
      }
      queryClient.invalidateQueries({ queryKey: ['financeiro-historico-unificado', criancaId] });
      queryClient.invalidateQueries({ queryKey: ['school-mensalidades-detail'] });
      queryClient.invalidateQueries({ queryKey: ['school-mensalidades-month-report'] });
      queryClient.invalidateQueries({ queryKey: ['school-growth-data'] });
      setActionDialogOpen(false);
      setSelectedMensalidade(null);
      setActionType(null);
    },
    onError: (error: Error) => {
      toast.error('Erro: ' + error.message);
    },
  });

  const handleDeleteClick = (item: FinanceiroItem) => {
    setItemToDelete(item);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (itemToDelete) {
      deleteMutation.mutate(itemToDelete);
    }
  };

  const openAction = (mensalidade: MensalidadeItem, action: 'pagar' | 'isentar') => {
    setSelectedMensalidade(mensalidade);
    setActionType(action);
    setActionDialogOpen(true);
  };

  const handleActionConfirm = async (data: { dataPagamento?: string; valorPago?: number; observacao?: string }) => {
    if (!selectedMensalidade || !actionType) return;
    await updateMutation.mutateAsync({
      id: selectedMensalidade.id,
      status: actionType === 'pagar' ? 'pago' : 'isento',
      dataPagamento: data.dataPagamento,
      valorPago: data.valorPago,
      observacao: data.observacao,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center text-muted-foreground">
            <Receipt className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>Nenhum registro financeiro encontrado</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-primary/10">
              <History className="w-4 h-4 text-primary" />
            </div>
            {childName ? `Histórico - ${childName.split(' ')[0]}` : 'Histórico Financeiro'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {items.map((item) => {
            const isEvento = item.tipo === 'amistoso' || item.tipo === 'campeonato';
            const isMatricula = item.tipo === 'matricula';
            const isMensalidade = item.tipo === 'mensalidade';
            const isPedidoLoja = item.tipo === 'pedido_loja';
            
            const eventoItem = isEvento ? item as EventoItem : null;
            const mensalidadeItem = isMensalidade ? item as MensalidadeItem : null;
            const matriculaItem = isMatricula ? item as MatriculaItem : null;
            const pedidoLojaItem = isPedidoLoja ? item as PedidoLojaItem : null;
            
            const isPago = item.status?.toLowerCase() === 'pago' || item.status?.toLowerCase() === 'confirmado';
            const isRecusado = item.status?.toLowerCase() === 'recusado';
            const isIsento = item.status?.toLowerCase() === 'isento';
            const isPendente = !isPago && !isRecusado && !isIsento && item.status?.toLowerCase() !== 'cancelado';
            const displayValue = getItemDisplayValue(item);
            
            return (
              <div
                key={`${item.tipo}-${item.id}`}
                className={`p-3 rounded-xl border bg-card shadow-sm transition-colors ${isRecusado ? 'opacity-60' : ''}`}
              >
                {/* Top row: icon + description + value */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className={`p-2 rounded-lg shrink-0 ${
                      isPago
                        ? 'bg-emerald-500/10'
                        : isRecusado
                        ? 'bg-muted'
                        : item.status?.toLowerCase() === 'atrasado'
                        ? 'bg-destructive/10'
                        : 'bg-primary/10'
                    }`}>
                      {isPago ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      ) : isRecusado ? (
                        <Ban className="w-4 h-4 text-muted-foreground" />
                      ) : item.status?.toLowerCase() === 'atrasado' ? (
                        <AlertCircle className="w-4 h-4 text-destructive" />
                      ) : (
                        getTipoIcon(item.tipo)
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm text-foreground leading-tight">
                        {item.descricao}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1">
                        {getTipoBadge(item.tipo)}
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    {displayValue !== null && displayValue > 0 ? (
                      <p className="font-bold text-base text-foreground">
                        R$ {displayValue.toFixed(2).replace('.', ',')}
                      </p>
                    ) : eventoItem?.isento ? (
                      <p className="text-sm text-muted-foreground">—</p>
                    ) : null}
                  </div>
                </div>

                {/* Bottom row: date + school + status + actions */}
                <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-border/40">
                  <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                    {mensalidadeItem && (
                      <span>Venc: {format(parseISO(mensalidadeItem.data_vencimento), "dd/MM/yyyy")}</span>
                    )}
                    {eventoItem && eventoItem.data_evento && (
                      <span>Data: {format(parseISO(eventoItem.data_evento), "dd/MM/yyyy")}</span>
                    )}
                    {matriculaItem && (
                      <span>{format(parseISO(matriculaItem.data_criacao), "dd/MM/yyyy")}</span>
                    )}
                    {pedidoLojaItem && (
                      <span>{format(parseISO(pedidoLojaItem.data_criacao), "dd/MM/yyyy")}</span>
                    )}
                    {item.data_pagamento && (
                      <span className="text-emerald-600">Pago em {format(parseISO(item.data_pagamento), "dd/MM/yyyy")}</span>
                    )}
                    {item.escolinha_nome && (
                      <span className="flex items-center gap-1">
                        <School className="w-3 h-3" />
                        {item.escolinha_nome}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {getStatusBadge(item.status, eventoItem?.isento)}
                    {canDelete && item.tipo !== 'matricula' && item.tipo !== 'pedido_loja' && !isPago && !isIsento && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleDeleteClick(item)}
                        title="Cancelar registro"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Action buttons for mensalidades - same as MonthlyBillingReport */}
                {canDelete && isMensalidade && mensalidadeItem && isPendente && (
                  <div className="flex items-center gap-1 justify-end mt-2 pt-2 border-t border-border/30">
                    {/* QR Code / PIX link */}
                    {mensalidadeItem.asaas_pix_url && (
                      <Button size="sm" variant="outline" className="h-8 w-8 p-0" asChild>
                        <a
                          href={mensalidadeItem.asaas_pix_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Abrir link PIX"
                        >
                          <QrCode className="w-3.5 h-3.5" />
                        </a>
                      </Button>
                    )}
                    {/* Regenerate PIX */}
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 w-8 p-0"
                      onClick={() => regeneratePixMutation.mutate(mensalidadeItem.id)}
                      disabled={regeneratingId === mensalidadeItem.id}
                      title={mensalidadeItem.asaas_pix_url ? "Regenerar PIX" : "Gerar PIX"}
                    >
                      {regeneratingId === mensalidadeItem.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5" />
                      )}
                    </Button>
                    {/* Mark as paid */}
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 w-8 p-0"
                      onClick={() => openAction(mensalidadeItem, 'pagar')}
                      title="Dar baixa manual"
                    >
                      <CreditCard className="w-3.5 h-3.5" />
                    </Button>
                    {/* Mark as exempt */}
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 w-8 p-0"
                      onClick={() => openAction(mensalidadeItem, 'isentar')}
                      title="Marcar como Isento"
                    >
                      <Ban className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                )}
                
                {/* Enrollment breakdown */}
                {matriculaItem && isPago && (
                  <div className="mt-3 pt-3 border-t border-dashed space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Detalhamento:</p>
                    <div className="grid grid-cols-1 gap-1.5 text-xs">
                      {matriculaItem.valor_matricula > 0 && (
                        <div className="flex items-center justify-between bg-background/50 px-2 py-1.5 rounded">
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            <GraduationCap className="w-3 h-3" />
                            Taxa de Matrícula
                          </span>
                          <span className="font-medium">R$ {matriculaItem.valor_matricula.toFixed(2).replace('.', ',')}</span>
                        </div>
                      )}
                      {matriculaItem.valor_uniforme > 0 && (
                        <div className="flex items-center justify-between bg-background/50 px-2 py-1.5 rounded">
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            <Shirt className="w-3 h-3" />
                            Uniforme
                          </span>
                          <span className="font-medium">R$ {matriculaItem.valor_uniforme.toFixed(2).replace('.', ',')}</span>
                        </div>
                      )}
                      {matriculaItem.valor_mensalidade > 0 && (
                        <div className="flex items-center justify-between bg-background/50 px-2 py-1.5 rounded">
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            <CreditCard className="w-3 h-3" />
                            1ª Mensalidade
                          </span>
                          <span className="font-medium">R$ {matriculaItem.valor_mensalidade.toFixed(2).replace('.', ',')}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Amistoso tax breakdown */}
                {eventoItem && eventoItem.tipo === 'amistoso' && !eventoItem.isento && eventoItem.valor && eventoItem.valor > 0 && (
                  (eventoItem.cobrar_taxa_participacao || eventoItem.cobrar_taxa_juiz) && (
                    <div className="mt-3 pt-3 border-t border-dashed space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground mb-2">Detalhamento:</p>
                      <div className="grid grid-cols-1 gap-1.5 text-xs">
                        {eventoItem.cobrar_taxa_participacao && eventoItem.taxa_participacao && eventoItem.taxa_participacao > 0 && (
                          <div className="flex items-center justify-between bg-background/50 px-2 py-1.5 rounded">
                            <span className="flex items-center gap-1.5 text-muted-foreground">
                              <Swords className="w-3 h-3" />
                              Participação
                            </span>
                            <span className="font-medium">R$ {eventoItem.taxa_participacao.toFixed(2).replace('.', ',')}</span>
                          </div>
                        )}
                        {eventoItem.cobrar_taxa_juiz && eventoItem.taxa_juiz && eventoItem.taxa_juiz > 0 && (
                          <div className="flex items-center justify-between bg-background/50 px-2 py-1.5 rounded">
                            <span className="flex items-center gap-1.5 text-muted-foreground">
                              <Receipt className="w-3 h-3" />
                              Arbitragem
                            </span>
                            <span className="font-medium">R$ {eventoItem.taxa_juiz.toFixed(2).replace('.', ',')}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="z-[200]">
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar Registro</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja cancelar o registro{' '}
              <strong>{itemToDelete?.descricao}</strong>
              {(() => {
                const value = itemToDelete ? getItemDisplayValue(itemToDelete) : null;
                return value && value > 0 ? (
                  <>
                    {' '}no valor de{' '}
                    <strong>R$ {value.toFixed(2).replace('.', ',')}</strong>
                  </>
                ) : null;
              })()}?
              <br /><br />
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Excluindo...
                </>
              ) : (
                'Confirmar'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Action Dialog for baixa/isentar */}
      {canDelete && (
        <MensalidadeActionsDialog
          open={actionDialogOpen}
          onOpenChange={setActionDialogOpen}
          mensalidade={selectedMensalidade ? {
            id: selectedMensalidade.id,
            crianca_nome: childName || '',
            mes_referencia: selectedMensalidade.sortDate,
            valor: selectedMensalidade.valor,
            status: selectedMensalidade.status,
            asaas_payment_id: selectedMensalidade.asaas_payment_id,
          } : null}
          action={actionType}
          onConfirm={handleActionConfirm}
          isLoading={updateMutation.isPending}
        />
      )}
    </>
  );
};

export default FinanceiroHistoricoUnificado;
