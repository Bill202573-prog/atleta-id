import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
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
  Trophy,
  Swords,
  Ban,
  Minus,
  GraduationCap,
  Shirt,
  CreditCard
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';

interface FinanceiroHistoricoUnificadoProps {
  criancaId: string;
  canDelete?: boolean;
  responsavelId?: string; // Para buscar pedidos da loja
  childName?: string; // Nome da criança para exibição consolidada
  escolinhaId?: string; // Quando fornecido, filtra dados apenas desta escola (multi-tenant isolation)
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

const formatMesReferencia = (mes: string) => {
  const monthNames = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const [year, month] = mes.split('-');
  return `${monthNames[parseInt(month)]}/${year}`;
};

const getStatusBadge = (status: string, isento?: boolean) => {
  if (isento) {
    return <Badge variant="secondary"><Minus className="w-3 h-3 mr-1" />Isento</Badge>;
  }
  
  const normalizedStatus = status?.toLowerCase();
  switch (normalizedStatus) {
    case 'pago':
    case 'confirmado':
      return <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20"><CheckCircle2 className="w-3 h-3 mr-1" />Pago</Badge>;
    case 'a_vencer':
    case 'pendente':
    case 'aguardando_pagamento':
      return <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20"><Clock className="w-3 h-3 mr-1" />Aguardando</Badge>;
    case 'convocado':
      return <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20"><Clock className="w-3 h-3 mr-1" />Convocado</Badge>;
    case 'atrasado':
      return <Badge className="bg-destructive/10 text-destructive border-destructive/20"><AlertCircle className="w-3 h-3 mr-1" />Atrasado</Badge>;
    case 'isento':
      return <Badge variant="secondary"><Minus className="w-3 h-3 mr-1" />Isento</Badge>;
    case 'recusado':
      return <Badge variant="outline" className="text-muted-foreground"><Ban className="w-3 h-3 mr-1" />Recusado</Badge>;
    case 'cancelado':
      return <Badge variant="outline" className="text-muted-foreground"><Ban className="w-3 h-3 mr-1" />Cancelado</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};

const getTipoIcon = (tipo: string) => {
  switch (tipo) {
    case 'mensalidade':
      return <Receipt className="w-4 h-4" />;
    case 'amistoso':
      return <Swords className="w-4 h-4" />;
    case 'campeonato':
      return <Trophy className="w-4 h-4" />;
    case 'matricula':
      return <GraduationCap className="w-4 h-4" />;
    case 'pedido_loja':
      return <Shirt className="w-4 h-4" />;
    default:
      return <Receipt className="w-4 h-4" />;
  }
};

const getTipoBadge = (tipo: string) => {
  switch (tipo) {
    case 'mensalidade':
      return <Badge variant="outline" className="text-xs">Mensalidade</Badge>;
    case 'amistoso':
      return <Badge variant="outline" className="text-xs bg-orange-500/10 text-orange-600 border-orange-500/20">Amistoso</Badge>;
    case 'campeonato':
      return <Badge variant="outline" className="text-xs bg-purple-500/10 text-purple-600 border-purple-500/20">Campeonato</Badge>;
    case 'matricula':
      return <Badge variant="outline" className="text-xs bg-green-500/10 text-green-600 border-green-500/20">Matrícula</Badge>;
    case 'pedido_loja':
      return <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-600 border-blue-500/20">Loja</Badge>;
    default:
      return null;
  }
};


// Helper to get display value for an item
const getItemDisplayValue = (item: FinanceiroItem): number | null => {
  if (item.tipo === 'matricula') {
    return item.valor_total;
  }
  if (item.tipo === 'mensalidade') {
    return item.valor;
  }
  if (item.tipo === 'pedido_loja') {
    return (item as PedidoLojaItem).valor;
  }
  // EventoItem
  return (item as EventoItem).valor;
};

const FinanceiroHistoricoUnificado = ({ criancaId, canDelete = false, responsavelId, childName, escolinhaId }: FinanceiroHistoricoUnificadoProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<FinanceiroItem | null>(null);
  const scopedEscolinhaId = escolinhaId || (canDelete ? user?.escolinhaId : undefined);

  // Fetch all financial items for the child (mensalidades + amistoso convocacoes + matriculas + pedidos)
  const { data: items = [], isLoading } = useQuery({
    queryKey: ['financeiro-historico-unificado', criancaId, responsavelId, scopedEscolinhaId],
    queryFn: async () => {
      // Fetch mensalidades - exclude cancelled ones from guardian view
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

      // Fetch amistoso convocacoes (strict school isolation when scopedEscolinhaId is provided)
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

      // Fetch cobrancas_entrada (enrollment charges)
      let matriculasQuery = supabase
        .from('cobrancas_entrada')
        .select(`
          id,
          status,
          valor_total,
          valor_matricula,
          valor_uniforme,
          valor_mensalidade,
          data_pagamento,
          created_at,
          escolinha:escolinhas!cobrancas_entrada_escolinha_id_fkey(nome)
        `)
        .eq('crianca_id', criancaId);
      
      if (scopedEscolinhaId) {
        matriculasQuery = matriculasQuery.eq('escolinha_id', scopedEscolinhaId);
      }
      
      const { data: matriculas, error: matriculasError } = await matriculasQuery
        .order('created_at', { ascending: false });

      if (matriculasError) throw matriculasError;

      // Fetch pedidos da loja
      let pedidosQuery = supabase
        .from('pedidos')
        .select(`
          id,
          numero_pedido,
          valor_total,
          status,
          data_pagamento,
          created_at,
          escolinha:escolinhas!pedidos_escolinha_id_fkey(nome)
        `)
        .eq('crianca_id', criancaId)
        .in('status', ['pago', 'entregue']);
      
      if (scopedEscolinhaId) {
        pedidosQuery = pedidosQuery.eq('escolinha_id', scopedEscolinhaId);
      }
      
      const { data: pedidos, error: pedidosError } = await pedidosQuery
        .order('created_at', { ascending: false });

      if (pedidosError) console.log('Pedidos query error:', pedidosError);

      // Transform mensalidades
      const mensalidadeItems: MensalidadeItem[] = (mensalidades || []).map(m => ({
        id: m.id,
        tipo: 'mensalidade' as const,
        descricao: `Mensalidade ${formatMesReferencia(m.mes_referencia)}`,
        valor: m.valor,
        data_vencimento: m.data_vencimento,
        data_pagamento: m.data_pagamento,
        status: m.status,
        escolinha_nome: (m.escolinha as any)?.nome || null,
        sortDate: m.data_vencimento,
      }));

      // Transform amistosos
      const amistosoItems: EventoItem[] = (amistosos || []).map(a => {
        const evento = a.evento as any;
        const adversario = evento?.adversario ? ` vs ${evento.adversario}` : '';
        return {
          id: a.id,
          tipo: 'amistoso' as const,
          descricao: `${evento?.nome || 'Amistoso'}${adversario}`,
          valor: a.valor,
          data_evento: evento?.data || '',
          data_pagamento: a.data_pagamento,
          status: a.status,
          escolinha_nome: evento?.escolinha?.nome || null,
          isento: a.isento,
          sortDate: evento?.data || '',
          taxa_participacao: evento?.taxa_participacao,
          taxa_juiz: evento?.taxa_juiz,
          cobrar_taxa_participacao: evento?.cobrar_taxa_participacao ?? false,
          cobrar_taxa_juiz: evento?.cobrar_taxa_juiz ?? false,
        };
      });

      // Transform matriculas (enrollment charges)
      const matriculaItems: MatriculaItem[] = (matriculas || []).map(m => ({
        id: m.id,
        tipo: 'matricula' as const,
        descricao: 'Taxa de Matrícula',
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

      // Combine and sort by date (most recent first)
      const allItems: FinanceiroItem[] = [...mensalidadeItems, ...amistosoItems, ...matriculaItems, ...pedidoItems];
      allItems.sort((a, b) => {
        return b.sortDate.localeCompare(a.sortDate);
      });

      return allItems;
    },
    enabled: !!criancaId,
  });

  // Delete mutation - uses edge function for mensalidades to cancel in Asaas
  const deleteMutation = useMutation({
    mutationFn: async (item: FinanceiroItem) => {
      if (item.tipo === 'mensalidade') {
        // Use edge function to cancel in Asaas and update status
        const { data, error } = await supabase.functions.invoke('cancel-mensalidade-payment', {
          body: { mensalidadeId: item.id },
        });
        if (error) throw error;
        if (!data.success) throw new Error(data.error || 'Erro ao cancelar cobrança');
      } else if (item.tipo === 'amistoso') {
        // Use edge function to cancel amistoso payment in Asaas
        const { data, error } = await supabase.functions.invoke('cancel-amistoso-payment', {
          body: { convocacaoId: item.id },
        });
        if (error) throw error;
        if (!data.success) throw new Error(data.error || 'Erro ao cancelar cobrança');
      }
      // Note: matricula items cannot be deleted by the user
    },
    onSuccess: () => {
      toast.success('Registro cancelado com sucesso');
      queryClient.invalidateQueries({ queryKey: ['financeiro-historico-unificado', criancaId] });
      queryClient.invalidateQueries({ queryKey: ['mensalidades-historico', criancaId] });
      queryClient.invalidateQueries({ queryKey: ['guardian-mensalidades', criancaId] });
      queryClient.invalidateQueries({ queryKey: ['school-mensalidades-detail'] });
      queryClient.invalidateQueries({ queryKey: ['guardian-amistoso-convocacoes'] });
      setDeleteDialogOpen(false);
      setItemToDelete(null);
    },
    onError: (error: Error) => {
      console.error('Error cancelling item:', error);
      toast.error('Erro ao cancelar registro: ' + error.message);
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
                    {canDelete && item.tipo !== 'matricula' && item.tipo !== 'pedido_loja' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleDeleteClick(item)}
                        title="Excluir registro"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
                
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
            <AlertDialogTitle>Excluir Registro</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o registro{' '}
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
                'Excluir'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default FinanceiroHistoricoUnificado;