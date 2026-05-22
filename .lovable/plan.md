## Resumo Mensal do Atleta — V1 (teste Fluminense)

Feature isolada, aditiva, sem tocar em fluxos existentes (pagamentos, agenda, jogos, frequência, jornada atual).

### Escopo V1
- Card "Resumo do Mês" no topo de `GuardianJornadaPage`.
- Tela dedicada `/dashboard/jornada/resumo/:criancaId/:ano/:mes` com cabeçalho, presença, participações, mensagem emocional e botão compartilhar.
- Push notification no dia 01 de cada mês com deep link para o resumo do mês anterior.
- Liberado **apenas para responsáveis com filhos vinculados à Escolinha de Esportes Fluminense** (id `1717c373-f039-4179-9839-b749abf0b882`).

### Onde entra
- `src/pages/dashboard/guardian/GuardianJornadaPage.tsx` → renderiza `<ResumoMesCard />` acima das tabs (somente se feature liberada para a criança selecionada).
- Novos arquivos, sem alterar componentes/hook existentes:
  - `src/components/guardian/resumo-mes/ResumoMesCard.tsx` (bloco compacto na Jornada)
  - `src/components/guardian/resumo-mes/ResumoMesShareCard.tsx` (card visual exportável)
  - `src/pages/dashboard/guardian/GuardianResumoMesPage.tsx` (tela completa)
  - `src/hooks/useResumoMensal.ts` (busca dados agregados via RPC)
- Rota nova registrada em `src/pages/Dashboard.tsx` (lazy), sem alterar rotas existentes.

### Dados (apenas o que já existe)
RPC `get_resumo_mensal_atleta(p_crianca_id, p_ano, p_mes)` — SECURITY DEFINER, valida que `auth.uid()` é responsável da criança e que a criança pertence ao Fluminense. Retorna:
- Cabeçalho: nome/foto da criança, nome/logo da escolinha, mês/ano.
- Presença: aulas no mês (`aulas` filtradas por turmas da criança no período), presenças (`presencas` com presente=true), % frequência.
- Participações: amistosos (`amistoso_convocacoes` + `eventos_esportivos` no mês), campeonatos com jogos no mês (`campeonato_convocacoes` + jogos), total de jogos disputados.
- Mensagem emocional: escolhida no client por regra simples (frequência alta / participou de jogo / sem jogos etc.).

Sem alteração de schema. Apenas 1 função nova + 1 função `is_crianca_fluminense(p_crianca_id)` para gating server-side. RLS atual permanece intacto.

### Push notification (dia 01)
- Edge Function nova `resumo-mensal-push` (deno) — envia push web (VAPID já configurado) para responsáveis das crianças do Fluminense, payload com deep link `/dashboard/jornada/resumo/{criancaId}/{anoAnterior}/{mesAnterior}`.
- Cron via `pg_cron` + `pg_net`: `0 12 1 * *` chama a edge function.
- Mensagens rotativas dentre os exemplos fornecidos, personalizadas com primeiro nome da criança.
- Reaproveita infraestrutura existente de `push_subscriptions` (sem alterar). Idempotência: tabela leve `resumo_mensal_envios(crianca_id, ano, mes)` para não duplicar disparos.

### Tela de resumo (visual)
Estética esportiva, NÃO administrativa:
- Hero com gradiente da cor da escolinha, foto do atleta grande, mês em destaque tipográfico.
- Anel de progresso para % frequência.
- Cards horizontais para amistosos / campeonatos / jogos com ícones (Trophy, Swords, Goal).
- Frase emocional em itálico no rodapé do card principal.
- Botão `Compartilhar resumo` → usa `navigator.share` com imagem renderizada (html-to-image já em uso? — se não, fallback para copiar link/screenshot via canvas simples). Sem nova dep pesada: usar `html-to-image` (lib pequena) só se necessário; caso contrário botão compartilha texto + link público.

### Card na Jornada
Bloco compacto no topo:
```
RESUMO DO MÊS · MAIO 2026
Veja como foi o mês do João
[ Ver resumo ]
```
Só aparece se `is_crianca_fluminense` = true para a criança selecionada. Sem badge/aba nova no menu inferior.

### Gating Fluminense
- Client: `useResumoMensalEnabled(criancaId)` consulta vínculo com escolinha Fluminense.
- Server: RPC e edge function validam o mesmo id de escolinha. Constante única em uma migration (comment) — fácil de remover depois ao expandir.

### Garantias de não-regressão
- Nenhum hook/componente existente é editado, exceto:
  - `GuardianJornadaPage.tsx`: 1 import + 1 render condicional acima das tabs.
  - `Dashboard.tsx`: 1 lazy import + 1 `<Route>`.
- Sem mudanças em schema de tabelas existentes, RLS, ou edge functions atuais.
- Push usa fluxo VAPID já existente; novo registro de cron isolado.

### Entregáveis
1. Migration: função `is_crianca_fluminense`, função `get_resumo_mensal_atleta`, tabela `resumo_mensal_envios` (id, crianca_id, ano, mes, enviado_em — RLS admin only), cron job.
2. Edge function `resumo-mensal-push`.
3. Hook `useResumoMensal` + `useResumoMensalEnabled`.
4. Componentes `ResumoMesCard`, `ResumoMesShareCard`, página `GuardianResumoMesPage`.
5. Rota + edição mínima em `GuardianJornadaPage` e `Dashboard`.

### Fora do escopo V1
- Métricas avançadas (gols por mês, MVPs, ranking).
- Geração de imagem server-side.
- Histórico de resumos passados navegável (somente mês anterior acessível via push; pela Jornada mostra o último mês fechado).
- Liberar para outras escolas — virá depois trocando o gating por flag por escolinha.
