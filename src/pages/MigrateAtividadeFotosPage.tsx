import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Upload, CheckCircle, Loader2, AlertCircle, ImagePlus } from "lucide-react";
import { toast } from "sonner";

// Mapping: filename → { activityId, fullPath, label }
const FILE_MAPPING: Record<string, { activityId: string; fullPath: string; label: string }> = {
  "1772132486624-9w4a4fhcx.png": { activityId: "34e0cebc-3a6b-4b3d-bc82-5bb8226b13df", fullPath: "89c8bf37-31fd-4b60-b376-757d00e5a098/1772132486624-9w4a4fhcx.png", label: "David - Competição 01/12" },
  "1772132436057-hftcy2tvw.png": { activityId: "dbe9fef9-1c5c-44d2-bb53-6a06714904fe", fullPath: "89c8bf37-31fd-4b60-b376-757d00e5a098/1772132436057-hftcy2tvw.png", label: "David - Treino 02/01" },
  "1771894177589-lk2dn1bij.png": { activityId: "c240e3fd-fc33-46cc-b603-5b92f4f70ddc", fullPath: "a67a6e1b-e33f-4c2e-85a5-b5d29fdfbc05/1771894177589-lk2dn1bij.png", label: "Cristiano - Clínica 05/02" },
  "1770916869147-58vkeerfd.jpg": { activityId: "7692c1e2-2d4c-4419-8518-b08c5ee2f04c", fullPath: "b196c67a-1983-4456-92fc-89609d22fb52/1770916869147-58vkeerfd.jpg", label: "Miguel - Competição 14/12" },
  "1770916302277-pz965hi4o.jpg": { activityId: "504a06bb-e47d-493a-b488-4aef1c7f0ab0", fullPath: "b196c67a-1983-4456-92fc-89609d22fb52/1770916302277-pz965hi4o.jpg", label: "Miguel - Treino 20/01" },
  "1770916304103-8kz0m9qfk.jpg": { activityId: "504a06bb-e47d-493a-b488-4aef1c7f0ab0", fullPath: "b196c67a-1983-4456-92fc-89609d22fb52/1770916304103-8kz0m9qfk.jpg", label: "Miguel - Treino 20/01" },
  "1770916305842-2udzya3um.jpg": { activityId: "504a06bb-e47d-493a-b488-4aef1c7f0ab0", fullPath: "b196c67a-1983-4456-92fc-89609d22fb52/1770916305842-2udzya3um.jpg", label: "Miguel - Treino 20/01" },
  "1770915990598-okwdzz9ft.jpg": { activityId: "8afb46c9-31ba-416e-99fd-603544ac0b42", fullPath: "b196c67a-1983-4456-92fc-89609d22fb52/1770915990598-okwdzz9ft.jpg", label: "Miguel - Clínica 30/01" },
  "1770915993521-d4ckkei1x.jpg": { activityId: "8afb46c9-31ba-416e-99fd-603544ac0b42", fullPath: "b196c67a-1983-4456-92fc-89609d22fb52/1770915993521-d4ckkei1x.jpg", label: "Miguel - Clínica 30/01" },
  "1770915995164-j4tuyuchs.jpg": { activityId: "8afb46c9-31ba-416e-99fd-603544ac0b42", fullPath: "b196c67a-1983-4456-92fc-89609d22fb52/1770915995164-j4tuyuchs.jpg", label: "Miguel - Clínica 30/01" },
  "1770321004212-z8xlzkf4a.jpg": { activityId: "9cfcbb8e-394d-4f49-91da-8c62096eedf5", fullPath: "e1277a26-c847-483b-a3f9-e76fad2ce8ac/1770321004212-z8xlzkf4a.jpg", label: "Guilherme - Clínica 29/01" },
  "1770321060323-d41bnhfpn.jpg": { activityId: "9cfcbb8e-394d-4f49-91da-8c62096eedf5", fullPath: "e1277a26-c847-483b-a3f9-e76fad2ce8ac/1770321060323-d41bnhfpn.jpg", label: "Guilherme - Clínica 29/01" },
  "1770321061436-wlilmzq9m.jpg": { activityId: "9cfcbb8e-394d-4f49-91da-8c62096eedf5", fullPath: "e1277a26-c847-483b-a3f9-e76fad2ce8ac/1770321061436-wlilmzq9m.jpg", label: "Guilherme - Clínica 29/01" },
  "1770322673737-mg7ydg2a5.jpg": { activityId: "0fe1f34b-05b9-4ede-88bf-71e9cd8c4bf1", fullPath: "e1277a26-c847-483b-a3f9-e76fad2ce8ac/1770322673737-mg7ydg2a5.jpg", label: "Guilherme - Treino 02/01" },
  "1770322675235-lefrkdz0x.jpg": { activityId: "0fe1f34b-05b9-4ede-88bf-71e9cd8c4bf1", fullPath: "e1277a26-c847-483b-a3f9-e76fad2ce8ac/1770322675235-lefrkdz0x.jpg", label: "Guilherme - Treino 02/01" },
  "1770325021242-ty3wt1ucl.jpg": { activityId: "553ec2c0-b6e4-4a0f-ac13-b1bf4a57e7a3", fullPath: "e1277a26-c847-483b-a3f9-e76fad2ce8ac/1770325021242-ty3wt1ucl.jpg", label: "Guilherme - Avaliação 05/02" },
  "1770061431486-hknk3d320.jpg": { activityId: "55315eca-1b88-41a0-a688-528ed9981929", fullPath: "ed3e3083-7455-452d-b7ac-6734c191adf4/1770061431486-hknk3d320.jpg", label: "João Guilherme - Competição 11/10" },
  "1770061478287-ku66ja0rv.jpg": { activityId: "55315eca-1b88-41a0-a688-528ed9981929", fullPath: "ed3e3083-7455-452d-b7ac-6734c191adf4/1770061478287-ku66ja0rv.jpg", label: "João Guilherme - Competição 11/10" },
  "1770062483967-piju49o12.jpg": { activityId: "55315eca-1b88-41a0-a688-528ed9981929", fullPath: "ed3e3083-7455-452d-b7ac-6734c191adf4/1770062483967-piju49o12.jpg", label: "João Guilherme - Competição 11/10" },
  "1770062801529-4yeokx9ms.jpg": { activityId: "43bcbf0e-fe01-4c4f-8cf9-617f3f16bac6", fullPath: "ed3e3083-7455-452d-b7ac-6734c191adf4/1770062801529-4yeokx9ms.jpg", label: "João Guilherme - Competição 18/10" },
  "1770063490724-o0c20foa9.jpg": { activityId: "43bcbf0e-fe01-4c4f-8cf9-617f3f16bac6", fullPath: "ed3e3083-7455-452d-b7ac-6734c191adf4/1770063490724-o0c20foa9.jpg", label: "João Guilherme - Competição 18/10" },
};

// Group by activity for display
const ACTIVITIES = Object.entries(
  Object.entries(FILE_MAPPING).reduce((acc, [filename, info]) => {
    if (!acc[info.activityId]) {
      acc[info.activityId] = { label: info.label, files: [] };
    }
    acc[info.activityId].files.push({ filename, fullPath: info.fullPath });
    return acc;
  }, {} as Record<string, { label: string; files: { filename: string; fullPath: string }[] }>)
);

type FileStatus = "pending" | "uploading" | "done" | "error";

const STORAGE_KEY = "migrate-fotos-done";

const loadDoneFromStorage = (): Record<string, { status: FileStatus }> => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return {};
    const arr = JSON.parse(saved) as string[];
    return Object.fromEntries(arr.map((f) => [f, { status: "done" as FileStatus }]));
  } catch { return {}; }
};

const saveDoneToStorage = (statuses: Record<string, { status: FileStatus; error?: string }>) => {
  const doneFiles = Object.entries(statuses).filter(([, s]) => s.status === "done").map(([f]) => f);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(doneFiles));
};

const MigrateAtividadeFotosPage = () => {
  const [fileStatuses, setFileStatuses] = useState<Record<string, { status: FileStatus; error?: string }>>(loadDoneFromStorage);

  const syncDoneFromServer = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(
        `https://vxzktyklzkfqitptzctk.supabase.co/functions/v1/migrate-atividade-fotos`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${session.access_token}` },
        }
      );

      if (!res.ok) return;
      const result = await res.json();
      const uploaded = new Set<string>((result.activities || []).flatMap((a: { fotos_urls?: string[] }) => a.fotos_urls || []));

      const doneFromServer: Record<string, { status: FileStatus }> = {};
      Object.entries(FILE_MAPPING).forEach(([filename, info]) => {
        if (uploaded.has(info.fullPath)) {
          doneFromServer[filename] = { status: "done" };
        }
      });

      setFileStatuses((prev) => {
        const next = { ...prev, ...doneFromServer };
        saveDoneToStorage(next);
        return next;
      });
    } catch {
      // silent sync failure
    }
  };

  useEffect(() => {
    void syncDoneFromServer();
  }, []);

  const handleUpload = async (filename: string, file: File) => {
    const mapping = FILE_MAPPING[filename];
    if (!mapping) {
      toast.error(`Arquivo "${filename}" não está no mapeamento`);
      return;
    }

    setFileStatuses((prev) => {
      const next = { ...prev, [filename]: { status: "uploading" as FileStatus } };
      return next;
    });

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Não autenticado");

      // Upload via edge function (has service role)
      const formData = new FormData();
      formData.append("atividadeId", mapping.activityId);
      formData.append("targetPath", mapping.fullPath);
      formData.append("file", file);

      const res = await fetch(
        `https://vxzktyklzkfqitptzctk.supabase.co/functions/v1/migrate-atividade-fotos`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}` },
          body: formData,
        }
      );

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Erro no upload");

      setFileStatuses((prev) => {
        const next = { ...prev, [filename]: { status: "done" as FileStatus } };
        saveDoneToStorage(next);
        return next;
      });
      toast.success(`✅ ${filename} → ${mapping.label}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro";
      setFileStatuses((prev) => ({ ...prev, [filename]: { status: "error", error: msg } }));
      toast.error(`❌ ${filename}: ${msg}`);
    }
  };

  const handleFileSelect = (expectedFilename: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Match by base name (ignore extension - old system may have converted formats)
    const expectedBase = expectedFilename.replace(/\.[^.]+$/, "");
    const actualBase = file.name.replace(/\.[^.]+$/, "");

    if (actualBase !== expectedBase) {
      toast.error(`Esperado: ${expectedBase}.*, recebido: ${file.name}`);
      e.target.value = "";
      return;
    }

    handleUpload(expectedFilename, file);
    e.target.value = "";
  };

  const doneCount = Object.values(fileStatuses).filter((s) => s.status === "done").length;
  const totalCount = Object.keys(FILE_MAPPING).length;

  return (
    <div className="container mx-auto p-4 max-w-3xl">
      <h1 className="text-2xl font-bold mb-2">Migrar Fotos de Atividades Externas</h1>
      <p className="text-muted-foreground mb-1">
        Clique no botão de cada foto e selecione o arquivo correspondente do seu computador.
      </p>
      <p className="text-sm font-medium mb-6">
        Progresso: <span className="text-green-600">{doneCount}</span> / {totalCount}
      </p>

      <div className="space-y-6">
        {ACTIVITIES.map(([activityId, { label, files }]) => {
          const allDone = files.every((f) => fileStatuses[f.filename]?.status === "done");

          return (
            <Card key={activityId} className={allDone ? "border-green-300 bg-green-50/50" : ""}>
              <CardContent className="p-4">
                <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                  {allDone && <CheckCircle className="w-4 h-4 text-green-600" />}
                  {label}
                  <span className="text-xs text-muted-foreground font-normal">
                    ({files.length} foto{files.length > 1 ? "s" : ""})
                  </span>
                </h3>

                <div className="space-y-2">
                  {files.map(({ filename }) => {
                    const st = fileStatuses[filename];
                    return (
                      <div key={filename} className="flex items-center gap-2">
                        <input
                          id={`migrate-file-${filename}`}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleFileSelect(filename)}
                          disabled={st?.status === "uploading" || st?.status === "done"}
                        />

                        <label htmlFor={`migrate-file-${filename}`} className="shrink-0">
                          <Button
                            type="button"
                            size="sm"
                            variant={st?.status === "done" ? "outline" : "default"}
                            disabled={st?.status === "uploading" || st?.status === "done"}
                            className="shrink-0"
                          >
                            {st?.status === "uploading" ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : st?.status === "done" ? (
                              <CheckCircle className="w-4 h-4 text-green-600" />
                            ) : st?.status === "error" ? (
                              <AlertCircle className="w-4 h-4 text-red-600" />
                            ) : (
                              <ImagePlus className="w-4 h-4" />
                            )}
                          </Button>
                        </label>

                        <code className="text-xs bg-muted px-2 py-1 rounded truncate flex-1">
                          {filename}
                        </code>

                        {st?.status === "error" && (
                          <span className="text-xs text-red-600">{st.error}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default MigrateAtividadeFotosPage;
