
## Contexto

Investiguei o caso do `bandeirantesfr@hotmail.com` (Hygor — admin Bandeirantes): a conta tem profile, role `school` e vínculo de admin com a escolinha — ou seja, o fluxo *deveria* completar. O toast "Login realizado!" aparece porque o `signInWithPassword` retornou sem erro, mas a tela não muda quando o `fetchUserData` falha silenciosamente.

Rodando uma varredura geral, encontrei **14 usuários com profile mas SEM linha em `user_roles`** (entre eles `alessandrobarroso.imoveis@gmail.com`, que apareceu no fix anterior). Como o `AuthContext.fetchUserData` usa `.single()` em `user_roles`, qualquer usuário sem role cai no `catch`, retorna `null`, e o app fica preso na tela de login exibindo só o toast de sucesso.

Ou seja, **o problema ainda existe** para outros usuários — só foi resolvido para os 3 que faltavam *profile*, não para os que faltam *role*.

## Plano

### 1. Corrigir o bug estrutural do login

**a) Tornar o `fetchUserData` resiliente** (`src/contexts/AuthContext.tsx`)
- Trocar `.single()` por `.maybeSingle()` em `user_roles`, `profiles`, `escolinhas` (admin/sócio) e `professores`.
- Se faltar `role`, retornar um `AuthUser` com `role: null` + um novo flag `accountIncomplete: true` (em vez de `null`), para o app conseguir renderizar uma tela de erro amigável ("Sua conta está sem perfil de acesso configurado — fale com o suporte") em vez de travar no /login.
- Manter o log de console que já temos para diagnóstico.

**b) Backfill + trigger de role**
- Migration que insere `role = 'guardian'` (default seguro, igual ao fluxo de cadastro normal de responsáveis) para todos os usuários órfãos *que tenham vínculo em `responsaveis`*; para os demais (logins de teste, contas externas), gerar um relatório mas não atribuir role automaticamente.
- Garantir que o trigger `on_auth_user_created` continua criando profile, e adicionar criação automática de role `guardian` apenas quando o signup vem do fluxo público de responsáveis (já existe `handle_new_user` — vamos estendê-lo apenas para criar role quando `raw_user_meta_data->>'auto_role' = 'guardian'`, mantendo o fluxo de import/admin intocado).

### 2. Novo painel: **Saúde da Escola** (admin)

Adicionar uma nova aba dentro de `DiagnosticoAcessoPage.tsx` chamada **"Saúde por Escola"** (mantém tudo num lugar só, evita criar página nova). Seletor de escolinha no topo + cards:

**Card 1 — Acessos (últimos 30 dias)**
- Total de logins por role (admin, sócio, responsáveis, professores)
- Lista dos responsáveis/professores **que nunca acessaram** (já existe `get_school_parent_access_analytics`; reaproveitar)
- Último acesso de cada admin/sócio da escola

**Card 2 — Tentativas de login com falha**
- Consulta via `supabase--analytics_query` em `auth_logs` filtrando `status >= 400` e `path = '/token'`, agrupando por email — mostra os últimos 7 dias.
- Marca em vermelho emails que pertencem à escola selecionada (admin/sócio/responsáveis/professores).
- Como `auth_logs` não é exposto via RLS, criar uma Edge Function `admin-auth-failures` (verify_jwt + check `has_role(auth.uid(),'admin')`) que executa a query analítica e devolve o resultado.

**Card 3 — Push notifications**
- Para cada admin/sócio/responsável/professor da escola: quantas `push_subscriptions` ativas tem (0 = não recebe).
- Últimos 10 envios em `push_notifications_log` com `entregue` true/false.
- Estado dos toggles em `escola_push_config` (mensalidade / aniversário / comunicado / presença) — verde se ativo.
- Botão **"Enviar push de teste"** que dispara um push para o admin/sócio selecionado (chama `send-push-notification` com uma mensagem fixa de teste).

**Card 4 — Cobranças**
- Resumo do mês: mensalidades geradas vs. pagas vs. vencidas (consulta direta em `mensalidades` filtrando por `escolinha_id` e `mes_referencia` atual).
- Cobranças com `asaas_payment_id IS NULL` em status `pendente` (indica falha na geração no Asaas) — lista os atletas afetados.
- Status do `escola_cadastro_bancario` / subconta Asaas (já existe `get_escola_asaas_status`).
- Últimas 5 entradas em `escola_asaas_admin_notifications` (erros já registrados).

### 3. Verificação interna (após implementar)

- Rodar a query de orfãos para confirmar zero usuários ativos sem role.
- Logar um teste manual para `bandeirantesfr@hotmail.com` na aba nova confirmando: 1 admin com 3 push subs, 1 sócio (Miguel) com 0 push subs, último login OK.
- Conferir que `alessandrobarroso.imoveis@gmail.com` agora consegue avançar (após o backfill de role, se aplicável) ou aparece corretamente na lista "conta incompleta".

## Detalhes técnicos

- **Arquivos novos**: `src/components/admin/SaudeEscolaTab.tsx`, `supabase/functions/admin-auth-failures/index.ts`, hook `src/hooks/useSaudeEscolaData.ts`.
- **Arquivos editados**: `src/contexts/AuthContext.tsx` (resiliência), `src/pages/dashboard/admin/DiagnosticoAcessoPage.tsx` (nova aba), `supabase/functions/handle_new_user` (não — vamos só rodar migration de backfill seletivo).
- **Migration**: backfill de roles para usuários com vínculo em `responsaveis`/`professores`/`escolinhas`; nada destrutivo.
- **Sem mudança visual** fora do admin — usuários finais só sentem o efeito do login mais resiliente.
