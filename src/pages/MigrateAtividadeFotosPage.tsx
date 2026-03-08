import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Upload, CheckCircle, Loader2, ImagePlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { useSignedUrls } from "@/hooks/useSignedUrl";

interface Activity {
  id: string;
  crianca_id: string;
  crianca_nome: string;
  tipo: string;
  data: string;
  local: string;
  instituicao: string;
  fotos_count: number;
  fotos_urls: string[];
}

const TIPO_LABELS: Record<string, string> = {
  treino_preparador_fisico: "Treino Físico",
  clinica_camp: "Clínica / Camp",
  avaliacao: "Avaliação",
  competicao_torneio: "Competição / Torneio",
  outro: "Outro",
};

function ActivityPhotoThumbnails({ paths }: { paths: string[] }) {
  const urls = useSignedUrls(paths, "atividade-externa-fotos");

  if (urls.length === 0) return null;

  return (
    <div className="flex gap-2 mt-2">
      {urls.map((url, i) => (
        <img
          key={i}
          src={url}
          alt={`Foto ${i + 1}`}
          className="w-16 h-16 rounded-md object-cover border"
        />
      ))}
    </div>
  );
}

const MigrateAtividadeFotosPage = () => {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [autoMigrating, setAutoMigrating] = useState(false);
  const [autoResult, setAutoResult] = useState<any>(null);

  const fetchActivities = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Você precisa estar logado");
        return;
      }

      const res = await supabase.functions.invoke("migrate-atividade-fotos", {
        method: "GET",
      });

      if (res.error) throw res.error;
      setActivities(res.data?.activities || []);
    } catch (e) {
      console.error(e);
      toast.error("Erro ao carregar atividades");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActivities();
  }, []);

  const handleUploadClick = (activityId: string) => {
    setSelectedActivityId(activityId);
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0 || !selectedActivityId) return;

    const activity = activities.find((a) => a.id === selectedActivityId);
    if (!activity) return;

    const remainingSlots = 3 - activity.fotos_count;
    if (remainingSlots <= 0) {
      toast.error("Esta atividade já tem 3 fotos");
      return;
    }

    const filesToUpload = Array.from(files).slice(0, remainingSlots);
    setUploadingId(selectedActivityId);

    try {
      for (const file of filesToUpload) {
        if (file.size > 10 * 1024 * 1024) {
          toast.error(`Arquivo muito grande: ${file.name}. Máximo 10MB.`);
          continue;
        }

        const formData = new FormData();
        formData.append("atividadeId", selectedActivityId);
        formData.append("file", file);

        const { data: { session } } = await supabase.auth.getSession();

        const res = await fetch(
          `https://vxzktyklzkfqitptzctk.supabase.co/functions/v1/migrate-atividade-fotos`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${session?.access_token}`,
            },
            body: formData,
          }
        );

        const result = await res.json();
        if (!res.ok) throw new Error(result.error || "Erro no upload");

        toast.success(`Foto "${file.name}" enviada!`);
      }

      await fetchActivities();
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Erro no upload");
    } finally {
      setUploadingId(null);
      setSelectedActivityId(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  const withPhotos = activities.filter((a) => a.fotos_count > 0);
  const withoutPhotos = activities.filter((a) => a.fotos_count === 0);

  return (
    <div className="container mx-auto p-4 max-w-3xl">
      <h1 className="text-2xl font-bold mb-2">Migrar Fotos de Atividades Externas</h1>
      <p className="text-muted-foreground mb-6">
        Faça upload das fotos do sistema antigo para cada atividade. Máximo 3 fotos por atividade.
        <br />
        <span className="text-xs">Formatos aceitos: JPG, PNG, WebP, AVIF</span>
      </p>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp,image/avif"
        multiple
        className="hidden"
        onChange={handleFileSelect}
      />

      <div className="mb-4 flex gap-4 text-sm">
        <span className="text-muted-foreground">
          Total: <strong>{activities.length}</strong>
        </span>
        <span className="text-green-600">
          Com fotos: <strong>{withPhotos.length}</strong>
        </span>
        <span className="text-orange-600">
          Sem fotos: <strong>{withoutPhotos.length}</strong>
        </span>
      </div>

      <div className="space-y-3">
        {activities.map((activity) => (
          <Card key={activity.id} className={activity.fotos_count > 0 ? "border-green-200 bg-green-50/50" : ""}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-semibold text-sm">{activity.crianca_nome}</span>
                    <Badge variant="outline" className="text-xs">
                      {TIPO_LABELS[activity.tipo] || activity.tipo}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    <div>{new Date(activity.data + "T12:00:00").toLocaleDateString("pt-BR")}</div>
                    <div>{activity.local}</div>
                    {activity.instituicao && <div>{activity.instituicao}</div>}
                  </div>

                  {/* Thumbnails das fotos já enviadas */}
                  {activity.fotos_count > 0 && (
                    <>
                      <ActivityPhotoThumbnails paths={activity.fotos_urls} />
                      <div className="flex items-center gap-1 mt-1 text-xs text-green-600">
                        <CheckCircle className="w-3 h-3" />
                        {activity.fotos_count}/3 foto(s)
                      </div>
                    </>
                  )}
                </div>
                <Button
                  size="sm"
                  variant={activity.fotos_count > 0 ? "outline" : "default"}
                  onClick={() => handleUploadClick(activity.id)}
                  disabled={uploadingId === activity.id || activity.fotos_count >= 3}
                >
                  {uploadingId === activity.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : activity.fotos_count >= 3 ? (
                    <CheckCircle className="w-4 h-4" />
                  ) : (
                    <>
                      <ImagePlus className="w-4 h-4 mr-1" />
                      {activity.fotos_count > 0 ? "+" : "Upload"}
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {activities.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            Nenhuma atividade externa encontrada.
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default MigrateAtividadeFotosPage;
