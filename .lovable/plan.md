
## Diagnóstico

Fiz uma varredura profunda dos pagamentos da Escolinha Bandeirantes em maio e junho/2026 usando a edge function `audit-mensalidade-payments` (compara cada mensalidade local com o status real no Asaas).

### Maio/2026 — OK
23 mensalidades auditadas, **0 divergências**. Tudo que está pago no Asaas está pago no sistema.

### Junho/2026 — 3 pagamentos não estavam dando baixa
A auditoria encontrou **3 mensalidades pagas no Asaas em 08/06 (R$ 168,01 líquidos cada) que continuavam como `a_vencer` no app**:

| Aluno | Asaas Payment ID | Pago em |
|---|---|---|
| Rafael de Fiuza Fontes Soares | pay_8aqfylqhbqm4q3pp | 08/06/2026 |
| Yan Lucca Guedes Santoro | pay_if6mdzzaqk9bimsp | 08/06/2026 |
| João Pedro Bencke Lourenço dos Santos | pay_dzvdhc0h6nm5beb1 | 08/06/2026 |

Houve também 1 evento adicional do Pedro Asafe Weinrich (`pay_j6emh3d8ngztxs9n`) que o webhook recebeu mas não conseguiu vincular — caso de PIX duplicado (a mensalidade dele já estava paga por outro `asaas_payment_id`). Não é falha do sistema.

### Causa raiz
O **webhook da subconta Asaas da Bandeirantes estava interrompido** ("interrupted=true"). Quando o webhook recebe falhas seguidas, o Asaas o pausa automaticamente e fica acumulando os eventos sem entregar. Por isso até hoje não havia **nenhum log** na edge `asaas-webhook` para essa subconta — os eventos estavam represados no Asaas.

### O que já foi feito agora
1. Chamei `asaas-configure-webhook` para a Bandeirantes → webhook reativado (status `active`, `interrupted=false`).
2. O Asaas reentregou imediatamente todos os eventos represados → o handler processou e marcou os 3 pagamentos como `pago` automaticamente.
3. A auditoria foi rodada novamente e fez auto-sync dos 3 (R$ 168,01 cada). Status financeiro atualizado.

**Os 3 alunos já estão com mensalidade de junho marcada como paga.** Avise o administrador da Bandeirantes.

## Plano de prevenção

Para evitar que isso volte a acontecer silenciosamente em qualquer escola, proponho 3 ações pequenas:

### 1. Cron diário de "health check" do webhook
Nova edge function `asaas-webhook-healthcheck` agendada diariamente (06:00 BRT) que, para toda escola com `asaas_api_key` configurada:
- Consulta `GET /webhooks` no Asaas;
- Se encontrar `interrupted=true` ou `enabled=false`, chama `PUT /webhooks/{id}` zerando `interrupted` e ativando;
- Registra em `admin_audit_log` (acao=`webhook_reativado`) quem foi reativado.

### 2. Cron diário de reconciliação (já existe — só agendar)
A função `audit-mensalidade-payments` já faz auto-sync de mensalidades pagas no Asaas mas pendentes no app. Agendar um job diário (07:00 BRT) que percorra todas as escolas com mensalidades pendentes do mês corrente e do anterior. Funciona como rede de segurança caso o webhook caia por algumas horas.

### 3. Alerta no painel admin de Push Monitor (extensão leve)
Adicionar um cartão "Webhooks Asaas" na página `/dashboard/push-monitor` mostrando, por escola: status do webhook, último evento recebido, divergências da última auditoria. Permite ver o problema em 1 clique.

## Detalhes técnicos

- Cron via `pg_cron` + `pg_net.http_post` (mesmo padrão dos crons de push já em uso), `timeout_milliseconds := 60000`.
- A função de healthcheck percorre `escola_cadastro_bancario` onde `asaas_api_key IS NOT NULL` e `asaas_status='APPROVED'`. Faz no máximo 1 request/segundo por escola (rate limit Asaas).
- A função de reconciliação reutiliza `audit-mensalidade-payments` chamando por escola; loga sumário (auto_synced, mismatches) em `admin_audit_log`.
- Nenhuma migration de schema necessária; só `cron.schedule` (SQL via supabase--insert por conter URL + anon key) e a nova edge function.
- Sem mudança de UI obrigatória — a extensão do Push Monitor é opcional (item 3).

## Pergunta

Quer que eu já implemente os 3 itens, ou prefere começar só pelo cron de healthcheck do webhook (item 1) que é o que evita o problema reportado?
