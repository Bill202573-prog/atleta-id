import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Loader2, UserCog, AlertCircle, Lock } from 'lucide-react';
import { toast } from 'sonner';
import {
  useGuardianProfile,
  useUpdateGuardianProfile,
  type Responsavel,
} from '@/hooks/useSchoolData';
import { validateCPF, formatCPF, cleanCPF } from '@/lib/cpf-validator';

const formatPhone = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};

const formatCEP = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
};

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

const GuardianMeusDadosCard = () => {
  const { data: guardian, isLoading } = useGuardianProfile();
  const updateMutation = useUpdateGuardianProfile();

  const [form, setForm] = useState<Partial<Responsavel>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (guardian) {
      setForm({
        nome: guardian.nome ?? '',
        telefone: guardian.telefone ?? '',
        cpf: guardian.cpf ?? '',
        cep: guardian.cep ?? '',
        rua: guardian.rua ?? '',
        numero: guardian.numero ?? '',
        complemento: guardian.complemento ?? '',
        bairro: guardian.bairro ?? '',
        cidade: guardian.cidade ?? '',
        estado: guardian.estado ?? '',
        data_nascimento: guardian.data_nascimento ?? '',
      });
    }
  }, [guardian]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (!guardian) return null;

  const cpfLocked = !!(guardian.cpf && cleanCPF(guardian.cpf).length === 11 && validateCPF(guardian.cpf));
  const cpfMissing = !guardian.cpf || cleanCPF(guardian.cpf).length !== 11;

  const handleChange = (field: keyof Responsavel, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validar CPF se preenchido
    if (form.cpf && cleanCPF(form.cpf).length > 0) {
      if (!validateCPF(form.cpf)) {
        toast.error('CPF inválido');
        return;
      }
    }

    setSaving(true);
    try {
      const payload: Partial<Responsavel> = {
        nome: form.nome?.trim() || guardian.nome,
        telefone: form.telefone?.replace(/\D/g, '') || null,
        cep: form.cep?.replace(/\D/g, '') || null,
        rua: form.rua?.trim() || null,
        numero: form.numero?.trim() || null,
        complemento: form.complemento?.trim() || null,
        bairro: form.bairro?.trim() || null,
        cidade: form.cidade?.trim() || null,
        estado: form.estado?.trim() || null,
        data_nascimento: form.data_nascimento ? form.data_nascimento : null,
      };

      // Só envia CPF se ainda não tem um válido cadastrado
      if (!cpfLocked && form.cpf) {
        payload.cpf = cleanCPF(form.cpf);
      }

      await updateMutation.mutateAsync(payload);
      toast.success('Dados atualizados com sucesso!');
    } catch (err: any) {
      console.error('Erro ao salvar:', err);
      toast.error(err?.message || 'Erro ao salvar. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UserCog className="w-5 h-5 text-primary" />
          Meus Dados
          <Badge variant="outline" className="ml-auto text-xs">Beta</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {cpfMissing && (
          <Alert className="mb-4 border-warning/50 bg-warning/10">
            <AlertCircle className="h-4 w-4 text-warning" />
            <AlertDescription className="text-sm">
              <strong>Complete seu cadastro:</strong> seu CPF é necessário para emissão das cobranças mensais.
            </AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email - readonly */}
          <div>
            <Label htmlFor="email" className="flex items-center gap-1 text-xs text-muted-foreground">
              <Lock className="w-3 h-3" />
              E-mail (não editável)
            </Label>
            <Input id="email" value={guardian.email} disabled className="bg-muted" />
          </div>

          {/* Nome */}
          <div>
            <Label htmlFor="nome">Nome completo</Label>
            <Input
              id="nome"
              value={form.nome ?? ''}
              onChange={(e) => handleChange('nome', e.target.value)}
              required
            />
          </div>

          {/* CPF */}
          <div>
            <Label htmlFor="cpf" className="flex items-center gap-1">
              CPF {cpfLocked && <Lock className="w-3 h-3 text-muted-foreground" />}
            </Label>
            <Input
              id="cpf"
              value={cpfLocked ? formatCPF(guardian.cpf!) : formatCPF(form.cpf ?? '')}
              onChange={(e) => !cpfLocked && handleChange('cpf', e.target.value)}
              disabled={cpfLocked}
              placeholder="000.000.000-00"
              className={cpfLocked ? 'bg-muted' : ''}
            />
            {cpfLocked && (
              <p className="text-xs text-muted-foreground mt-1">
                Para alterar o CPF, entre em contato com a escola.
              </p>
            )}
          </div>

          {/* Telefone */}
          <div>
            <Label htmlFor="telefone">Telefone</Label>
            <Input
              id="telefone"
              value={formatPhone(form.telefone ?? '')}
              onChange={(e) => handleChange('telefone', e.target.value)}
              placeholder="(00) 00000-0000"
            />
          </div>

          {/* Data de nascimento */}
          <div>
            <Label htmlFor="data_nascimento">Data de nascimento</Label>
            <Input
              id="data_nascimento"
              type="date"
              value={form.data_nascimento ?? ''}
              onChange={(e) => handleChange('data_nascimento', e.target.value)}
            />
          </div>

          <div className="pt-2 border-t">
            <h4 className="text-sm font-semibold mb-3 text-foreground">Endereço</h4>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="cep">CEP</Label>
                  <Input
                    id="cep"
                    value={formatCEP(form.cep ?? '')}
                    onChange={(e) => handleChange('cep', e.target.value)}
                    placeholder="00000-000"
                  />
                </div>
                <div>
                  <Label htmlFor="estado">UF</Label>
                  <select
                    id="estado"
                    value={form.estado ?? ''}
                    onChange={(e) => handleChange('estado', e.target.value)}
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                  >
                    <option value="">--</option>
                    {UFS.map((uf) => (
                      <option key={uf} value={uf}>{uf}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <Label htmlFor="rua">Rua / Logradouro</Label>
                <Input
                  id="rua"
                  value={form.rua ?? ''}
                  onChange={(e) => handleChange('rua', e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="numero">Número</Label>
                  <Input
                    id="numero"
                    value={form.numero ?? ''}
                    onChange={(e) => handleChange('numero', e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="complemento">Complemento</Label>
                  <Input
                    id="complemento"
                    value={form.complemento ?? ''}
                    onChange={(e) => handleChange('complemento', e.target.value)}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="bairro">Bairro</Label>
                <Input
                  id="bairro"
                  value={form.bairro ?? ''}
                  onChange={(e) => handleChange('bairro', e.target.value)}
                />
              </div>

              <div>
                <Label htmlFor="cidade">Cidade</Label>
                <Input
                  id="cidade"
                  value={form.cidade ?? ''}
                  onChange={(e) => handleChange('cidade', e.target.value)}
                />
              </div>
            </div>
          </div>

          <Button type="submit" disabled={saving} className="w-full">
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : (
              'Salvar alterações'
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default GuardianMeusDadosCard;
