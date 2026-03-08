import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Upload, Check, AlertCircle, Loader2, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface PendingChild {
  id: string;
  nome: string;
  foto_url: string; // path like "uuid/timestamp.ext"
  uploaded?: boolean;
}

const MigratePhotosPage = () => {
  const [children, setChildren] = useState<PendingChild[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    loadPendingChildren();
  }, []);

  const loadPendingChildren = async () => {
    const { data, error } = await supabase
      .from('criancas')
      .select('id, nome, foto_url')
      .not('foto_url', 'is', null)
      .not('foto_url', 'like', 'http%')
      .order('nome');

    if (error) {
      toast.error('Erro ao carregar crianças');
      console.error(error);
      return;
    }

    // Check which files already exist in storage
    const withStatus = await Promise.all(
      (data || []).map(async (child) => {
        const { data: fileData } = await supabase.storage
          .from('child-photos')
          .createSignedUrl(child.foto_url, 60);
        
        return {
          ...child,
          uploaded: !!fileData?.signedUrl,
        };
      })
    );

    setChildren(withStatus);
    setLoading(false);
  };

  const handleFileUpload = async (child: PendingChild, file: File) => {
    setUploading(child.id);
    try {
      const { error } = await supabase.storage
        .from('child-photos')
        .upload(child.foto_url, file, { upsert: true });

      if (error) throw error;

      setChildren(prev =>
        prev.map(c => c.id === child.id ? { ...c, uploaded: true } : c)
      );
      toast.success(`Foto de ${child.nome} enviada!`);
    } catch (err: any) {
      toast.error(`Erro ao enviar foto de ${child.nome}: ${err.message}`);
    } finally {
      setUploading(null);
    }
  };

  const getExpectedFileName = (fotoUrl: string) => {
    // Extract just the filename from the path (e.g., "1769518270470.jpg")
    return fotoUrl.split('/').pop() || fotoUrl;
  };

  const uploadedCount = children.filter(c => c.uploaded).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 max-w-3xl mx-auto">
      <Button variant="ghost" onClick={() => navigate(-1)} className="mb-4">
        <ArrowLeft className="w-4 h-4 mr-2" /> Voltar
      </Button>

      <h1 className="text-2xl font-bold mb-2">Migrar Fotos dos Alunos</h1>
      <p className="text-muted-foreground mb-6">
        {uploadedCount}/{children.length} fotos já enviadas. Para cada aluno abaixo, clique em "Enviar Foto"
        e selecione o arquivo correspondente que você baixou do projeto antigo.
      </p>

      <div className="space-y-3">
        {children.map(child => (
          <Card key={child.id} className={child.uploaded ? 'border-green-500/50 bg-green-50/50 dark:bg-green-950/20' : ''}>
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{child.nome}</p>
                <p className="text-xs text-muted-foreground font-mono truncate">
                  {getExpectedFileName(child.foto_url)}
                </p>
              </div>

              <div className="flex items-center gap-2 ml-4">
                {child.uploaded ? (
                  <div className="flex items-center gap-1 text-green-600">
                    <Check className="w-5 h-5" />
                    <span className="text-sm font-medium">OK</span>
                  </div>
                ) : uploading === child.id ? (
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                ) : (
                  <label className="cursor-pointer">
                    <Button size="sm" variant="outline" asChild>
                      <span>
                        <Upload className="w-4 h-4 mr-1" /> Enviar Foto
                      </span>
                    </Button>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload(child, file);
                        e.target.value = '';
                      }}
                    />
                  </label>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {uploadedCount === children.length && children.length > 0 && (
        <Card className="mt-6 border-green-500 bg-green-50 dark:bg-green-950/30">
          <CardContent className="p-4 text-center">
            <Check className="w-8 h-8 text-green-600 mx-auto mb-2" />
            <p className="font-bold text-green-700 dark:text-green-400">
              Todas as fotos foram migradas com sucesso!
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Você pode remover esta página depois.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default MigratePhotosPage;
