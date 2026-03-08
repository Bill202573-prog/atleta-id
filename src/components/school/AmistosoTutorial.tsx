import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  ChevronRight,
  ChevronLeft,
  Plus,
  Users,
  UserPlus,
  Send,
  CheckCircle2,
  DollarSign,
  HelpCircle,
  Swords,
} from 'lucide-react';

interface AmistosoTutorialProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When true, shows the initial "need help?" prompt instead of jumping to tutorial */
  isCreationPrompt?: boolean;
  /** Called when user skips the tutorial (to proceed with creation) */
  onSkip?: () => void;
}

const STEPS = [
  {
    emoji: '⚽',
    icon: Swords,
    title: 'O que é um Amistoso?',
    description: 'Amistosos são jogos avulsos entre sua escola e um adversário. Aqui você agenda, convoca atletas e gerencia pagamentos.',
    details: [
      'Organize jogos fora de campeonatos',
      'Controle presença e pagamentos',
      'Notifique os pais automaticamente',
      'Registre placar e finalize o evento',
    ],
  },
  {
    emoji: '📝',
    icon: Plus,
    title: '1. Criar o Amistoso',
    description: 'Clique no botão "+ Novo Amistoso" no canto superior direito da tela.',
    details: [
      'Preencha o nome do jogo (Ex: "Sub 9 x Taquara")',
      'Selecione a data e o horário de início',
      'Informe o adversário e a categoria',
      'Adicione local e endereço para os pais saberem onde ir',
    ],
  },
  {
    emoji: '💰',
    icon: DollarSign,
    title: '2. Configurar Taxas (opcional)',
    description: 'Defina valores para cobrar dos participantes, como taxa de participação ou taxa de arbitragem.',
    details: [
      'Marque "Cobrar Taxa de Participação" e preencha o valor',
      'Marque "Cobrar Taxa de Juiz" se necessário',
      'Defina a "Data Limite para Pagamento"',
      'Atletas isentos não recebem cobrança',
    ],
  },
  {
    emoji: '📋',
    icon: UserPlus,
    title: '3. Convocar os Atletas',
    description: 'Após criar o amistoso, clique no botão "Convocar" na linha do evento.',
    details: [
      'Use o filtro de turmas para encontrar os atletas rapidamente',
      'Clique em "Todos" para selecionar todos da turma filtrada',
      'Marque individualmente os atletas que deseja convocar',
      'Use a checkbox "Isento" para atletas sem cobrança',
    ],
  },
  {
    emoji: '🚀',
    icon: Send,
    title: '4. Enviar as Convocações',
    description: 'Com os atletas selecionados, clique em "Enviar Convocações" para notificar os pais.',
    details: [
      'Os pais receberão a notificação no app',
      'Um PIX será gerado automaticamente para quem precisa pagar',
      'Atletas isentos podem confirmar participação direto no app',
      'Você pode adicionar mais atletas depois e enviar novamente',
    ],
  },
  {
    emoji: '✅',
    icon: CheckCircle2,
    title: '5. Acompanhar e Finalizar',
    description: 'Acompanhe pagamentos e presenças. Após o jogo, finalize o amistoso.',
    details: [
      'Na lista, veja quantos atletas já foram convocados',
      'Clique no amistoso para ver detalhes completos',
      'Use "Finalizar" para registrar o placar',
      'O histórico fica salvo na jornada de cada atleta',
    ],
  },
];

export function AmistosoTutorial({ open, onOpenChange, isCreationPrompt = false, onSkip }: AmistosoTutorialProps) {
  const [currentStep, setCurrentStep] = useState(-1); // -1 = prompt screen
  const [showTutorial, setShowTutorial] = useState(false);

  const isOnPrompt = isCreationPrompt && !showTutorial && currentStep === -1;
  const effectiveStep = isOnPrompt ? -1 : Math.max(currentStep, 0);
  const step = STEPS[effectiveStep] || STEPS[0];
  const isLast = effectiveStep === STEPS.length - 1;
  const isFirst = effectiveStep === 0;
  const StepIcon = step.icon;

  const handleClose = () => {
    setCurrentStep(-1);
    setShowTutorial(false);
    onOpenChange(false);
  };

  const handleStartTutorial = () => {
    setShowTutorial(true);
    setCurrentStep(0);
  };

  const handleSkipTutorial = () => {
    handleClose();
    onSkip?.();
  };

  // Reset state when dialog opens
  if (!open && (currentStep !== -1 || showTutorial)) {
    setCurrentStep(-1);
    setShowTutorial(false);
  }

  // If not a creation prompt, go directly to tutorial content
  if (open && !isCreationPrompt && currentStep === -1 && !showTutorial) {
    setCurrentStep(0);
    setShowTutorial(true);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md mx-auto">
        {isOnPrompt ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-center text-lg">
                Novo Amistoso
              </DialogTitle>
            </DialogHeader>
            <div className="text-center space-y-4 py-4">
              <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <HelpCircle className="w-8 h-8 text-primary" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-foreground">Precisa de ajuda?</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  É sua primeira vez criando um amistoso? Podemos te guiar pelo processo passo a passo.
                </p>
              </div>
              <div className="flex flex-col gap-2 pt-2">
                <Button onClick={handleStartTutorial} className="w-full gap-2">
                  <HelpCircle className="w-4 h-4" />
                  Sim, quero ver o tutorial
                </Button>
                <Button variant="outline" onClick={handleSkipTutorial} className="w-full">
                  Não preciso, criar amistoso agora
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                💡 A qualquer momento você pode clicar em "Precisa de ajuda? Clique aqui" para acessar o tutorial.
              </p>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-center text-lg">
                Como usar os Amistosos
              </DialogTitle>
            </DialogHeader>

            {/* Step indicator */}
            <div className="flex items-center justify-center gap-1.5 mb-2">
              {STEPS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentStep(i)}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i === effectiveStep
                      ? 'w-6 bg-primary'
                      : i < effectiveStep
                        ? 'w-1.5 bg-primary/50'
                        : 'w-1.5 bg-muted-foreground/30'
                  }`}
                />
              ))}
            </div>

            {/* Step content */}
            <div className="rounded-xl border border-border bg-card p-5 min-h-[260px] flex flex-col">
              <div className="text-center mb-4">
                <span className="text-3xl mb-2 block">{step.emoji}</span>
                <div className="inline-flex items-center gap-1.5 text-xs font-medium text-primary bg-primary/10 px-3 py-1 rounded-full mb-2">
                  {isFirst ? 'Introdução' : `Passo ${effectiveStep} de ${STEPS.length - 1}`}
                </div>
                <h3 className="text-base font-bold text-foreground">{step.title}</h3>
                <p className="text-sm text-muted-foreground mt-1">{step.description}</p>
              </div>

              <ul className="space-y-2 flex-1">
                {step.details.map((detail, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm">
                    <span className="mt-0.5 w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold flex-shrink-0">
                      {i + 1}
                    </span>
                    <span className="text-foreground">{detail}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Navigation */}
            <div className="flex items-center gap-3">
              {!isFirst && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={() => setCurrentStep(effectiveStep - 1)}
                >
                  <ChevronLeft className="w-4 h-4" />
                  Voltar
                </Button>
              )}

              {isLast ? (
                <Button size="sm" className="flex-1 gap-2" onClick={isCreationPrompt ? handleSkipTutorial : handleClose}>
                  {isCreationPrompt ? 'Entendi! Criar amistoso' : 'Entendi!'}
                  <CheckCircle2 className="w-4 h-4" />
                </Button>
              ) : (
                <Button size="sm" className="flex-1 gap-2" onClick={() => setCurrentStep(effectiveStep + 1)}>
                  Próximo
                  <ChevronRight className="w-4 h-4" />
                </Button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}