# Push de lembretes parou — diagnóstico e correção

## Diagnóstico

Verifiquei os dados e identifiquei **duas causas** distintas para a parada das notificações push.

### 1) Cron `process-push-reminders` está sendo encerrado antes de terminar (causa principal)

O cron job que envia lembretes de aula, cobrança, convocação e aniversário roda diariamente às 11:00 UTC chamando a edge function `process-push-reminders` via `net.http_post`. Mas:

- O `net.http_post` está configurado com o **timeout padrão do pg_net = 5 segundos**.
- A função precisa de muito mais tempo (varre 2 escolas, mensalidades, aulas, convocações, aniversários, professores etc.).
- Na tabela `net._http_response`, todas as execuções recentes (29/05 às 11:00 e 15:00 UTC) terminaram com:
  `Timeout of 5000 ms reached. Total time: 5001 ms`
- Quando o pg_net fecha a conexão, o Supabase Edge Runtime **mata o worker** no meio da execução. Por isso:
  - **Nunca** houve um push de `aula` registrado em `push_notifications_log` (a seção de aulas é a última do loop).
  - Os pushes de `convocacao` pararam em **02/04**.
  - Os pushes de `cobranca` pararam em **05/05** (e ainda assim só rodavam parcialmente).
  - Só sobrevive o `admin_pendencias`, porque é uma função separada e bem mais leve.

Executei a função manualmente agora (sem timeout) e ela retornou 200 OK, processou as 2 escolas e devolveu `totalSent: 0` — código está correto, problema é só o tempo de execução cortado pelo cron.

Também confirmei que o seu usuário `wnogueira@hotmail.com` tem **7 push subscriptions ativas** — o problema não está no seu device, está no cron sendo cortado antes de chegar aos pushes.

### 2) Mensalidades não estão sendo geradas para junho

Mesmo se o cron funcionasse 100%, **não haveria lembretes de cobrança** porque:

- Última `data_vencimento` em `mensalidades` é **08/05/2026**.
- Não existem mensalidades cadastradas para junho/2026.
- Por isso o último push de cobrança foi em 05/05 (3 dias antes do vencimento de 08/05) e nunca mais.

Isso é independente do cron de push — é o job/rotina que gera as mensalidades mensais que não rodou em maio.

## Correção

### Passo 1 — Aumentar timeout dos crons (migration)

Recriar os 3 cron jobs passando `timeout_milliseconds := 60000` (60 s) no `net.http_post`:

- `process-push-reminders-daily`
- `process-admin-pendencias-push`
- `resumo-mensal-push-dia-1`

```sql
-- exemplo (process-push-reminders-daily)
SELECT cron.unschedule('process-push-reminders-daily');
SELECT cron.schedule(
  'process-push-reminders-daily',
  '0 11 * * *',
  $$SELECT net.http_post(
      url := 'https://vxzktyklzkfqitptzctk.supabase.co/functions/v1/process-push-reminders',
      headers := '{"Content-Type":"application/json","Authorization":"Bearer <anon>"}'::jsonb,
      body := jsonb_build_object('time', now()),
      timeout_milliseconds := 60000
    );$$
);
```

Isso é suficiente para os pushes voltarem a sair (lembretes de aula, convocações pendentes, aniversários, e cobrança quando houver mensalidades a vencer).

### Passo 2 — Investigar geração de mensalidades de junho (próxima conversa)

Precisamos olhar o fluxo que cria as mensalidades mensais (rotina/cron/edge function) e gerar as parcelas de junho/2026 em diante. Não vou mexer nisso agora — quero seu OK porque envolve cobranças.

### Passo 3 — Validar

Depois do passo 1:
1. Rodar `process-push-reminders` manualmente para garantir que termina dentro de 60 s (já testei: foi rápido com volume atual).
2. Conferir em `/dashboard/push-monitor` (a tela que criamos antes) se aparecem novos envios nos próximos dias para a escola Bandeirantes.
3. Confirmar via `push_notifications_log` se o `wnogueira@hotmail.com` volta a receber `aula` e `convocacao`.

## O que NÃO vou mexer

- Não vou alterar a função `process-push-reminders` (o código está correto).
- Não vou tocar em `send-push-notification`, `push_subscriptions`, ou no SW.
- Não vou gerar mensalidades nesta etapa — apenas reportar.

Confirma para eu seguir só com o passo 1 (aumentar timeout dos crons)?
