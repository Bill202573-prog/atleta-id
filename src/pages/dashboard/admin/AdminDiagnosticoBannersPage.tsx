import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';

interface Row {
  banner_id: string;
  titulo: string;
  posicao: string;
  ativo: boolean;
  inicio_em: string | null;
  fim_em: string | null;
  segmentado_para: string[];
  user_escolas: string[];
  visivel_para_user: boolean;
}

export default function AdminDiagnosticoBannersPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);

  const handleCheck = async () => {
    if (!email.trim()) return;
    setLoading(true);
    setRows(null);
    const { data, error } = await supabase.rpc('debug_banners_for_user' as any, {
      p_email: email.trim(),
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setRows((data as Row[]) ?? []);
  };

  const userEscolas = rows && rows.length > 0 ? rows[0].user_escolas : [];

  return (
    <div className="container mx-auto max-w-5xl px-4 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Diagnóstico de Banners</h1>
        <p className="text-muted-foreground text-sm">
          Verifique exatamente quais banners um responsável consegue ver, conforme o filtro de escola
          (RLS) aplicado pelo servidor.
        </p>
      </div>

      <Card className="p-4 flex flex-col sm:flex-row gap-3">
        <Input
          placeholder="email@exemplo.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCheck()}
        />
        <Button onClick={handleCheck} disabled={loading || !email.trim()}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Verificar
        </Button>
      </Card>

      {rows && (
        <Card className="p-4 space-y-4">
          <div>
            <div className="text-sm text-muted-foreground">Escolas vinculadas a este responsável:</div>
            <div className="flex flex-wrap gap-2 mt-2">
              {userEscolas.length === 0 ? (
                <Badge variant="outline">Nenhuma escola</Badge>
              ) : (
                userEscolas.map((e) => (
                  <Badge key={e} variant="secondary">{e}</Badge>
                ))
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="p-2">Banner</th>
                  <th className="p-2">Posição</th>
                  <th className="p-2">Ativo</th>
                  <th className="p-2">Segmentado para</th>
                  <th className="p-2">Vê?</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">
                    Nenhum banner cadastrado.
                  </td></tr>
                )}
                {rows.map((r) => (
                  <tr key={r.banner_id} className="border-b">
                    <td className="p-2 font-medium">{r.titulo}</td>
                    <td className="p-2">{r.posicao}</td>
                    <td className="p-2">{r.ativo ? 'Sim' : 'Não'}</td>
                    <td className="p-2">
                      {r.segmentado_para.length === 0 ? (
                        <span className="text-muted-foreground">Todas as escolas</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {r.segmentado_para.map((s) => (
                            <Badge key={s} variant="outline" className="text-xs">{s}</Badge>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="p-2">
                      {r.visivel_para_user ? (
                        <span className="inline-flex items-center gap-1 text-green-600">
                          <CheckCircle2 className="w-4 h-4" /> Sim
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <XCircle className="w-4 h-4" /> Não
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-muted-foreground">
            Dica: se o responsável ainda vê banners que não deveria, peça para ele fechar e abrir o app
            novamente (o cache local do PWA pode segurar resultados antigos por alguns minutos).
          </p>
        </Card>
      )}
    </div>
  );
}
