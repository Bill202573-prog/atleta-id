import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Upload, CheckCircle, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

// Mapping: filename → { activityId, fullPath (crianca_id/filename) }
const FILE_MAPPING: Record<string, { activityId: string; fullPath: string; label: string }> = {
  // David - competicao_torneio 2025-12-01
  "1772132486624-9w4a4fhcx.png": { activityId: "34e0cebc-3a6b-4b3d-bc82-5bb8226b13df", fullPath: "89c8bf37-31fd-4b60-b376-757d00e5a098/1772132486624-9w4a4fhcx.png", label: "David - Competição 01/12" },
  // David - treino 2026-01-02
  "1772132436057-hftcy2tvw.png": { activityId: "dbe9fef9-1c5c-44d2-bb53-6a06714904fe", fullPath: "89c8bf37-31fd-4b60-b376-757d00e5a098/1772132436057-hftcy2tvw.png", label: "David - Treino 02/01" },
  // Cristiano - clinica_camp 2026-02-05
  "1771894177589-lk2dn1bij.png": { activityId: "c240e3fd-fc33-46cc-b603-5b92f4f70ddc", fullPath: "a67a6e1b-e33f-4c2e-85a5-b5d29fdfbc05/1771894177589-lk2dn1bij.png", label: "Cristiano - Clínica 05/02" },
  // Miguel - competicao_torneio 2025-12-14
  "1770916869147-58vkeerfd.jpg": { activityId: "7692c1e2-2d4c-4419-8518-b08c5ee2f04c", fullPath: "b196c67a-1983-4456-92fc-89609d22fb52/1770916869147-58vkeerfd.jpg", label: "Miguel - Competição 14/12" },
  // Miguel - treino 2026-01-20
  "1770916302277-pz965hi4o.jpg": { activityId: "504a06bb-e47d-493a-b488-4aef1c7f0ab0", fullPath: "b196c67a-1983-4456-92fc-89609d22fb52/1770916302277-pz965hi4o.jpg", label: "Miguel - Treino 20/01" },
  "1770916304103-8kz0m9qfk.jpg": { activityId: "504a06bb-e47d-493a-b488-4aef1c7f0ab0", fullPath: "b196c67a-1983-4456-92fc-89609d22fb52/1770916304103-8kz0m9qfk.jpg", label: "Miguel - Treino 20/01" },
  "1770916305842-2udzya3um.jpg": { activityId: "504a06bb-e47d-493a-b488-4aef1c7f0ab0", fullPath: "b196c67a-1983-4456-92fc-89609d22fb52/1770916305842-2udzya3um.jpg", label: "Miguel - Treino 20/01" },
  // Miguel - clinica_camp 2026-01-30
  "1770915990598-okwdzz9ft.jpg": { activityId: "8afb46c9-31ba-416e-99fd-603544ac0b42", fullPath: "b196c67a-1983-4456-92fc-89609d22fb52/1770915990598-okwdzz9ft.jpg", label: "Miguel - Clínica 30/01" },
  "1770915993521-d4ckkei1x.jpg": { activityId: "8afb46c9-31ba-416e-99fd-603544ac0b42", fullPath: "b196c67a-1983-4456-92fc-89609d22fb52/1770915993521-d4ckkei1x.jpg", label: "Miguel - Clínica 30/01" },
  "1770915995164-j4tuyuchs.jpg": { activityId: "8afb46c9-31ba-416e-99fd-603544ac0b42", fullPath: "b196c67a-1983-4456-92fc-89609d22fb52/1770915995164-j4tuyuchs.jpg", label: "Miguel - Clínica 30/01" },
  // Guilherme - clinica_camp 2026-01-29
  "1770321004212-z8xlzkf4a.jpg": { activityId: "9cfcbb8e-394d-4f49-91da-8c62096eedf5", fullPath: "e1277a26-c847-483b-a3f9-e76fad2ce8ac/1770321004212-z8xlzkf4a.jpg", label: "Guilherme - Clínica 29/01" },
  "1770321060323-d41bnhfpn.jpg": { activityId: "9cfcbb8e-394d-4f49-91da-8c62096eedf5", fullPath: "e1277a26-c847-483b-a3f9-e76fad2ce8ac/1770321060323-d41bnhfpn.jpg", label: "Guilherme - Clínica 29/01" },
  "1770321061436-wlilmzq9m.jpg": { activityId: "9cfcbb8e-394d-4f49-91da-8c62096eedf5", fullPath: "e1277a26-c847-483b-a3f9-e76fad2ce8ac/1770321061436-wlilmzq9m.jpg", label: "Guilherme - Clínica 29/01" },
  // Guilherme - treino 2026-01-02
  "1770322673737-mg7ydg2a5.jpg": { activityId: "0fe1f34b-05b9-4ede-88bf-71e9cd8c4bf1", fullPath: "e1277a26-c847-483b-a3f9-e76fad2ce8ac/1770322673737-mg7ydg2a5.jpg", label: "Guilherme - Treino 02/01" },
  "1770322675235-lefrkdz0x.jpg": { activityId: "0fe1f34b-05b9-4ede-88bf-71e9cd8c4bf1", fullPath: "e1277a26-c847-483b-a3f9-e76fad2ce8ac/1770322675235-lefrkdz0x.jpg", label: "Guilherme - Treino 02/01" },
  // Guilherme - avaliacao 2026-02-05
  "1770325021242-ty3wt1ucl.jpg": { activityId: "553ec2c0-b6e4-4a0f-ac13-b1bf4a57e7a3", fullPath: "e1277a26-c847-483b-a3f9-e76fad2ce8ac/1770325021242-ty3wt1ucl.jpg", label: "Guilherme - Avaliação 05/02" },
  // João Guilherme - competicao_torneio 2025-10-11
  "1770061431486-hknk3d320.jpg": { activityId: "55315eca-1b88-41a0-a688-528ed9981929", fullPath: "ed3e3083-7455-452d-b7ac-6734c191adf4/1770061431486-hknk3d320.jpg", label: "João Guilherme - Competição 11/10" },
  "1770061478287-ku66ja0rv.jpg": { activityId: "55315eca-1b88-41a0-a688-528ed9981929", fullPath: "ed3e3083-7455-452d-b7ac-6734c191adf4/1770061478287-ku66ja0rv.jpg", label: "João Guilherme - Competição 11/10" },
  "1770062483967-piju49o12.jpg": { activityId: "55315eca-1b88-41a0-a688-528ed9981929", fullPath: "ed3e3083-7455-452d-b7ac-6734c191adf4/1770062483967-piju49o12.jpg", label: "João Guilherme - Competição 11/10" },
  // João Guilherme - competicao_torneio 2025-10-18
  "1770062801529-4yeokx9ms.jpg": { activityId: "43bcbf0e-fe01-4c4f-8cf9-617f3f16bac6", fullPath: "ed3e3083-7455-452d-b7ac-6734c191adf4/1770062801529-4yeokx9ms.jpg", label: "João Guilherme - Competição 18/10" },
  "1770063490724-o0c20foa9.jpg": { activityId: "43bcbf0e-fe01-4c4f-8cf9-617f3f16bac6", fullPath: "ed3e3083-7455-452d-b7ac-6734c191adf4/1770063490724-o0c20foa9.jpg", label: "João Guilherme - Competição 18/10" },
};

interface UploadResult {
  filename: string;
  status: "matched" | "unmatched" | "uploaded" | "db_updated" | "error";
  label?: string;
  error?: string;
}

const MigrateAtividadeFotosPage = () => {
  const [results, setResults] = useState<UploadResult[]>([]);
  const [migrating, setMigrating] = useState(false);
  const [step, setStep] = useState<"idle" | "uploading" | "done">("idle");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setMigrating(true);
    setStep("uploading");
    setResults([]);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      toast.error("Você precisa estar logado");
      setMigrating(false);
      return;
    }

    const fileArray = Array.from(files);
    const newResults: UploadResult[] = [];

    // Group by activityId for DB update
    const activityPhotos: Record<string, string[]> = {};

    for (const file of fileArray) {
      const mapping = FILE_MAPPING[file.name];
      if (!mapping) {
        newResults.push({ filename: file.name, status: "unmatched" });
        continue;
      }

      try {
        // Upload to bucket with correct path
        const { error: uploadError } = await supabase.storage
          .from("atividade-externa-fotos")
          .upload(mapping.fullPath, file, {
            upsert: true,
            contentType: file.type || "image/jpeg",
          });

        if (uploadError) {
          // Try with service role via edge function
          const formData = new FormData();
          formData.append("atividadeId", mapping.activityId);
          formData.append("file", file);
          formData.append("targetPath", mapping.fullPath);

          const res = await fetch(
            `https://vxzktyklzkfqitptzctk.supabase.co/functions/v1/migrate-atividade-fotos`,
            {
              method: "POST",
              headers: { Authorization: `Bearer ${session.access_token}` },
              body: formData,
            }
          );

          if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || uploadError.message);
          }

          newResults.push({ filename: file.name, status: "uploaded", label: mapping.label });
        } else {
          newResults.push({ filename: file.name, status: "uploaded", label: mapping.label });
        }

        // Track for DB update
        if (!activityPhotos[mapping.activityId]) {
          activityPhotos[mapping.activityId] = [];
        }
        activityPhotos[mapping.activityId].push(mapping.fullPath);
      } catch (err) {
        newResults.push({
          filename: file.name,
          status: "error",
          label: mapping.label,
          error: err instanceof Error ? err.message : "Erro desconhecido",
        });
      }

      setResults([...newResults]);
    }

    // Update fotos_urls in DB for each activity
    for (const [activityId, paths] of Object.entries(activityPhotos)) {
      try {
        // Get existing photos
        const { data: activity } = await supabase
          .from("atividades_externas")
          .select("fotos_urls")
          .eq("id", activityId)
          .maybeSingle();

        const existing = (activity?.fotos_urls as string[]) || [];
        const merged = [...new Set([...existing, ...paths])].slice(0, 3);

        const { error: updateError } = await supabase
          .from("atividades_externas")
          .update({ fotos_urls: merged })
          .eq("id", activityId);

        if (updateError) {
          console.error(`DB update failed for ${activityId}:`, updateError);
        }
      } catch (err) {
        console.error(`DB update error for ${activityId}:`, err);
      }
    }

    setStep("done");
    setMigrating(false);

    const uploaded = newResults.filter((r) => r.status === "uploaded").length;
    const unmatched = newResults.filter((r) => r.status === "unmatched").length;
    const errors = newResults.filter((r) => r.status === "error").length;

    toast.success(
      `Concluído! ${uploaded} enviadas, ${unmatched} sem match, ${errors} erros.`
    );

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const matched = results.filter((r) => r.status === "uploaded");
  const unmatched = results.filter((r) => r.status === "unmatched");
  const errors = results.filter((r) => r.status === "error");

  return (
    <div className="container mx-auto p-4 max-w-3xl">
      <h1 className="text-2xl font-bold mb-2">Migrar Fotos de Atividades Externas</h1>
      <p className="text-muted-foreground mb-6">
        Selecione todas as fotos baixadas do sistema antigo. O sistema identifica automaticamente
        pelo nome do arquivo e vincula à atividade correta.
      </p>

      <Card className="mb-6">
        <CardContent className="p-6 text-center">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleFilesSelected}
          />

          <p className="text-sm text-muted-foreground mb-3">
            <strong>{Object.keys(FILE_MAPPING).length} fotos</strong> mapeadas para{" "}
            <strong>11 atividades</strong>
          </p>

          <Button
            size="lg"
            onClick={() => fileInputRef.current?.click()}
            disabled={migrating}
          >
            {migrating ? (
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
            ) : (
              <Upload className="w-5 h-5 mr-2" />
            )}
            {migrating ? "Enviando..." : "Selecionar Fotos do Computador"}
          </Button>

          <p className="text-xs text-muted-foreground mt-2">
            Selecione todos os arquivos de uma vez. Nomes como <code>1772132486624-9w4a4fhcx.png</code>
          </p>
        </CardContent>
      </Card>

      {results.length > 0 && (
        <div className="space-y-4">
          <div className="flex gap-4 text-sm">
            <span className="text-green-600">✅ Enviadas: <strong>{matched.length}</strong></span>
            <span className="text-orange-600">⚠️ Sem match: <strong>{unmatched.length}</strong></span>
            <span className="text-red-600">❌ Erros: <strong>{errors.length}</strong></span>
          </div>

          {matched.length > 0 && (
            <Card className="border-green-200">
              <CardContent className="p-4">
                <h3 className="font-semibold text-sm mb-2 flex items-center gap-1">
                  <CheckCircle className="w-4 h-4 text-green-600" /> Fotos vinculadas
                </h3>
                <div className="space-y-1">
                  {matched.map((r, i) => (
                    <div key={i} className="text-xs flex items-center gap-2">
                      <code className="bg-muted px-1 rounded">{r.filename}</code>
                      <span className="text-muted-foreground">→</span>
                      <span>{r.label}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {unmatched.length > 0 && (
            <Card className="border-orange-200">
              <CardContent className="p-4">
                <h3 className="font-semibold text-sm mb-2 flex items-center gap-1">
                  <AlertCircle className="w-4 h-4 text-orange-600" /> Sem correspondência
                </h3>
                <div className="space-y-1">
                  {unmatched.map((r, i) => (
                    <div key={i} className="text-xs">
                      <code className="bg-muted px-1 rounded">{r.filename}</code>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {errors.length > 0 && (
            <Card className="border-red-200">
              <CardContent className="p-4">
                <h3 className="font-semibold text-sm mb-2 flex items-center gap-1">
                  <AlertCircle className="w-4 h-4 text-red-600" /> Erros
                </h3>
                <div className="space-y-1">
                  {errors.map((r, i) => (
                    <div key={i} className="text-xs">
                      <code className="bg-muted px-1 rounded">{r.filename}</code>
                      <span className="text-red-600 ml-2">{r.error}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
};

export default MigrateAtividadeFotosPage;
