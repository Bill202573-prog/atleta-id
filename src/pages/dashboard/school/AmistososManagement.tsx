import { useState, useMemo } from 'react';
import { format, isPast, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  useSchoolEventos,
  useDeleteEvento,
  useEncerrarEvento,
  type EventoEsportivo,
  type EventoStatus,
} from '@/hooks/useEventosData';
import { useAmistosoConvocacoesCount } from '@/hooks/useAmistosoConvocacoesData';
import { EventoFormDialog } from '@/components/school/EventoFormDialog';
import EventoDetailDialog from '@/components/school/EventoDetailDialog';
import { AmistosoConvocacoesDialog } from '@/components/school/AmistosoConvocacoesDialog';
import { AmistosoConvocacaoSummary } from '@/components/school/AmistosoConvocacaoSummary';
import FinalizarAmistosoDialog from '@/components/school/FinalizarAmistosoDialog';
import AmistosoPendentesPopup from '@/components/school/AmistosoPendentesPopup';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ArrowLeft,
  Plus,
  Search,
  Swords,
  Users,
  Calendar,
  MapPin,
  MoreVertical,
  Pencil,
  Trash2,
  Loader2,
  Eye,
  UserPlus,
  Flag,
  HelpCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { AmistosoTutorial } from '@/components/school/AmistosoTutorial';

const STATUS_LABELS: Record<EventoStatus, string> = {
  agendado: 'Agendado',
  realizado: 'Realizado',
  finalizado: 'Finalizado',
};

const STATUS_COLORS: Record<EventoStatus, string> = {
  agendado: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  realizado: 'bg-green-500/10 text-green-600 border-green-500/20',
  finalizado: 'bg-muted text-muted-foreground border-border',
};

// Convocation button component with count
function ConvocacaoButton({ evento, onClick }: { evento: EventoEsportivo; onClick: () => void }) {
  const { data: count } = useAmistosoConvocacoesCount(evento.id);
  
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="h-7 text-xs gap-1"
    >
      <UserPlus className="w-3 h-3" />
      {count && count > 0 ? `Convocados (${count})` : 'Convocar'}
    </Button>
  );
}

export default function AmistososManagement() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const { data: allEventos, isLoading } = useSchoolEventos();
  const deleteEvento = useDeleteEvento();
  const encerrarEvento = useEncerrarEvento();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [selectedEvento, setSelectedEvento] = useState<EventoEsportivo | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailEvento, setDetailEvento] = useState<EventoEsportivo | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [eventoToDelete, setEventoToDelete] = useState<EventoEsportivo | null>(null);
  const [convocacoesOpen, setConvocacoesOpen] = useState(false);
  const [convocacoesEvento, setConvocacoesEvento] = useState<EventoEsportivo | null>(null);
  const [finalizarOpen, setFinalizarOpen] = useState(false);
  const [finalizarEvento, setFinalizarEvento] = useState<EventoEsportivo | null>(null);
  
  const [tutorialOpen, setTutorialOpen] = useState(false);

  

  // Filter only amistosos (events without campeonato_id)
  const amistosos = useMemo(() => {
    if (!allEventos) return [];
    return allEventos.filter((evento) => !evento.campeonato_id);
  }, [allEventos]);

  const filteredAmistosos = useMemo(() => {
    return amistosos.filter((evento) => {
      const matchesSearch = evento.nome
        .toLowerCase()
        .includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'all' || evento.status === statusFilter;

      return matchesSearch && matchesStatus;
    }).sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
  }, [amistosos, searchTerm, statusFilter]);

  const handleViewDetail = (evento: EventoEsportivo) => {
    setDetailEvento(evento);
    setDetailOpen(true);
  };

  const handleEdit = (evento: EventoEsportivo) => {
    setSelectedEvento(evento);
    setFormOpen(true);
  };

  const handleDelete = (evento: EventoEsportivo) => {
    setEventoToDelete(evento);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!eventoToDelete) return;

    try {
      await deleteEvento.mutateAsync(eventoToDelete.id);
      toast.success('Amistoso excluído com sucesso!');
      setDeleteDialogOpen(false);
      setEventoToDelete(null);
    } catch (error: any) {
      toast.error(error.message || 'Erro ao excluir amistoso');
    }
  };

  const handleNewAmistoso = () => {
    setSelectedEvento(null);
    setTutorialOpen(true);
  };

  const handleTutorialSkip = () => {
    setTutorialOpen(false);
    setFormOpen(true);
  };

  const handleConvocar = (evento: EventoEsportivo) => {
    setConvocacoesEvento(evento);
    setConvocacoesOpen(true);
  };

  const handleFinalizar = (evento: EventoEsportivo) => {
    setFinalizarEvento(evento);
    setFinalizarOpen(true);
  };

  const handleCancelarAmistoso = async (evento: EventoEsportivo) => {
    try {
      await encerrarEvento.mutateAsync(evento.id);
      toast.success('Amistoso marcado como cancelado');
    } catch {
      toast.error('Erro ao cancelar amistoso');
    }
  };

  // Stats
  const stats = useMemo(() => {
    return {
      total: amistosos.length,
      agendados: amistosos.filter((e) => e.status === 'agendado').length,
      realizados: amistosos.filter((e) => e.status === 'realizado' || e.status === 'finalizado').length,
    };
  }, [amistosos]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 sm:gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')} className="shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-lg sm:text-2xl font-bold">Amistosos</h1>
            <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">
              Gerencie jogos amistosos da escolinha
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          <Button variant="ghost" size="icon" onClick={() => setTutorialOpen(true)} className="text-muted-foreground sm:hidden">
            <HelpCircle className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setTutorialOpen(true)} className="text-xs text-muted-foreground gap-1 hidden sm:flex">
            <HelpCircle className="w-4 h-4" />
            Precisa de ajuda?
          </Button>
          <Button onClick={handleNewAmistoso} size={isMobile ? 'sm' : 'default'}>
            <Plus className="w-4 h-4 mr-1 sm:mr-2" />
            <span className="hidden sm:inline">Novo Amistoso</span>
            <span className="sm:hidden">Novo</span>
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <Card>
          <CardContent className="p-3 sm:pt-6 sm:p-6">
            <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4">
              <div className="p-2 sm:p-3 rounded-full bg-orange-500/10">
                <Swords className="w-4 h-4 sm:w-6 sm:h-6 text-orange-600" />
              </div>
              <div className="text-center sm:text-left">
                <p className="text-[10px] sm:text-sm text-muted-foreground">Total</p>
                <p className="text-lg sm:text-2xl font-bold">{stats.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:pt-6 sm:p-6">
            <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4">
              <div className="p-2 sm:p-3 rounded-full bg-blue-500/10">
                <Calendar className="w-4 h-4 sm:w-6 sm:h-6 text-blue-600" />
              </div>
              <div className="text-center sm:text-left">
                <p className="text-[10px] sm:text-sm text-muted-foreground">Agendados</p>
                <p className="text-lg sm:text-2xl font-bold">{stats.agendados}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:pt-6 sm:p-6">
            <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4">
              <div className="p-2 sm:p-3 rounded-full bg-green-500/10">
                <Users className="w-4 h-4 sm:w-6 sm:h-6 text-green-600" />
              </div>
              <div className="text-center sm:text-left">
                <p className="text-[10px] sm:text-sm text-muted-foreground">Realizados</p>
                <p className="text-lg sm:text-2xl font-bold">{stats.realizados}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3 sm:pb-6">
          <CardTitle className="text-base sm:text-lg">Amistosos</CardTitle>
        </CardHeader>
        <CardContent className="px-3 sm:px-6">
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 mb-4 sm:mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar amistosos..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-9 sm:h-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[180px] h-9 sm:h-10">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="agendado">Agendado</SelectItem>
                <SelectItem value="realizado">Realizado</SelectItem>
                <SelectItem value="finalizado">Finalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Mobile Card Layout */}
          {isMobile ? (
            <div className="space-y-2">
              {filteredAmistosos.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  {amistosos.length === 0
                    ? 'Nenhum amistoso cadastrado'
                    : 'Nenhum amistoso encontrado'}
                </div>
              ) : (
                filteredAmistosos.map((evento) => {
                  const isPassedPending = evento.status === 'agendado' && isPast(parseISO(evento.data + 'T23:59:59'));
                  const isFinalized = evento.status === 'realizado' || evento.status === 'finalizado';
                  const cardBg = isPassedPending
                    ? 'border-destructive/30 bg-destructive/5'
                    : isFinalized
                    ? 'border-emerald-500/30 bg-emerald-500/5'
                    : '';
                  return (
                    <div
                      key={evento.id}
                      className={`p-3 rounded-lg border cursor-pointer active:scale-[0.99] transition-all ${cardBg}`}
                      onClick={() => handleViewDetail(evento)}
                    >
                      {/* Row 1: Name + Status + Menu */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <Swords className="w-4 h-4 text-orange-500 shrink-0" />
                          <span className="font-bold text-sm truncate">{evento.nome}</span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Badge variant="outline" className={`${STATUS_COLORS[evento.status]} text-[10px] h-5`}>
                            {STATUS_LABELS[evento.status]}
                          </Badge>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => e.stopPropagation()}>
                                <MoreVertical className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleViewDetail(evento)}>
                                <Eye className="w-4 h-4 mr-2" /> Ver Detalhes
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => handleEdit(evento)}>
                                <Pencil className="w-4 h-4 mr-2" /> Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleDelete(evento)} className="text-destructive focus:text-destructive">
                                <Trash2 className="w-4 h-4 mr-2" /> Excluir
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>

                      {/* Row 2: Date, time, location, category */}
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground mb-2.5">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {format(new Date(evento.data), "dd/MM/yyyy", { locale: ptBR })}
                        </span>
                        {evento.horario_inicio && (
                          <span>{evento.horario_inicio.slice(0, 5)}</span>
                        )}
                        {evento.local && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            <span className="truncate max-w-[100px]">{evento.local}</span>
                          </span>
                        )}
                        {evento.categoria && (
                          <Badge variant="outline" className="text-[10px] h-4 px-1">{evento.categoria}</Badge>
                        )}
                      </div>

                      {/* Row 3: Placar + Convocação actions */}
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        {evento.placar_time1 !== null && evento.placar_time2 !== null ? (
                          <Badge className="bg-emerald-500/20 text-emerald-700 border-emerald-500/30 font-bold text-sm px-3">
                            {evento.placar_time1} x {evento.placar_time2}
                          </Badge>
                        ) : (
                          <Button
                            variant="default"
                            size="sm"
                            className="h-8 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                            onClick={() => handleFinalizar(evento)}
                          >
                            <Flag className="w-3.5 h-3.5" />
                            Lançar Placar
                          </Button>
                        )}
                        <ConvocacaoButton evento={evento} onClick={() => handleConvocar(evento)} />
                      </div>

                      {/* Convocation Summary */}
                      <AmistosoConvocacaoSummary eventoId={evento.id} />
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            /* Desktop Table */
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Evento</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Horário</TableHead>
                    <TableHead>Local</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Placar</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Convocação</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAmistosos.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                        {amistosos.length === 0
                          ? 'Nenhum amistoso cadastrado'
                          : 'Nenhum amistoso encontrado com os filtros aplicados'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredAmistosos.map((evento) => {
                      const isPassedPending = evento.status === 'agendado' && isPast(parseISO(evento.data + 'T23:59:59'));
                      const isFinalized = evento.status === 'realizado' || evento.status === 'finalizado';
                      const rowClassName = isPassedPending
                        ? 'cursor-pointer hover:bg-red-100/80 bg-red-50 dark:bg-red-950/20 dark:hover:bg-red-950/30'
                        : isFinalized
                        ? 'cursor-pointer hover:bg-green-100/80 bg-green-50 dark:bg-green-950/20 dark:hover:bg-green-950/30'
                        : 'cursor-pointer hover:bg-muted/50';
                      return (
                        <React.Fragment key={evento.id}>
                        <TableRow
                          className={rowClassName}
                          onClick={() => handleViewDetail(evento)}
                        >
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <Swords className="w-4 h-4 text-orange-500" />
                              {evento.nome}
                            </div>
                          </TableCell>
                          <TableCell>
                            {format(new Date(evento.data), "dd 'de' MMM, yyyy", {
                              locale: ptBR,
                            })}
                          </TableCell>
                          <TableCell>
                            {evento.horario_inicio
                              ? `${evento.horario_inicio.slice(0, 5)}${
                                  evento.horario_fim ? ` - ${evento.horario_fim.slice(0, 5)}` : ''
                                }`
                              : '-'}
                          </TableCell>
                          <TableCell>
                            {evento.local ? (
                              <div className="flex items-center gap-1">
                                <MapPin className="w-3 h-3 text-muted-foreground" />
                                <span className="truncate max-w-[150px]">{evento.local}</span>
                              </div>
                            ) : (
                              '-'
                            )}
                          </TableCell>
                          <TableCell>{evento.categoria || '-'}</TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            {evento.placar_time1 !== null && evento.placar_time2 !== null ? (
                              <Badge className="bg-emerald-500/20 text-emerald-700 border-emerald-500/30 font-semibold">
                                {evento.placar_time1} x {evento.placar_time2}
                              </Badge>
                            ) : (
                              <Button
                                variant="default"
                                size="sm"
                                className="h-7 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                                onClick={() => handleFinalizar(evento)}
                              >
                                <Flag className="w-3 h-3" />
                                Lançar Placar
                              </Button>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={STATUS_COLORS[evento.status]}>
                              {STATUS_LABELS[evento.status]}
                            </Badge>
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <ConvocacaoButton evento={evento} onClick={() => handleConvocar(evento)} />
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreVertical className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handleViewDetail(evento)}>
                                  <Eye className="w-4 h-4 mr-2" />
                                  Ver Detalhes
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => handleEdit(evento)}>
                                  <Pencil className="w-4 h-4 mr-2" />
                                  Editar
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handleDelete(evento)}
                                  className="text-destructive focus:text-destructive"
                                >
                                  <Trash2 className="w-4 h-4 mr-2" />
                                  Excluir
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                        <TableRow className="hover:bg-transparent border-b-2">
                          <TableCell colSpan={9} className="py-1 px-4">
                            <AmistosoConvocacaoSummary eventoId={evento.id} />
                          </TableCell>
                        </TableRow>
                        </React.Fragment>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <EventoDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        evento={detailEvento}
      />

      {/* Form Dialog - force amistoso type */}
      <EventoFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        evento={selectedEvento}
        forceAmistoso
      />

      {/* Convocações Dialog */}
      {convocacoesEvento && (
        <AmistosoConvocacoesDialog
          open={convocacoesOpen}
          onOpenChange={setConvocacoesOpen}
          eventoId={convocacoesEvento!.id}
          eventoNome={convocacoesEvento!.nome}
          categoria={convocacoesEvento!.categoria}
          taxaParticipacao={convocacoesEvento!.taxa_participacao}
          taxaJuiz={convocacoesEvento!.taxa_juiz}
          cobrarTaxaParticipacao={convocacoesEvento!.cobrar_taxa_participacao ?? false}
          cobrarTaxaJuiz={convocacoesEvento!.cobrar_taxa_juiz ?? false}
        />
      )}

      {/* Popup for past amistosos without convocations */}
      {amistosos.length > 0 && (
        <AmistosoPendentesPopup
          eventos={amistosos}
          onFinalizar={handleFinalizar}
          onCancelar={handleCancelarAmistoso}
        />
      )}

      {/* Finalizar Amistoso Dialog */}
      <FinalizarAmistosoDialog
        open={finalizarOpen}
        onOpenChange={setFinalizarOpen}
        evento={finalizarEvento}
        
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Amistoso</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o amistoso "{eventoToDelete?.nome}"?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteEvento.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Excluir'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AmistosoTutorial 
        open={tutorialOpen} 
        onOpenChange={setTutorialOpen}
        isCreationPrompt={!selectedEvento}
        onSkip={() => setFormOpen(true)}
      />
    </div>
  );
}
