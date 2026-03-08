import { useState, useContext } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { AuthContext } from "@/contexts/auth-context";
import { Upload, CheckCircle, AlertCircle, Loader2 } from "lucide-react";

interface ImportResult {
  imported: number;
  skipped: number;
  errors: Array<{ email: string; error: string }>;
  total: number;
}

const ImportUsersPage = () => {
  const auth = useContext(AuthContext);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!auth?.user || auth.user.role !== "admin") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Acesso restrito a administradores.</p>
      </div>
    );
  }

  const handleImport = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const text = await file.text();
      const json = JSON.parse(text);

      const { data, error: fnError } = await supabase.functions.invoke("import-auth-users", {
        body: { users: json.users },
      });

      if (fnError) throw fnError;
      setResult(data as ImportResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao importar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 flex items-start justify-center">
      <Card className="w-full max-w-lg mt-12">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Importar Usuários
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            type="file"
            accept=".json"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />

          <Button onClick={handleImport} disabled={!file || loading} className="w-full">
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {loading ? "Importando..." : "Importar"}
          </Button>

          {error && (
            <div className="flex items-start gap-2 text-destructive text-sm p-3 bg-destructive/10 rounded-lg">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          {result && (
            <div className="space-y-3 p-4 bg-muted rounded-lg">
              <div className="flex items-center gap-2 text-sm font-medium">
                <CheckCircle className="h-4 w-4 text-green-600" />
                Importação concluída
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-sm">
                <div className="p-2 bg-background rounded">
                  <div className="text-lg font-bold text-green-600">{result.imported}</div>
                  <div className="text-muted-foreground">Importados</div>
                </div>
                <div className="p-2 bg-background rounded">
                  <div className="text-lg font-bold text-yellow-600">{result.skipped}</div>
                  <div className="text-muted-foreground">Pulados</div>
                </div>
                <div className="p-2 bg-background rounded">
                  <div className="text-lg font-bold text-destructive">{result.errors.length}</div>
                  <div className="text-muted-foreground">Erros</div>
                </div>
              </div>
              {result.errors.length > 0 && (
                <div className="text-xs space-y-1 max-h-40 overflow-y-auto">
                  {result.errors.map((e, i) => (
                    <div key={i} className="text-destructive">
                      {e.email}: {e.error}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ImportUsersPage;
