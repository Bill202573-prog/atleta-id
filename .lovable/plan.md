## Push de pagamento recebido para administradores

Quando um responsável paga uma mensalidade via PIX, o admin da escolinha recebe um push em tempo real:

> "O responsável por João Guilherme pagou R$ 170,00 de Mensalidade Maio/26"

### 1. Banco de dados

Adicionar nova coluna em `escola_push_config`:

- `pagamento_recebido_admin_push BOOLEAN DEFAULT true`

Default `true` para já liberar o recebimento para todas as escolas existentes (e novas) sem ação manual.

### 2. Edge Function `asaas-webhook`

No bloco que processa o evento `PAYMENT_RECEIVED`/`PAYMENT_CONFIRMED` de mensalidades (tanto o caminho via `asaas_payment_id` quanto via `externalReference`), depois de marcar a mensalidade como `pago`:

1. Buscar `mensalidades.escolinha_id`, `crianca_id`, `mes_referencia`, `valor_pago`.
2. Buscar `criancas.nome` e `escolinhas.admin_user_id`.
3. Buscar `escola_push_config.pagamento_recebido_admin_push` (se não existir registro, assumir `true`).
4. Se ativo e `admin_user_id` presente, chamar `send-push-notification` com:
   - `user_ids: [admin_user_id]`
   - `title: "💰 Pagamento recebido"`
   - `body: "O responsável por {nome} pagou R$ {valor} de Mensalidade {Mês/AA}"`
   - `url: "/dashboard/financeiro"`
   - `tag: pagamento-{mensalidade_id}` (idempotente)
   - `tipo: 'pagamento_recebido'`, `referencia_id: mensalidade_id`, `escolinha_id`

Formatação:
- Valor em `pt-BR`: `R$ 170,00`.
- Mês em pt-BR a partir de `mes_referencia` (`2026-05-01` → "Maio/26").

Escopo: apenas mensalidades nesta entrega (que é o exemplo do usuário). Matrícula/amistoso/campeonato/loja podem ser estendidos depois.

### 3. UI de configuração

Em `PushConfigSection.tsx`, adicionar nova seção (visível independente do `push_ativo` master, que hoje controla apenas lembretes para responsáveis):

- Bloco "🔔 Notificações para o Administrador"
- Switch "Receber push quando um pagamento de mensalidade for confirmado" (chave `pagamento_recebido_admin_push`, default `true`)

Incluir a chave no payload do `upsert` e no `getValue`.

### 4. Garantir entrega

- O componente `PushAutoSubscribe` já dispara o prompt nativo uma vez para `role === 'school'`, então admins que ainda não habilitaram serão solicitados na próxima visita.
- Nada mais é necessário — assim que o admin aceitar o pop-up, o push chega em tempo real via webhook do Asaas.

### Detalhes técnicos

- Migração simples `ALTER TABLE public.escola_push_config ADD COLUMN pagamento_recebido_admin_push boolean NOT NULL DEFAULT true;`
- A leitura no webhook usa `maybeSingle()` e default `true` se não houver linha.
- Idempotência já é garantida pelo guard `if (mensalidade.status === 'pago') skip` antes do update — se o webhook chegar duplicado, não disparamos push duas vezes.
