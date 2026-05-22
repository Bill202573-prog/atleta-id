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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Upload, Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import { toast } from 'sonner';
import { compressImage } from '@/lib/image-compressor';
import { BannerComEscolas, BannerPosicao, BannerSlide, useSaveBanner } from '@/hooks/useBannersData';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  banner: BannerComEscolas | null;
}

const MAX_SLIDES = 5;

export function BannerFormDialog({ open, onOpenChange, banner }: Props) {
  const { user } = useAuth();
  const saveMutation = useSaveBanner();
  const [titulo, setTitulo] = useState('');
  const [posicao, setPosicao] = useState<BannerPosicao>('topo');
  const [slides, setSlides] = useState<BannerSlide[]>([]);
  const [ordem, setOrdem] = useState(0);
  const [ativo, setAtivo] = useState(true);
  const [inicioEm, setInicioEm] = useState('');
  const [fimEm, setFimEm] = useState('');
  const [escolinhaIds, setEscolinhaIds] = useState<string[]>([]);
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);

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
      setPosicao((banner?.posicao as BannerPosicao) ?? 'topo');
      setSlides(banner?.slides?.length ? banner.slides : []);
      setOrdem(banner?.ordem ?? 0);
      setAtivo(banner?.ativo ?? true);
      setInicioEm(banner?.inicio_em ? banner.inicio_em.slice(0, 16) : '');
      setFimEm(banner?.fim_em ? banner.fim_em.slice(0, 16) : '');
      setEscolinhaIds(banner?.escolinha_ids ?? []);
    }
  }, [open, banner]);

  const addSlide = () => {
    if (slides.length >= MAX_SLIDES) return;
    setSlides([...slides, { imagem_url: '', link_url: '', abrir_nova_aba: true }]);
  };

  const removeSlide = (idx: number) => {
    setSlides(slides.filter((_, i) => i !== idx));
  };

  const moveSlide = (idx: number, dir: -1 | 1) => {
    const next = [...slides];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setSlides(next);
  };

  const updateSlide = (idx: number, patch: Partial<BannerSlide>) => {
    setSlides(slides.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };

  const handleFileUpload = async (idx: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;
    setUploadingIdx(idx);
    try {
      const compressed = await compressImage(file, { maxWidth: 1600, quality: 0.85 });
      const ext = compressed.name.split('.').pop() || 'jpg';
      const path = `${user.id}/${Date.now()}-${idx}.${ext}`;
      const { error } = await supabase.storage
        .from('banners-publicitarios')
        .upload(path, compressed, { upsert: false, contentType: compressed.type });
      if (error) throw error;
      const { data } = supabase.storage.from('banners-publicitarios').getPublicUrl(path);
      updateSlide(idx, { imagem_url: data.publicUrl });
      toast.success('Imagem enviada!');
    } catch (err: any) {
      toast.error(err.message || 'Erro no upload');
    } finally {
      setUploadingIdx(null);
      e.target.value = '';
    }
  };

  const toggleEscolinha = (id: string) => {
    setEscolinhaIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSubmit = async () => {
    if (!titulo.trim()) {
      toast.error('Preencha o título');
      return;
    }
    const validSlides = slides
      .filter((s) => s.imagem_url)
      .map((s) => ({ ...s, link_url: (s.link_url ?? '').trim() }));
    if (validSlides.length === 0) {
      toast.error('Adicione ao menos 1 slide com imagem');
      return;
    }
    try {
      await saveMutation.mutateAsync({
        id: banner?.id,
        titulo: titulo.trim(),
        posicao,
        slides: validSlides,
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
            Cada banner aceita até {MAX_SLIDES} imagens (carrossel). Recomendado: 1200x675 (16:9), até 500KB. JPG, PNG ou WebP.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Título (interno)</Label>
              <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex: Promoção Fluminense" />
            </div>
            <div className="space-y-2">
              <Label>Posição na tela inicial</Label>
              <Select value={posicao} onValueChange={(v) => setPosicao(v as BannerPosicao)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="topo">Topo (acima)</SelectItem>
                  <SelectItem value="produtos">Produtos (abaixo)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Slides ({slides.length}/{MAX_SLIDES})</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={addSlide}
                disabled={slides.length >= MAX_SLIDES}
              >
                <Plus className="w-4 h-4 mr-1" /> Adicionar slide
              </Button>
            </div>

            {slides.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4 border rounded">
                Nenhum slide. Clique em "Adicionar slide".
              </p>
            )}

            {slides.map((slide, idx) => (
              <div key={idx} className="rounded border p-3 space-y-3 bg-muted/30">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Slide {idx + 1}</span>
                  <div className="flex items-center gap-1">
                    <Button type="button" size="icon" variant="ghost" onClick={() => moveSlide(idx, -1)} disabled={idx === 0}>
                      <ArrowUp className="w-4 h-4" />
                    </Button>
                    <Button type="button" size="icon" variant="ghost" onClick={() => moveSlide(idx, 1)} disabled={idx === slides.length - 1}>
                      <ArrowDown className="w-4 h-4" />
                    </Button>
                    <Button type="button" size="icon" variant="ghost" className="text-destructive" onClick={() => removeSlide(idx)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {slide.imagem_url && (
                  <img src={slide.imagem_url} alt="" className="w-full aspect-video object-cover rounded border" />
                )}
                <div>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => handleFileUpload(idx, e)}
                    disabled={uploadingIdx !== null}
                    className="hidden"
                    id={`banner-upload-${idx}`}
                  />
                  <Label htmlFor={`banner-upload-${idx}`} className="cursor-pointer">
                    <Button type="button" variant="outline" size="sm" disabled={uploadingIdx !== null} asChild>
                      <span>
                        {uploadingIdx === idx ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                        {slide.imagem_url ? 'Trocar imagem' : 'Enviar imagem'}
                      </span>
                    </Button>
                  </Label>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Link de destino</Label>
                  <Input
                    value={slide.link_url}
                    onChange={(e) => updateSlide(idx, { link_url: e.target.value })}
                    placeholder="https://... ou /dashboard/loja"
                  />
                </div>

                <div className="flex items-center justify-between rounded border bg-background p-2">
                  <Label className="text-xs">Abrir em nova aba (URLs externas)</Label>
                  <Switch
                    checked={slide.abrir_nova_aba}
                    onCheckedChange={(v) => updateSlide(idx, { abrir_nova_aba: v })}
                  />
                </div>
              </div>
            ))}
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
