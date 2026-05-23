import { useNavigate, useLocation } from 'react-router-dom';
import { MobileGuardianLayout } from '@/components/layout/MobileGuardianLayout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  ArrowLeft,
  Share2,
  Trophy,
  Swords,
  Goal,
  Calendar,
  Loader2,
} from 'lucide-react';
import {
  useResumoMensal,
  useResumoMensalEnabled,
  NOMES_MESES,
  mensagemEmocional,
} from '@/hooks/useResumoMensal';
import { toast } from 'sonner';
import { useSignedUrl } from '@/hooks/useSignedUrl';

const GuardianResumoMesPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  // Path: /dashboard/jornada/resumo/:criancaId/:ano/:mes
  const parts = location.pathname.split('/').filter(Boolean);
  const idx = parts.indexOf('resumo');
  const criancaId = idx >= 0 ? parts[idx + 1] : undefined;
  const ano = idx >= 0 ? parts[idx + 2] : undefined;
  const mes = idx >= 0 ? parts[idx + 3] : undefined;

  const cId = criancaId || '';
  const aNum = Number(ano);
  const mNum = Number(mes);

  const { data: enabled, isLoading: enabledLoading } = useResumoMensalEnabled(cId);
  const { data, isLoading, error } = useResumoMensal(
    enabled ? cId : null,
    aNum,
    mNum,
  );
  const fotoResolvida = useSignedUrl(data?.crianca?.foto_url, 'child-photos');

  const handleShare = async () => {
    if (!data) return;
    const texto =
      `📊 Resumo de ${NOMES_MESES[data.mes - 1]} ${data.ano}\n` +
      `${data.crianca.nome} · ${data.escola.nome}\n\n` +
      `⚽ ${data.presenca.aulas_total} aulas | ${data.presenca.aulas_presentes} presenças (${data.presenca.percentual}%)\n` +
      `🏆 ${data.participacoes.amistosos} amistoso(s) · ${data.participacoes.campeonatos} campeonato(s) · ${data.participacoes.jogos} jogo(s)`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Resumo do mês', text: texto });
      } else {
        await navigator.clipboard.writeText(texto);
        toast.success('Resumo copiado!');
      }
    } catch (e) {
      // user cancelled — silent
    }
  };

  if (enabledLoading || isLoading) {
    return (
      <MobileGuardianLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </MobileGuardianLayout>
    );
  }

  if (!enabled) {
    return (
      <MobileGuardianLayout>
        <div className="p-6 text-center">
          <p className="text-muted-foreground">Recurso indisponível para esta conta.</p>
          <Button variant="link" onClick={() => navigate('/dashboard/jornada')}>
            Voltar à Jornada
          </Button>
        </div>
      </MobileGuardianLayout>
    );
  }

  if (error || !data) {
    return (
      <MobileGuardianLayout>
        <div className="p-6 text-center">
          <p className="text-destructive mb-3">Não foi possível carregar o resumo.</p>
          <Button variant="outline" onClick={() => navigate('/dashboard/jornada')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar
          </Button>
        </div>
      </MobileGuardianLayout>
    );
  }

  const mesNome = NOMES_MESES[data.mes - 1];
  const pct = data.presenca.percentual;
  const radius = 52;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (pct / 100) * circ;
  const msg = mensagemEmocional(data);

  return (
    <MobileGuardianLayout>
      <div className="pb-10 animate-fade-in">
        {/* Top nav */}
        <div className="px-4 pt-3">
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2"
            onClick={() => navigate('/dashboard/jornada')}
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Jornada
          </Button>
        </div>

        {/* HERO */}
        <div className="relative mx-4 mt-2 rounded-2xl overflow-hidden bg-gradient-to-br from-primary via-primary to-primary/70 text-primary-foreground shadow-lg">
          <div className="absolute inset-0 opacity-10 pointer-events-none"
               style={{ backgroundImage: 'radial-gradient(circle at 20% 20%, white 1px, transparent 1px)', backgroundSize: '14px 14px' }} />
          <div className="relative p-5 flex flex-col items-center text-center">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] opacity-80 mb-1">
              <Calendar className="w-3.5 h-3.5" />
              Resumo Mensal
            </div>
            <h1 className="text-3xl font-extrabold leading-tight">
              {mesNome.toUpperCase()}
              <span className="opacity-70 font-bold"> · {data.ano}</span>
            </h1>

            <div className="mt-4 flex items-center gap-3">
              <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm overflow-hidden flex items-center justify-center text-2xl font-bold ring-2 ring-white/40">
                {fotoResolvida ? (
                  <img
                    src={fotoResolvida}
                    alt={data.crianca.nome}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  (data.crianca.nome || '?').charAt(0).toUpperCase()
                )}
              </div>
              <div className="text-left">
                <p className="font-semibold text-base leading-tight">{data.crianca.nome}</p>
                <div className="flex items-center gap-1.5 text-xs opacity-90 mt-0.5">
                  {data.escola.logo_url && (
                    <img
                      src={data.escola.logo_url}
                      alt=""
                      className="w-4 h-4 rounded-full object-cover bg-white"
                    />
                  )}
                  <span>{data.escola.nome}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Presença */}
        <Card className="mx-4 mt-4 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Presença
          </p>
          <div className="flex items-center gap-5">
            <div className="relative w-32 h-32 shrink-0">
              <svg viewBox="0 0 120 120" className="w-32 h-32 -rotate-90">
                <circle
                  cx="60"
                  cy="60"
                  r={radius}
                  stroke="hsl(var(--muted))"
                  strokeWidth="10"
                  fill="none"
                />
                <circle
                  cx="60"
                  cy="60"
                  r={radius}
                  stroke="hsl(var(--primary))"
                  strokeWidth="10"
                  strokeLinecap="round"
                  fill="none"
                  strokeDasharray={circ}
                  strokeDashoffset={offset}
                  className="transition-all duration-700"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-extrabold text-foreground">{pct}%</span>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Frequência
                </span>
              </div>
            </div>
            <div className="flex-1 space-y-2">
              <div>
                <p className="text-2xl font-bold text-foreground leading-none">
                  {data.presenca.aulas_total}
                </p>
                <p className="text-xs text-muted-foreground">Aulas realizadas</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground leading-none">
                  {data.presenca.aulas_presentes}
                </p>
                <p className="text-xs text-muted-foreground">Presenças</p>
              </div>
            </div>
          </div>
        </Card>

        {/* Participações */}
        <Card className="mx-4 mt-4 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Participações
          </p>
          {data.participacoes.amistosos === 0 &&
          data.participacoes.campeonatos === 0 &&
          data.participacoes.jogos === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              Nenhum amistoso ou campeonato no período.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <ParticipacaoItem
                icon={<Swords className="w-5 h-5" />}
                label="Amistosos"
                value={data.participacoes.amistosos}
              />
              <ParticipacaoItem
                icon={<Trophy className="w-5 h-5" />}
                label="Campeonatos"
                value={data.participacoes.campeonatos}
              />
              <ParticipacaoItem
                icon={<Goal className="w-5 h-5" />}
                label="Jogos"
                value={data.participacoes.jogos}
              />
            </div>
          )}
        </Card>

        {/* Mensagem emocional */}
        <Card className="mx-4 mt-4 p-5 bg-gradient-to-br from-muted/40 to-transparent border-dashed">
          <p className="text-base italic text-foreground leading-relaxed text-center">
            "{msg}"
          </p>
        </Card>

        {/* Compartilhar */}
        <div className="mx-4 mt-5">
          <Button onClick={handleShare} className="w-full gap-2" size="lg">
            <Share2 className="w-4 h-4" />
            Compartilhar resumo
          </Button>
        </div>
      </div>
    </MobileGuardianLayout>
  );
};

function ParticipacaoItem({
  icon, label, value,
}: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex flex-col items-center text-center p-3 rounded-xl bg-muted/40">
      <div className="text-primary mb-1">{icon}</div>
      <div className="text-2xl font-bold text-foreground leading-none">{value}</div>
      <div className="text-[11px] text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

export default GuardianResumoMesPage;
