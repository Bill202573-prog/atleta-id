

## Respostas e Plano

### 1. "Encerrar Jogo Definitivamente" — O que acontece?

**O que faz:**
- Muda o status do evento de `realizado` → `finalizado`
- É apenas um `UPDATE` no campo `status` da tabela `eventos_esportivos`

**Impacto de encerrar:**
- Todas as seções (gols, premiações, conquistas, times) passam a receber `isReadOnly={true}`, bloqueando edições
- O botão "Encerrar" desaparece (só aparece quando `status === 'realizado'`)
- O jogo fica apenas para consulta

**Impacto de NÃO encerrar (manter como "realizado"):**
- O jogo continua editável — pode adicionar/remover gols, premiações, atletas
- Funciona como um rascunho salvo
- **Não há impacto negativo** nos dados dos atletas — gols, presenças e premiações já são registrados no momento do "Lançar Placar" (status `realizado`), não no "Encerrar"
- O único risco é alguém editar acidentalmente depois

**Registros no app dos atletas:**
Os dados aparecem corretamente no app do responsável porque:
- Participação: registrada em `evento_time_alunos` + `amistoso_convocacoes` (campo `presente`)
- Gols: registrados em `evento_gols` com `crianca_id`
- Premiações: registradas em `evento_premiacoes` com `crianca_id`
- O hook `useAlunoHistoricoData` busca tudo isso e monta o histórico
- Os dados ficam disponíveis assim que o placar é lançado (status `realizado`), **independente** de encerrar ou não

**Resumo:** O botão "Encerrar" é apenas um "cadeado" — trava edições. Todos os registros de participação, gols e premiações já são gravados ao lançar o placar.

---

### 2. Push de Aniversariantes + Popup na Chamada

#### Parte A: Edge Function de Push de Aniversário

Adicionar uma seção `BIRTHDAY` no `process-push-reminders/index.ts`:

- Para cada escola com push ativo, buscar crianças ativas cujo `data_nascimento` tenha dia/mês = hoje
- Enviar push para o **responsável do atleta**: "🎂 Parabéns! Hoje é o aniversário do(a) {nome}! Desejamos um dia incrível cheio de alegria e conquistas!"
- Enviar push para o **admin da escola**: "🎂 Aniversariante do dia! Hoje é aniversário do(a) {nome}! Já enviamos uma mensagem de felicitação."
- Usar `alreadySent` com tipo `aniversario` para não duplicar
- Habilitar para Bandeirantes e escolas de teste

#### Parte B: Popup de Aniversariantes na Chamada

No `SchoolChamadaPage.tsx`, ao abrir uma aula:

- Buscar alunos daquela aula cujo aniversário cai **naquela semana** (seg-dom)
- Exibir um popup/banner destacado com:
  - 🎂 Aniversariantes da semana
  - Lista com avatar, nome, data do aniversário, e badge "Hoje!" se for no dia
- O popup aparece automaticamente ao selecionar a aula, pode ser fechado

### Arquivos a modificar

| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/process-push-reminders/index.ts` | Adicionar seção BIRTHDAY com push para responsável + admin |
| `src/pages/dashboard/school/SchoolChamadaPage.tsx` | Adicionar popup de aniversariantes da semana ao abrir aula |
| `src/hooks/useSchoolData.ts` | Adicionar helper `isBirthdayThisWeek` |

