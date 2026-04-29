## Contexto verificado no banco

Confirmei consultando direto o Postgres que **os dados do William Nogueira ESTÃO salvos** em `responsaveis`:

- nome: William Nogueira
- email: wnogueira@hotmail.com
- cpf: 34343456789
- telefone: 21981089100
- endereço: Rua Mapendi, 660 — Taquara — Rio de Janeiro/RJ — CEP 22710255

A RLS de SELECT (`user_id = auth.uid()`) está ativa e o `useGuardianProfile` faz `select('*')`, então o front recebe tudo. O card `GuardianMeusDadosCard` é montado em `GuardianPerfilPage` quando `useMeusDadosEnabled` retorna true para esse e-mail.

**Conclusão:** o componente está correto e os dados existem. Se não aparecem na tela, o motivo mais provável é o **service worker do PWA servindo um bundle antigo** (anterior à criação do card). Vamos forçar o refresh e adicionar um diagnóstico visível para confirmar.

`responsaveis` **não tem** coluna `data_nascimento`. Vamos adicionar.

---

## Como funcionam as notificações push hoje

```text
Navegador  ──permission──►  usePushNotifications  ──upsert──►  push_subscriptions (Supabase)
                                  │
                                  └─ usado por:
                                     • PushAutoSubscribe (invisível) — já plugado em MobileGuardianLayout
                                     • PushNotificationToggle (cartão visual com botão) — NÃO está em lugar nenhum hoje
```

- O **auto-subscribe silencioso** já existe e roda em todo layout do responsável: se o navegador estiver com permissão `granted` ou `default`, ele já tenta inscrever.
- O **toggle visual** (`PushNotificationToggle`) está implementado mas **não foi colocado em nenhuma página** — é por isso que você não vê onde "aceitar".
- Para o **admin da escola** não existe nem o auto-subscribe, nem toggle.

---

## O que vou fazer

### 1. Push para responsáveis — default ligado, com toggle em Configurações
- Manter o `PushAutoSubscribe` rodando no layout (já está) — assim, no primeiro acesso, o navegador pede permissão automaticamente e a inscrição já fica salva.
- Adicionar o `PushNotificationToggle` na **aba Configurações do responsável** (vou identificar a página de configurações; se não houver uma dedicada, acrescento uma seção "Notificações" no Perfil, abaixo de "Meus Dados").
- O toggle mostra estado atual (Ativas/Desativadas) e permite desligar quando quiser. Como o auto-subscribe já tentou ativar, virá ligado por padrão para quem não negou no navegador.

### 2. Push para administradores da escola
- Plugar o mesmo `PushAutoSubscribe` no layout do admin (`SchoolDashboardLayout`).
- Adicionar o `PushNotificationToggle` em uma seção "Notificações" dentro das configurações da escola.
- Assim, quando o admin da Bandeirantes logar, o navegador já pede permissão e a inscrição fica salva — habilitando os pushes de aniversariantes do dia.

### 3. "Meus Dados" do William — diagnóstico e melhoria
- Adicionar coluna `data_nascimento date` na tabela `responsaveis` e o campo correspondente no formulário "Meus Dados".
- Adicionar um pequeno bloco de diagnóstico no topo do card (apenas no beta) mostrando: "Carregado: nome, cpf, telefone…" — para confirmarmos no preview se o componente está rodando ou se é cache do PWA.
- Subir a versão do service worker para forçar atualização (já temos a estratégia `PWAUpdatePrompt` em memória) — o usuário verá o aviso de "Nova versão disponível" e ao aceitar pega o bundle novo com o card.
- Verificar via reprodução (browser tools) que o card aparece com os dados preenchidos para wnogueira@hotmail.com após o refresh.

### 4. Liberação geral (opcional, depois do OK)
- Quando você confirmar que está OK no perfil do William, basta remover a checagem de e-mail em `useMeusDadosEnabled` e ajustar a policy RLS para permitir UPDATE para qualquer responsável no próprio cadastro.

---

## Detalhes técnicos

**Migrações:**
- `ALTER TABLE responsaveis ADD COLUMN data_nascimento date;`

**Arquivos a editar/criar:**
- `src/components/layout/SchoolDashboardLayout.tsx` — montar `<PushAutoSubscribe />` (ou variante para admin).
- `src/pages/dashboard/guardian/GuardianPerfilPage.tsx` (ou página de Configurações se existir) — adicionar seção "Notificações" com `<PushNotificationToggle />`.
- Página de configurações da escola — adicionar mesma seção.
- `src/components/guardian/GuardianMeusDadosCard.tsx` — adicionar campo `data_nascimento` (input date) e bloco de diagnóstico temporário.
- Bump do SW para forçar atualização do PWA.

**RLS:** nenhuma mudança nesta etapa (a policy de teste para wnogueira já cobre UPDATE).

**Push delivery:** o cron `process-push-reminders` já está pronto para enviar aniversariantes a admins; só faltava o admin estar inscrito — o que esta entrega resolve.
