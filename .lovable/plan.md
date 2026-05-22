## Objetivo
Substituir o ID hardcoded da Fluminense por uma configuração no painel admin, permitindo marcar quais escolas têm o "Resumo Mensal do Atleta" habilitado.

## Mudanças no banco

**Nova tabela `resumo_mensal_escolas_habilitadas`:**
- `escolinha_id` (uuid, PK, FK → escolinhas)
- `habilitado_em` (timestamp)
- `habilitado_por` (uuid, user_id do admin)
- RLS: apenas admins (SELECT/INSERT/DELETE via `has_role(auth.uid(), 'admin')`)

**Atualizar função `is_crianca_resumo_mensal_enabled(p_crianca_id)`:**
- Trocar comparação com UUID fixo por `EXISTS` na nova tabela
- Mantém mesma assinatura → nenhuma quebra no frontend/hook

**Seed:** inserir a Fluminense (`1717c373-...`) automaticamente na nova tabela, preservando o comportamento atual.

## Edge Function `resumo-mensal-push`
- Trocar filtro hardcoded de `escolinha_id = 'fluminense'` por query nas escolas presentes em `resumo_mensal_escolas_habilitadas`
- Continua varrendo Fluminense + qualquer outra escola que o admin habilitar no futuro

## UI Admin
Adicionar nova seção em `/dashboard/admin` (ou na página de configurações SaaS existente, se houver):
- **Card "Resumo Mensal do Atleta (Beta)"**
- Lista de escolas com switch (toggle) ON/OFF
- Busca por nome de escola
- Ao ligar/desligar: insert/delete na tabela `resumo_mensal_escolas_habilitadas`
- Texto explicativo: "Escolas habilitadas recebem o resumo mensal automático no dia 1 e o bloco aparece na Jornada dos responsáveis."

Hook novo: `useResumoMensalEscolas` (lista + toggle).

## Não muda
- `useResumoMensal` (consumidor já chama a RPC genérica)
- `ResumoMesCard` e `GuardianResumoMesPage`
- Rota `/dashboard/jornada/resumo/:criancaId/:ano/:mes`
- Cron job (continua chamando a edge function 1×/mês)

## Memória
Atualizar `mem://recursos/resumo-mensal-atleta` removendo a menção a "gating Fluminense hardcoded" e descrevendo o gating via tabela admin.
