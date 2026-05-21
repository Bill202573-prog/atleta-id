import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Plus, Edit, Trash2, Loader2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { BannerComEscolas, useAdminBanners, useDeleteBanner } from '@/hooks/useBannersData';
import { BannerFormDialog } from '@/components/admin/BannerFormDialog';

export default function AdminBannersPage() {
  const { data: banners = [], isLoading } = useAdminBanners();
  const deleteMutation = useDeleteBanner();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<BannerComEscolas | null>(null);
  const [toDelete, setToDelete] = useState<BannerComEscolas | null>(null);

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      await deleteMutation.mutateAsync(toDelete.id);
      toast.success('Banner excluído!');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao excluir');
    } finally {
      setToDelete(null);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Banners Publicitários</h1>
          <p className="text-sm text-muted-foreground">
            Banners exibidos na tela inicial do app dos responsáveis. Recomendado 1200x675 (16:9).
          </p>
        </div>
        <Button onClick={() => { setEditing(null); setFormOpen(true); }} className="w-full sm:w-auto">
          <Plus className="w-4 h-4 mr-2" /> Novo Banner
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Banners cadastrados</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : banners.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Nenhum banner cadastrado ainda.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {banners.map((b) => (
                <div key={b.id} className="rounded-lg border bg-card overflow-hidden">
                  <img src={b.slides[0]?.imagem_url || b.imagem_url} alt={b.titulo} className="w-full aspect-video object-cover" />
                  <div className="p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold truncate">{b.titulo}</p>
                        <p className="text-xs text-muted-foreground">
                          {b.slides.length} slide{b.slides.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge variant={b.ativo ? 'default' : 'secondary'}>
                          {b.ativo ? 'Ativo' : 'Inativo'}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {b.posicao === 'produtos' ? 'Produtos' : 'Topo'}
                        </Badge>
                      </div>
                    </div>

                    <div className="text-xs text-muted-foreground space-y-0.5">
                      <p>Ordem: {b.ordem}</p>
                      <p>
                        Escolas:{' '}
                        {b.escolinha_ids.length === 0
                          ? <span className="font-medium">Todas</span>
                          : `${b.escolinha_ids.length} selecionada(s)`}
                      </p>
                      {(b.inicio_em || b.fim_em) && (
                        <p>
                          Janela: {b.inicio_em ? format(new Date(b.inicio_em), 'dd/MM/yy HH:mm') : '—'}
                          {' até '}
                          {b.fim_em ? format(new Date(b.fim_em), 'dd/MM/yy HH:mm') : '—'}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 pt-2 border-t">
                      <Button size="sm" variant="outline" onClick={() => { setEditing(b); setFormOpen(true); }}>
                        <Edit className="w-3.5 h-3.5 mr-1" /> Editar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setToDelete(b)}
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1" /> Excluir
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <BannerFormDialog open={formOpen} onOpenChange={setFormOpen} banner={editing} />

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir banner</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. "{toDelete?.titulo}" será removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
