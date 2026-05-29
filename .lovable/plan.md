## Objetivo
Permitir ao admin visualizar, por escola, **quem está recebendo push, quantas notificações foram enviadas e o histórico**, e identificar pais sem push ativo para acionar.

## Achados do diagnóstico (Bandeirantes)
- 26 pais ativos · 12 com push (46%) · 14 sem push ativo
- Admin da escola: 5 devices registrados
- 339 push enviados nos últimos 30 dias (comunicado, cobrança, pendências, aniversário)
- Tipos disparados automaticamente: `comunicado`, `cobranca`, `aniversario`, `aniversario_admin`, `admin_pendencias`, `resumo_mensal` (novo)

## Nova página: `/dashboard/admin/push-monitor`

### Seção 1 — Seletor de escola
Dropdown com todas as escolas (default: a primeira). Reaproveita hook existente de listagem.

### Seção 2 — Cards de cobertura
- **Pais com push ativo:** X de Y (barra de progresso)
- **Admins com push ativo:** X (lista de devices)
- **Professores com push ativo:** X de Y
- **Envios nos últimos 30 dias** (total)

### Seção 3 — Envios por tipo (últimos 30d)
Tabela: tipo · total enviado · último envio · % entregue
Tipos: comunicado, cobranca, aniversario, admin_pendencias, resumo_mensal, etc.

### Seção 4 — Pais sem push (acionáveis)
Lista de responsáveis ativos **sem** subscription. Para cada um:
- Nome, filho(s), telefone (WhatsApp)
- Botão "Enviar WhatsApp" com mensagem pronta orientando a ativar notificações

### Seção 5 — Histórico recente
Últimos 50 envios da escola (push_notifications_log): data/hora · destinatário · tipo · título · entregue.

## Backend
Nova RPC `get_push_monitor_escola(p_escolinha_id uuid)` retornando JSONB com as 5 seções acima em uma única chamada. SECURITY DEFINER + check `has_role(auth.uid(), 'admin')`. Sem novas tabelas — usa `push_subscriptions`, `push_notifications_log`, `responsaveis`, `crianca_escolinha`, `professores`, `escolinhas`.

## Frontend
- Hook `usePushMonitor(escolinhaId)` (React Query)
- Página mobile-first: cards empilhados, tabela com scroll horizontal em telas pequenas
- Link na sidebar admin "Monitor de Push" (ícone Bell)

## Não muda
- Não altera lógica de envio existente
- Não modifica `push_subscriptions` nem `push_notifications_log`
- Sem migrações destrutivas
