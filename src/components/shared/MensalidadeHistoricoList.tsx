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
  RefreshCw,
  ExternalLink
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { logAdminAction } from '@/contexts/AdminSchoolContext';
import MensalidadeActionsDialog from '@/components/school/MensalidadeActionsDialog';

interface MensalidadeHistoricoListProps {
  criancaId: string;
  canDelete?: boolean;
  showActions?: boolean;
}

interface Mensalidade {
  id: string;
  mes_referencia: string;
  valor: number;
  valor_pago: number | null;
  data_vencimento: string;
  data_pagamento: string | null;
  status: string;
  forma_pagamento: string | null;
  asaas_pix_url: string | null;
  asaas_payment_id: string | null;
  observacoes: string | null;
  escolinha: {
    nome: string;
  } | null;
}

const formatMesReferencia = (mes: string) => {
  const monthNames = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const [year, month] = mes.split('-');
  return `${monthNames[parseInt(month)]}/${year}`;
};

const getStatusBadge = (status: string) => {
  const normalizedStatus = status?.toLowerCase();
  switch (normalizedStatus) {
    case 'pago':
      return <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20"><CheckCircle2 className="w-3 h-3 mr-1" />Pago</Badge>;
    case 'a_vencer':
      return <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20"><Clock className="w-3 h-3 mr-1" />A Vencer</Badge>;
    case 'atrasado':
      return <Badge className="bg-destructive/10 text-destructive border-destructive/20"><AlertCircle className="w-3 h-3 mr-1" />Atrasado</Badge>;
    case 'isento':
      return <Badge variant="secondary">Isento</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};

const MensalidadeHistoricoList = ({ criancaId, canDelete = false, showActions = false }: MensalidadeHistoricoListProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [mensalidadeToDelete, setMensalidadeToDelete] = useState<Mensalidade | null>(null);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  
  // Action dialog state for baixa/isentar
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [selectedMensalidade, setSelectedMensalidade] = useState<Mensalidade | null>(null);
  const [actionType, setActionType] = useState<'pagar' | 'isentar' | null>(null);

  // Fetch all mensalidades for the child - exclude cancelled ones
  const { data: mensalidades = [], isLoading } = useQuery({
    queryKey: ['mensalidades-historico', criancaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mensalidades')
        .select(`
          id,
          mes_referencia,
          valor,
          valor_pago,
          data_vencimento,
          data_pagamento,
          status,
          forma_pagamento,
          observacoes,
          asaas_pix_url,
          asaas_payment_id,
          escolinha:escolinhas!mensalidades_escolinha_id_fkey(nome)
        `)
        .eq('crianca_id', criancaId)
        .neq('status', 'cancelado')
        .order('mes_referencia', { ascending: false });

      if (error) throw error;
      return data as Mensalidade[];
    },
    enabled: !!criancaId,
  });

  // Cancel mutation
  const deleteMutation = useMutation({
    mutationFn: async (mensalidadeId: string) => {
      const { data, error } = await supabase.functions.invoke('cancel-mensalidade-payment', {
        body: { mensalidadeId },
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Erro ao cancelar cobrança');
      return data;
    },
    onSuccess: (_, mensalidadeId) => {
      toast.success('Cobrança cancelada com sucesso');
      if (user?.id && user?.escolinhaId) {
        const m = mensalidades.find(x => x.id === mensalidadeId);
        logAdminAction(user.id, user.escolinhaId, 'cancelar_mensalidade_ficha', {
          mensalidade_id: mensalidadeId,
          mes_referencia: m?.mes_referencia,
        });
      }
      queryClient.invalidateQueries({ queryKey: ['mensalidades-historico', criancaId] });
      queryClient.invalidateQueries({ queryKey: ['guardian-mensalidades', criancaId] });
      queryClient.invalidateQueries({ queryKey: ['school-mensalidades-detail'] });
      queryClient.invalidateQueries({ queryKey: ['school-mensalidades-month-report'] });
      queryClient.invalidateQueries({ queryKey: ['school-children-relations'] });
      setDeleteDialogOpen(false);
      setMensalidadeToDelete(null);
    },
    onError: (error: Error) => {
      toast.error('Erro ao cancelar cobrança: ' + error.message);
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
        logAdminAction(user.id, user.escolinhaId, 'regenerar_pix_ficha', {
          mensalidade_id: mensalidadeId,
        });
      }
      queryClient.invalidateQueries({ queryKey: ['mensalidades-historico', criancaId] });
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
      // If marking as paid and has Asaas payment, cancel it first
      if (status === 'pago') {
        const m = mensalidades.find(x => x.id === id);
        if (m?.asaas_payment_id) {
          try {
            await supabase.functions.invoke('cancel-asaas-payment-only', { body: { mensalidadeId: id } });
          } catch (e) {
            console.warn('Could not cancel Asaas payment:', e);
          }
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
      queryClient.invalidateQueries({ queryKey: ['mensalidades-historico', criancaId] });
      queryClient.invalidateQueries({ queryKey: ['school-mensalidades-detail'] });
      queryClient.invalidateQueries({ queryKey: ['school-mensalidades-month-report'] });
      queryClient.invalidateQueries({ queryKey: ['school-growth-data'] });
      queryClient.invalidateQueries({ queryKey: ['financeiro-historico-unificado'] });
      setActionDialogOpen(false);
      setSelectedMensalidade(null);
      setActionType(null);
    },
    onError: (error: Error) => {
      toast.error('Erro: ' + error.message);
    },
  });

  const handleDeleteClick = (mensalidade: Mensalidade) => {
    setMensalidadeToDelete(mensalidade);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (mensalidadeToDelete) {
      deleteMutation.mutate(mensalidadeToDelete.id);
    }
  };

  const openAction = (mensalidade: Mensalidade, action: 'pagar' | 'isentar') => {
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

  if (mensalidades.length === 0) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center text-muted-foreground">
            <Receipt className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>Nenhuma cobrança encontrada</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const canAct = showActions || canDelete;

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <History className="w-4 h-4 text-muted-foreground" />
            Histórico de Cobranças
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {mensalidades.map((mensalidade) => {
            const isPendente = mensalidade.status !== 'pago' && mensalidade.status !== 'isento';

            return (
              <div
                key={mensalidade.id}
                className="flex flex-col gap-2 p-3 rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors"
              >
                {/* Top row: info + value/status */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className={`p-2 rounded-full shrink-0 relative ${
                      mensalidade.status?.toLowerCase() === 'pago'
                        ? 'bg-emerald-500/10'
                        : mensalidade.status?.toLowerCase() === 'atrasado'
                        ? 'bg-destructive/10'
                        : 'bg-muted'
                    }`}>
                      {mensalidade.status?.toLowerCase() === 'pago' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      ) : mensalidade.status?.toLowerCase() === 'atrasado' ? (
                        <AlertCircle className="w-4 h-4 text-destructive" />
                      ) : (
                        <Clock className="w-4 h-4 text-blue-500" />
                      )}
                      {mensalidade.asaas_pix_url && mensalidade.status?.toLowerCase() !== 'pago' && (
                        <QrCode className="w-3 h-3 text-primary absolute -bottom-0.5 -right-0.5" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm">
                          {formatMesReferencia(mensalidade.mes_referencia)}
                        </p>
                        {mensalidade.escolinha?.nome && (
                          <Badge variant="outline" className="text-xs gap-1">
                            <School className="w-3 h-3" />
                            {mensalidade.escolinha.nome}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Venc: {format(parseISO(mensalidade.data_vencimento), "dd/MM/yyyy")}
                        {mensalidade.data_pagamento && (
                          <> • Pago em {format(parseISO(mensalidade.data_pagamento), "dd/MM/yyyy")}</>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-semibold text-sm">
                      R$ {mensalidade.valor.toFixed(2).replace('.', ',')}
                    </p>
                    {getStatusBadge(mensalidade.status)}
                  </div>
                </div>

                {/* Action buttons row - only for pending mensalidades when showActions */}
                {canAct && isPendente && (
                  <div className="flex items-center gap-1 justify-end pt-1 border-t border-border/30">
                    {/* QR Code / PIX link */}
                    {mensalidade.asaas_pix_url && (
                      <Button size="sm" variant="outline" className="h-8 w-8 p-0" asChild>
                        <a
                          href={mensalidade.asaas_pix_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Abrir link de pagamento PIX"
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
                      onClick={() => regeneratePixMutation.mutate(mensalidade.id)}
                      disabled={regeneratingId === mensalidade.id}
                      title={mensalidade.asaas_pix_url ? "Regenerar PIX" : "Gerar PIX"}
                    >
                      {regeneratingId === mensalidade.id ? (
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
                      onClick={() => openAction(mensalidade, 'pagar')}
                      title="Dar baixa manual"
                    >
                      <CreditCard className="w-3.5 h-3.5" />
                    </Button>
                    {/* Mark as exempt */}
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 w-8 p-0"
                      onClick={() => openAction(mensalidade, 'isentar')}
                      title="Marcar como Isento"
                    >
                      <Ban className="w-3.5 h-3.5" />
                    </Button>
                    {/* Delete */}
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      onClick={() => handleDeleteClick(mensalidade)}
                      title="Cancelar cobrança"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar Cobrança</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja cancelar a cobrança de{' '}
              <strong>{mensalidadeToDelete && formatMesReferencia(mensalidadeToDelete.mes_referencia)}</strong>
              {' '}no valor de{' '}
              <strong>R$ {mensalidadeToDelete?.valor.toFixed(2).replace('.', ',')}</strong>?
              <br /><br />
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Excluindo...</>
              ) : 'Confirmar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Action Dialog for baixa/isentar */}
      {showActions && (
        <MensalidadeActionsDialog
          open={actionDialogOpen}
          onOpenChange={setActionDialogOpen}
          mensalidade={selectedMensalidade ? {
            id: selectedMensalidade.id,
            crianca_id: criancaId,
            crianca_nome: '',
            mes_referencia: selectedMensalidade.mes_referencia,
            valor: selectedMensalidade.valor,
            valor_pago: selectedMensalidade.valor_pago,
            status: selectedMensalidade.status,
            data_vencimento: selectedMensalidade.data_vencimento,
            data_pagamento: selectedMensalidade.data_pagamento,
            forma_pagamento: selectedMensalidade.forma_pagamento,
            observacoes: selectedMensalidade.observacoes,
            asaas_pix_url: selectedMensalidade.asaas_pix_url,
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

export default MensalidadeHistoricoList;
