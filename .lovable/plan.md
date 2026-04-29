## Resumo das melhorias feitas até aqui (perfil "Meus Dados")

1. **Banner "Meus dados"** dentro de Configurações (estilo igual ao da Central de Ajuda) abrindo um sub-dialog com o formulário completo.
2. **Formulário completo** do responsável: nome, CPF, telefone, data de nascimento e endereço completo (CEP, rua, número, complemento, bairro, cidade, UF). E-mail mostrado como somente leitura.
3. **Validação inteligente de CPF**: só bloqueia se o usuário alterar o CPF; dados legados inválidos não impedem o salvamento dos demais campos. CPF válido fica travado (alteração só pela escola).
4. **Aviso "Complete seu cadastro"** quando o CPF está faltando (necessário para cobranças).
5. **Push notifications silencioso**: removida a UI de pedir permissão. O `PushAutoSubscribe` registra a inscrição automaticamente quando a permissão do navegador já está concedida — sem perguntar nada ao usuário.
6. **Edge function `update-guardian-profile`** criada para fazer o update via service role, contornando RLS. Hoje está **restrita ao e-mail `wnogueira@hotmail.com`** (modo de teste).
7. **Migration de RLS** específica para o usuário de teste no `responsaveis`.

---

## O que falta para liberar para todos

### 1. Edge function `update-guardian-profile`
- Remover o bloqueio que só aceita `wnogueira@hotmail.com`.
- Manter as proteções: exigir JWT válido, atualizar **somente** o `responsaveis` cujo `user_id = auth.uid()`, lista branca de campos (`ALLOWED_FIELDS`), normalização de telefone/CPF/CEP e `nome` obrigatório.
- Manter o `service_role` apenas dentro da função (nunca exposto ao frontend).

### 2. RLS do `responsaveis`
- Substituir a policy específica do usuário de teste por uma policy genérica:
  `UPDATE` permitido quando `user_id = auth.uid()`, restrito às colunas de perfil (a função continua sendo o caminho oficial — a policy é só rede de segurança).
- Conferir que não existe outra policy mais restritiva conflitando.

### 3. Frontend
- Tirar o badge "Beta" do título "Meus Dados".
- Mensagem de erro genérica caso a função retorne 403/404 (ex: responsável não vinculado ainda).
- Nenhuma outra mudança no fluxo — o hook `useUpdateGuardianProfile` já usa `supabase.functions.invoke`.

### 4. Verificação pós-liberação
- Testar com **2 a 3 responsáveis** diferentes (incluindo um sem CPF e um com CPF já válido) para confirmar:
  - Salva data de nascimento, telefone e endereço.
  - CPF travado continua não sendo sobrescrito.
  - Logs da função mostram o `userId` correto em cada update.

---

## Push dos administradores da Escolinha Bandeirantes

**Diagnóstico (consultado agora no banco):**

- Escola: `Bandeirantes Futebol Recreio` — admin: `bandeirantesfr@hotmail.com` (`user_id 5c333f6d…`).
- Tabela `push_subscriptions` para esse usuário: **0 registros**.
- `user_roles`: tem `role = 'school'` (correto).
- `PushAutoSubscribe` já está montado no `SchoolDashboardLayout`, então o código tenta inscrever — mas só efetivamente se inscreve quando `Notification.permission === 'granted'` no navegador/dispositivo do admin.

**Conclusão:** o admin da Bandeirantes hoje **não recebe push**, porque nunca houve permissão concedida no navegador/PWA dele. O componente atual é totalmente silencioso (não pede permissão) — então sem uma ação do usuário, nada é registrado.

**Proposta para resolver (sem voltar a ser um "toggle"):**

1. **Auto-pedido de permissão one-shot para administradores de escola**, na primeira vez que abrirem o painel após esta liberação:
   - Se `Notification.permission === 'default'` e o usuário tem role `school` → chamar `Notification.requestPermission()` automaticamente uma única vez (controlado por uma flag em `localStorage`, ex.: `atleta_id_push_prompted:{userId}`).
   - Se conceder → `subscribe()` automático (silencioso depois disso).
   - Se negar → não pergunta de novo; podemos só logar.
2. **Não mexer no fluxo dos responsáveis** que já está silencioso e funcionando.
3. **Diagnóstico rápido no painel admin** (opcional, mas útil): mostrar para o admin um pequeno indicador "Notificações ativas neste dispositivo: ✓ / ✗" no menu/configurações da escola, com botão para ativar caso esteja negado/pendente. Sem ser intrusivo.
4. Após a liberação, validar com a Bandeirantes:
   - Pedir para o admin abrir o painel uma vez no celular/desktop e aceitar o pop-up nativo.
   - Conferir no banco se aparece linha em `push_subscriptions` para o `user_id 5c333f6d…`.
   - Disparar um push de teste via `send-push-notification` com `user_ids: ['5c333f6d-e845-417c-8e30-dfdb4d92de82']`.

---

## Detalhes técnicos (resumo)

- **Arquivos a alterar:**
  - `supabase/functions/update-guardian-profile/index.ts` — remover whitelist de e-mail.
  - `src/components/guardian/GuardianMeusDadosCard.tsx` — remover badge "Beta".
  - `src/components/guardian/PushAutoSubscribe.tsx` — adicionar lógica de auto-prompt para role `school` (one-shot, controlado por `localStorage`).
- **Migration nova:** policy `UPDATE` em `responsaveis` para `auth.uid() = user_id` (e drop da policy do usuário de teste).
- **Sem mudanças** no fluxo de login, no `usePushNotifications` ou nas demais áreas.

Posso implementar tudo isso assim que aprovar.
