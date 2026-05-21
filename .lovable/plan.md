# Cobrança PIX vencida — solução com juros e multa via Asaas

## Como funciona hoje no Asaas (validado contra a API)

- Quando geramos a cobrança em `POST /v3/payments` com `billingType: 'PIX'`, o Asaas devolve um QR Code dinâmico associado àquele `payment_id`.
- O QR Code PIX tem um campo `expirationDate`. Por padrão, ele expira **no fim do dia da data de vencimento** (`dueDate` 23:59).
- Depois disso, **o QR Code antigo deixa de ser pago**, e é por isso que o pai recebe erro ao tentar pagar fora do prazo. O `payment` continua existindo no Asaas com status `OVERDUE`, mas sem PIX válido.
- A API permite **gerar um novo QR Code para o mesmo payment** chamando `GET /v3/payments/{id}/pixQrCode` novamente — o Asaas retorna um QR com nova `expirationDate` e o valor atualizado (incluindo juros e multa configurados).
- O Asaas calcula automaticamente **multa (`fine`)** e **juros (`interest`)** desde que sejam enviados no momento da criação do payment. Não precisamos calcular nada no nosso código.

## Conclusão

Não dá para "reaproveitar" o QR Code velho — ele realmente expira. Mas dá para reaproveitar a **mesma cobrança** (mesmo `asaas_payment_id`), gerando um novo QR sob demanda e cobrando juros + multa automaticamente.

## Solução proposta (prática e definitiva)

### 1. Configurar juros e multa por escola (uma vez)
Adicionar dois campos na tabela `escola_cadastro_bancario`:
- `multa_percentual` (default `2.00` — 2% sobre o valor após vencimento)
- `juros_mes_percentual` (default `1.00` — 1% ao mês, Asaas calcula pro-rata por dia)

Tela: card "Configurações de cobrança" no painel financeiro da escola, com os dois campos editáveis e textos explicativos ("padrão de mercado: 2% multa + 1% ao mês").

### 2. Enviar juros e multa ao Asaas ao gerar a cobrança
Na função `generate-mensalidade-pix` (e nas equivalentes de matrícula/amistoso/campeonato), incluir no payload:

```text
fine:     { value: multa_percentual,    type: 'PERCENTAGE' }
interest: { value: juros_mes_percentual, type: 'PERCENTAGE' }
```

A partir daí o Asaas aplica multa + juros automaticamente em qualquer pagamento feito após o vencimento.

### 3. Regerar QR Code expirado automaticamente
Atualizar `generate-mensalidade-pix` para o caso de a mensalidade já ter `asaas_payment_id`:
- Buscar o payment no Asaas (`GET /payments/{id}`).
- Se status for `PENDING` ou `OVERDUE`: chamar `GET /payments/{id}/pixQrCode` para obter um QR Code novo e válido, com o valor já atualizado (principal + multa + juros).
- Devolver para o front exatamente como hoje (mesmo formato de resposta).
- Só criar uma cobrança nova no Asaas se o payment original tiver sido cancelado.

Isso resolve o erro que o pai vê hoje ao tentar pagar atrasado: o app simplesmente gera um QR novo com o valor corrigido.

### 4. Baixa automática de pagamentos atrasados
O webhook `asaas-webhook-handler` já existe. Garantir que ele trata os eventos `PAYMENT_RECEIVED` e `PAYMENT_CONFIRMED` mesmo para pagamentos vencidos, marcando a mensalidade como paga e gravando o valor efetivamente recebido (com juros/multa) num campo `valor_pago` — assim a baixa manual deixa de ser necessária.

### 5. UI do responsável
No diálogo de pagamento (`MensalidadePixCheckoutDialog`), quando o valor retornado for maior que o valor original da mensalidade, mostrar uma linha discreta:
- "Valor original: R$ X,XX"
- "Multa + juros por atraso: R$ Y,YY"
- "Total a pagar: R$ Z,ZZ"

Sem bloquear, sem fricção — o pai abre, vê o QR atualizado e paga.

## Detalhes técnicos

- Migração: adicionar `multa_percentual numeric(5,2) default 2.00` e `juros_mes_percentual numeric(5,2) default 1.00` em `escola_cadastro_bancario`. Backfill nas escolas existentes com os defaults.
- `generate-mensalidade-pix`: refatorar para o fluxo "buscar payment existente → regerar QR" antes do fluxo "criar payment novo". Aplicar a mesma lógica em `generate-enrollment-pix`, `generate-amistoso-pix`, `generate-campeonato-pix`, `generate-pedido-pix`.
- `check-mensalidade-payment` e `asaas-webhook-handler`: aceitar `value` recebido do Asaas (com juros/multa) e salvar em `mensalidades.valor_pago` (criar coluna se não existir).
- Painel "Saúde Escola" (cobrança): exibir `valor_pago` quando diferente do `valor` original.

## Fora do escopo deste plano

- Não vamos calcular juros/multa no nosso código — quem calcula é o Asaas.
- Não vamos mudar o fluxo de geração inicial da cobrança nem o cron de geração mensal.
