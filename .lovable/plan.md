# Diagnóstico e blindagem do filtro de banners por escola

## Conclusão da auditoria

- `wnogueira@hotmail.com` (id `838d5e73-…`) tem **role `guardian`** e está vinculado a **apenas 1 escola: Bandeirantes Futebol Recreio**. Não é admin nem professor de nenhuma escola.
- Os 3 banners ativos hoje estão segmentados **somente** para *Escolinha de Esportes Fluminense*.
- A política RLS de leitura (`Banners visíveis para usuários autorizados`) avaliada manualmente para esse usuário retorna **0 banners** — ou seja, no servidor o filtro está correto.

Se mesmo assim ele está vendo banners no celular, as causas prováveis são:

1. **Cache do React Query** (`staleTime: 5 min`) e/ou cache do Service Worker do PWA, mantendo banners antigos quando a segmentação ainda não existia.
2. Os banners foram criados inicialmente **sem segmentação** (visíveis a todos) e o filtro de escola foi adicionado depois — o app dele ainda guarda a resposta anterior.
3. Sessão antiga em outro perfil no mesmo dispositivo (admin/preview).

Não há, hoje, nenhum usuário da Bandeirantes que deveria estar vendo esses 3 banners pelo RLS.

## O que vamos fazer

1. **Eliminar a janela de cache do banner**: trocar `staleTime` para `0` no hook `useBannersAtivos` e adicionar `refetchOnWindowFocus: true`. Banners são poucos e leves; vale ter sempre frescos.
2. **Forçar revalidação após qualquer alteração no admin**: já invalidamos `banners-ativos`, mas vamos também passar a invalidar em alterações de `banner_escolas` (segmentação) explicitamente.
3. **Criar uma RPC `debug_my_visible_banners()`** (SECURITY INVOKER) que retorna a lista exata que o usuário logado consegue ler. Vamos chamá-la temporariamente em uma tela de diagnóstico admin acessível em `/dashboard/admin/diagnostico-banners`, onde o admin pode digitar o email do responsável e ver:
   - escolas vinculadas
   - banners que o RLS retornaria para aquele usuário
   - banners atualmente cacheados no app dele (instruções para limpar)
4. **Botão "Forçar atualização" no carrossel do responsável** (somente visível para admins logados como responsável) — opcional, apenas se útil.

## Como o usuário valida

- Pedir ao `wnogueira` para fechar o app e abrir de novo (ou puxar para atualizar). Com `staleTime: 0`, os banners desaparecem na próxima abertura.
- Abrir `/dashboard/admin/diagnostico-banners`, digitar `wnogueira@hotmail.com` e confirmar que a lista vem vazia.

## Detalhes técnicos

- `src/hooks/useBannersData.ts`: `staleTime: 0`, `refetchOnWindowFocus: true`, `refetchOnMount: 'always'` em `useBannersAtivos`.
- Nova migração: função SQL `public.debug_banners_for_user(p_email text)` SECURITY DEFINER, restrita a `has_role(auth.uid(),'admin')`, retornando `id,titulo,posicao,ativo,segmentado_para[],visivel_para_user(bool)`.
- Nova página `src/pages/dashboard/admin/AdminDiagnosticoBannersPage.tsx` + rota no `Dashboard.tsx`.
