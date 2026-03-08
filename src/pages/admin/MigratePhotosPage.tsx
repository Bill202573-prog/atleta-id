import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { Upload, Check, Loader2, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface PendingChild {
  id: string;
  nome: string;
  foto_url: string;
  uploaded?: boolean;
}

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/migrate-child-photos`;

const MigratePhotosPage = () => {
  const [children, setChildren] = useState<PendingChild[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    loadPendingChildren();
  }, []);

  const getAuthHeaders = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      throw new Error('Você precisa estar logado para migrar as fotos');
    }

    return {
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${session.access_token}`,
    };
  };

  const loadPendingChildren = async () => {
    try {
      setLoading(true);
      const response = await fetch(FUNCTION_URL, {
        method: 'GET',
        headers: await getAuthHeaders(),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error || 'Erro ao carregar lista de migração');
      }

      setChildren(result.children || []);
    } catch (error: any) {
      toast.error(error.message || 'Erro ao carregar crianças');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (child: PendingChild, file: File) => {
    setUploading(child.id);
    try {
      const formData = new FormData();
      formData.append('childId', child.id);
      formData.append('file', file);

      const response = await fetch(FUNCTION_URL, {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error || 'Falha no upload');
      }

      setChildren((prev) =>
        prev.map((c) => (c.id === child.id ? { ...c, uploaded: true } : c))
      );
      toast.success(`Foto de ${child.nome} enviada!`);
    } catch (err: any) {
      toast.error(`Erro ao enviar foto de ${child.nome}: ${err.message}`);
    } finally {
      setUploading(null);
    }
  };

  const getExpectedFileName = (fotoUrl: string) => fotoUrl.split('/').pop() || fotoUrl;

  const uploadedCount = children.filter((c) => c.uploaded).length;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-3xl bg-background p-4 md:p-8">
      <Button variant="ghost" onClick={() => navigate(-1)} className="mb-4">
        <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
      </Button>

      <h1 className="mb-2 text-2xl font-bold">Migrar Fotos dos Alunos</h1>
      <p className="mb-6 text-muted-foreground">
        {uploadedCount}/{children.length} fotos já enviadas. Envie cada arquivo com o nome correspondente.
      </p>

      <div className="space-y-3">
        {children.map((child) => (
          <Card key={child.id} className={child.uploaded ? 'border-primary/30 bg-muted/40' : ''}>
            <CardContent className="flex items-center justify-between p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{child.nome}</p>
                <p className="truncate font-mono text-xs text-muted-foreground">
                  {getExpectedFileName(child.foto_url)}
                </p>
              </div>

              <div className="ml-4 flex items-center gap-2">
                {child.uploaded ? (
                  <div className="flex items-center gap-1 text-primary">
                    <Check className="h-5 w-5" />
                    <span className="text-sm font-medium">OK</span>
                  </div>
                ) : uploading === child.id ? (
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                ) : (
                  <label className="cursor-pointer">
                    <Button size="sm" variant="outline" asChild>
                      <span>
                        <Upload className="mr-1 h-4 w-4" /> Enviar Foto
                      </span>
                    </Button>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const selected = e.target.files?.[0];
                        if (selected) handleFileUpload(child, selected);
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

      {children.length === 0 && (
        <Card className="mt-6">
          <CardContent className="p-4 text-center text-sm text-muted-foreground">
            Nenhuma foto pendente encontrada.
          </CardContent>
        </Card>
      )}

      {uploadedCount === children.length && children.length > 0 && (
        <Card className="mt-6 border-primary/30 bg-muted/40">
          <CardContent className="p-4 text-center">
            <Check className="mx-auto mb-2 h-8 w-8 text-primary" />
            <p className="font-bold">Todas as fotos foram migradas com sucesso!</p>
            <p className="mt-1 text-sm text-muted-foreground">Você pode remover esta página depois.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default MigratePhotosPage;
