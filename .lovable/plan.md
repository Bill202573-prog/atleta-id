# Plano: Logs de Login, Fluxo de Cobrança e Push por Padrão

## 1. Por que o painel "tentativas com falha" está vazio hoje

A edge function `admin-auth-failures` tenta consultar a Management API da Supabase usando o `SUPABASE_SERVICE_ROLE_KEY` como bearer — ela exige um Personal Access Token (PAT) real. A chamada falha silenciosamente e cai no fallback que retorna `{ failures: [] }`, daí "Nenhuma tentativa registrada".

Solução: parar de depender da Management API e passar a **registrar nós mesmos cada tentativa** (sucesso e falha), com motivo, no banco. Assim conseguimos ver tudo, por escola, por usuário, com timeline.

## 2. O que vou construir

### A. Tabela `login_attempts`
Campos: `email`, `user_id` (quando identificável), `escolinha_id` (quando identificável), `success` (bool), `failure_reason` (texto: "senha_incorreta", "usuario_inexistente", "email_nao_confirmado", "rate_limited", "outro"), `error_message` (texto bruto), `ip`, `user_agent`, `attempted_at`.

RLS: somente `admin` pode ler. Inserção feita por edge function com service role.

### B. Edge function `log-login-attempt` (pública, `verify_jwt = false`)
Recebe `{ email, success, error_message }` do `Auth.tsx`. Resolve `user_id` e `escolinha_id` a partir do email (via `auth.users` + `responsaveis` / `professores` / `escolinhas`). Classifica `failure_reason` a partir da mensagem do Supabase ("Invalid login credentials" → senha_incorreta, "Email not confirmed" → email_nao_confirmado, etc).

### C. Instrumentar `AuthContext.login` e `Auth.tsx`
Após `signInWithPassword`, chamar `log-login-attempt` com sucesso/falha e a mensagem original. Também registrar quando o usuário entra mas fica sem `role` (caso já corrigido) como `success=true, failure_reason='sem_role'`.

### D. Reformular o card "Tentativas de login" no `SaudeEscolaTab`
- Trocar a chamada `admin-auth-failures` por uma query direta a `login_attempts` filtrada por `escolinha_id` (últimos 30 dias).
- Mostrar três blocos: **Sucessos**, **Falhas com motivo**, **Emails desconhecidos** (tentativas com email que não bate com nenhum usuário da escola).
- Para cada linha: data, email, motivo (badge colorido), mensagem original, IP.
- Filtro rápido: só falhas / só sucessos / todos.
- Manter o card de "Acessos (30 dias)" que já existe (vem de `acessos_log`, é só logins com sucesso autenticado).

### E. Aposentar/limpar `admin-auth-failures`
Reescrever para apenas ler `login_attempts` (mantendo o nome para não quebrar nada) ou remover a invocação e ler do client direto. Vou pelo caminho de ler do client direto (mais simples e em tempo real).

## 3. Fluxo de cobrança — quem recebeu, quem pagou, quem não pagou

O card "Cobranças" hoje só mostra contadores. Vou expandir, sem mexer em lógica de geração:

### Novo card "Detalhe de Cobranças do Mês" no `SaudeEscolaTab`
Lendo `mensalidades` + `criancas` + `crianca_responsavel` + `responsaveis` para o `escolinha_id` e `mes_referencia` atual:

- **Pagas**: lista de criança → responsável → data de pagamento → valor.
- **Pendentes (em dia)**: cobrança gerada no Asaas, ainda no prazo. Mostrar vencimento e link Asaas se houver.
- **Vencidas**: dias de atraso por aluno.
- **Sem cobrança gerada**: alunos ativos do mês sem mensalidade (gap de geração).
- **Falha Asaas**: mensalidade existe mas `asaas_payment_id` nulo (já temos, só amplio com botão "Reprocessar" que invoca a função existente de geração).
- **Push de cobrança enviado?**: cruzar com `push_notifications_log` (tipo cobrança) para ver se o responsável recebeu lembrete.

Tudo agrupado em `<Collapsible>` para não poluir e exportável em CSV (botão simples no card).

## 4. Por que tantos responsáveis aparecem "sem push" e como resolver

### Diagnóstico (varredura)
`PushAutoSubscribe.tsx` hoje **NÃO pede permissão para responsáveis** — só para `role === 'school'`. Para guardian, ele só registra a subscription se a permissão já estiver `granted` no navegador. Como a maioria dos pais nunca recebeu o pop-up, `Notification.permission` continua `default` e nenhum dispositivo é registrado → daí os 38 "Responsáveis sem push".

Outros motivos secundários que vou checar e exibir no painel:
- iOS Safari < 16.4 não suporta Web Push (alguns pais entram pelo browser, não pelo PWA instalado).
- PWA não instalado em iOS (no iOS o push só funciona dentro do PWA instalado na tela inicial).
- `isOptedOut` (usuário desligou explicitamente).
- Permissão `denied` no navegador (precisa o próprio usuário reverter — não dá pra forçar).

### Solução proposta (push "ligado por padrão")
1. **Estender `PushAutoSubscribe` para responsáveis e professores também**: na primeira sessão após esta release, dispara `Notification.requestPermission()` automaticamente (mesma lógica de "pedir uma vez, gravar flag em localStorage, nunca mais incomodar"). Funciona em Android/Chrome/Edge/Firefox e em iOS quando o app está como PWA instalado.
2. **Banner persistente** quando permission for `default` (não `denied`): pequeno aviso amarelo no topo do dashboard do responsável dizendo "Ative as notificações para receber avisos da escola" com botão CTA. Some quando virar `granted`.
3. **Para iOS sem PWA instalado**: mostrar instrução de "Instalar o app" usando o `PwaInstallBanner` que já existe, com texto explicando que sem instalar não rola push no iOS.
4. **No painel admin**, ao lado de cada responsável "sem push", mostrar a razão provável quando puder ser inferida: `permissão negada` (se temos registro), `nunca abriu o app` (cruzar com `acessos_log`), `iOS sem PWA` (heurística pelo último user-agent registrado em `acessos_log`).

Importante: notificação no navegador exige consentimento do usuário pelas regras do W3C/Apple/Google — não dá para tecnicamente "ligar sem perguntar". O que conseguimos é **perguntar automaticamente para todos** (não só admins) e tornar o caminho de aceitar bem mais visível.

## 5. Arquivos afetados

**Migração nova**
- `login_attempts` (tabela + RLS admin-only + índice em `escolinha_id, attempted_at`).

**Edge functions**
- Nova: `supabase/functions/log-login-attempt/index.ts` (`verify_jwt = false`).
- Reescrita: `supabase/functions/admin-auth-failures/index.ts` → lê de `login_attempts` (ou removida se ler direto do client).

**Frontend**
- `src/contexts/AuthContext.tsx`: instrumenta `login()` para logar tentativa.
- `src/pages/Auth.tsx`: loga falhas capturadas localmente.
- `src/hooks/useSaudeEscolaData.ts`: adiciona blocos `loginAttempts` e `cobrancasDetalhadas`.
- `src/components/admin/SaudeEscolaTab.tsx`: novos cards (Tentativas de login com motivos, Detalhe de Cobranças, razão provável de "sem push").
- `src/components/guardian/PushAutoSubscribe.tsx`: estende auto-prompt para `guardian` e `teacher`.
- Novo: banner "Ative notificações" no layout do guardian quando `Notification.permission === 'default'`.

## 6. O que NÃO vou fazer
- Não vou tocar na lógica de geração de cobrança nem no envio de push em si — só observabilidade e UI.
- Não vou criar tela nova; tudo entra no `DiagnosticoAcessoPage` na aba "Saúde Escola" já existente.
- Não vou mudar o `acessos_log` (logins com sucesso já estão lá).
