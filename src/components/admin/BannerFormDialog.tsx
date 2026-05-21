import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { compressImage } from '@/lib/image-compressor';
import { BannerComEscolas, useSaveBanner } from '@/hooks/useBannersData';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  banner: BannerComEscolas | null;
}

export function BannerFormDialog({ open, onOpenChange, banner }: Props) {
  const { user } = useAuth();
  const saveMutation = useSaveBanner();
  const [titulo, setTitulo] = useState('');
  const [imagemUrl, setImagemUrl] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [abrirNovaAba, setAbrirNovaAba] = useState(true);
  const [ordem, setOrdem] = useState(0);
  const [ativo, setAtivo] = useState(true);
  const [inicioEm, setInicioEm] = useState('');
  const [fimEm, setFimEm] = useState('');
  const [escolinhaIds, setEscolinhaIds] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  const { data: escolinhas = [] } = useQuery({
    queryKey: ['admin-escolinhas-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('escolinhas')
        .select('id, nome')
        .order('nome');
      if (error) throw error;
      return data as { id: string; nome: string }[];
    },
  });

  useEffect(() => {
    if (open) {
      setTitulo(banner?.titulo ?? '');
      setImagemUrl(banner?.imagem_url ?? '');
      setLinkUrl(banner?.link_url ?? '');
      setAbrirNovaAba(banner?.abrir_nova_aba ?? true);
      setOrdem(banner?.ordem ?? 0);
      setAtivo(banner?.ativo ?? true);
      setInicioEm(banner?.inicio_em ? banner.inicio_em.slice(0, 16) : '');
      setFimEm(banner?.fim_em ? banner.fim_em.slice(0, 16) : '');
      setEscolinhaIds(banner?.escolinha_ids ?? []);
    }
  }, [open, banner]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;
    setUploading(true);
    try {
      const compressed = await compressImage(file, { maxWidth: 1600, quality: 0.85 });
      const ext = compressed.name.split('.').pop() || 'jpg';
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from('banners-publicitarios')
        .upload(path, compressed, { upsert: false, contentType: compressed.type });
      if (error) throw error;
      const { data } = supabase.storage.from('banners-publicitarios').getPublicUrl(path);
      setImagemUrl(data.publicUrl);
      toast.success('Imagem enviada!');
    } catch (err: any) {
      toast.error(err.message || 'Erro no upload');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const toggleEscolinha = (id: string) => {
    setEscolinhaIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSubmit = async () => {
    if (!titulo.trim() || !imagemUrl || !linkUrl.trim()) {
      toast.error('Preencha título, imagem e link');
      return;
    }
    try {
      await saveMutation.mutateAsync({
        id: banner?.id,
        titulo: titulo.trim(),
        imagem_url: imagemUrl,
        link_url: linkUrl.trim(),
        abrir_nova_aba: abrirNovaAba,
        ordem,
        ativo,
        inicio_em: inicioEm ? new Date(inicioEm).toISOString() : null,
        fim_em: fimEm ? new Date(fimEm).toISOString() : null,
        escolinha_ids: escolinhaIds,
      });
      toast.success(banner ? 'Banner atualizado!' : 'Banner criado!');
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{banner ? 'Editar Banner' : 'Novo Banner'}</DialogTitle>
          <DialogDescription>
            Recomendado: imagem 1200x675 (proporção 16:9), até 500KB. JPG ou PNG.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Título (interno)</Label>
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex: Promoção Fluminense" />
          </div>

          <div className="space-y-2">
            <Label>Imagem</Label>
            {imagemUrl && (
              <img src={imagemUrl} alt="Preview" className="w-full aspect-video object-cover rounded border" />
            )}
            <div>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileUpload}
                disabled={uploading}
                className="hidden"
                id="banner-upload"
              />
              <Label htmlFor="banner-upload" className="cursor-pointer">
                <Button type="button" variant="outline" disabled={uploading} asChild>
                  <span>
                    {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                    {imagemUrl ? 'Trocar imagem' : 'Enviar imagem'}
                  </span>
                </Button>
              </Label>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Link de destino (URL)</Label>
            <Input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://... ou /dashboard/loja"
            />
            <p className="text-xs text-muted-foreground">
              URLs externas começam com https://. Links internos (mesmo app) começam com /.
            </p>
          </div>

          <div className="flex items-center justify-between rounded border p-3">
            <div>
              <Label>Abrir em nova aba</Label>
              <p className="text-xs text-muted-foreground">Aplica somente a URLs externas.</p>
            </div>
            <Switch checked={abrirNovaAba} onCheckedChange={setAbrirNovaAba} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Ordem</Label>
              <Input type="number" value={ordem} onChange={(e) => setOrdem(Number(e.target.value))} />
            </div>
            <div className="flex items-end justify-between rounded border p-3">
              <Label>Ativo</Label>
              <Switch checked={ativo} onCheckedChange={setAtivo} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Início (opcional)</Label>
              <Input type="datetime-local" value={inicioEm} onChange={(e) => setInicioEm(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Fim (opcional)</Label>
              <Input type="datetime-local" value={fimEm} onChange={(e) => setFimEm(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Escolas que verão este banner</Label>
            <p className="text-xs text-muted-foreground">
              Se nada for selecionado, o banner aparece para todas as escolas.
            </p>
            <div className="max-h-48 overflow-y-auto rounded border p-2 space-y-1">
              {escolinhas.map((e) => (
                <label key={e.id} className="flex items-center gap-2 p-1 rounded hover:bg-muted cursor-pointer">
                  <Checkbox
                    checked={escolinhaIds.includes(e.id)}
                    onCheckedChange={() => toggleEscolinha(e.id)}
                  />
                  <span className="text-sm">{e.nome}</span>
                </label>
              ))}
              {escolinhas.length === 0 && (
                <p className="text-sm text-muted-foreground p-2">Nenhuma escola cadastrada.</p>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saveMutation.isPending}>
            {saveMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default BannerFormDialog;
