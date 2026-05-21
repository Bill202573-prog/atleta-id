# Banners: múltiplas imagens, segundo espaço e header reduzido

## O que muda na tela inicial do responsável

```text
[Header compacto: "Olá!" + subtítulo em 1 linha menor]
[Avisos da Escola]          <- espaço 1
[Banner Carrossel - Topo]   <- espaço 2 (existente, agora com várias imagens)
[Banner Carrossel - Produtos] <- espaço 3 (novo, mesmo formato)
```

Os três blocos ficam com altura visual equivalente (mesma proporção 16:9 nos carrosséis e header reduzido).

## Mudanças no admin (página Banners)

- Cada banner passa a ter um campo **Posição**: `Topo` ou `Produtos`.
- Cada banner aceita **até 5 slides** (imagem + link de destino + abrir em nova aba), gerenciados dentro do mesmo formulário (adicionar / remover / reordenar).
- Recomendação de tamanho continua **1200x675 (16:9), até 500KB, JPG/PNG/WebP**.
- Lista de banners mostra a posição e o nº de slides.

Resultado: o admin pode montar um carrossel real com várias imagens dentro de UM banner, e ainda escolher se ele aparece no espaço de Topo ou no de Produtos.

## Mudanças na home do responsável

- `BannersCarrossel` recebe prop `posicao` e renderiza só os banners daquela posição.
- Cada slide do carrossel é uma imagem clicável (com seu próprio link).
- Autoplay 5s, swipe, dots e loop continuam iguais.
- Bloco "Olá!" reduzido (título menor, subtítulo compacto, menos padding) para liberar espaço.
- Renderiza dois carrosséis: `posicao="topo"` acima e `posicao="produtos"` abaixo do mural.

## Detalhes técnicos

Banco (migration):
- `ALTER TABLE banners_publicitarios`
  - `ADD COLUMN posicao text NOT NULL DEFAULT 'topo' CHECK (posicao IN ('topo','produtos'))`
  - `ADD COLUMN slides jsonb NOT NULL DEFAULT '[]'::jsonb` — array `[{ imagem_url, link_url, abrir_nova_aba }]`, máx. 5 (validado via CHECK `jsonb_array_length(slides) <= 5`).
- Backfill: para cada banner existente, popular `slides` com 1 item a partir das colunas atuais (`imagem_url`, `link_url`, `abrir_nova_aba`). Colunas antigas mantidas como espelho do primeiro slide para compatibilidade.
- `can_view_banner()` e RLS permanecem inalterados.
- Storage `banners-publicitarios` permanece.

Hook `useBannersData.ts`:
- Tipo `Banner` ganha `posicao` e `slides: { imagem_url, link_url, abrir_nova_aba }[]`.
- `useBannersAtivos(posicao)` filtra por posição.
- `SaveBannerInput` ganha `posicao` e `slides`; salva primeiro slide também nas colunas antigas para compatibilidade.

Componentes:
- `BannerFormDialog.tsx`: seletor de Posição, lista de slides com upload (reutiliza `compressImage`), link, switch "nova aba", botões "Adicionar slide" (até 5) e remover.
- `BannersCarrossel.tsx`: aceita `posicao`; itera `banner.slides` (não só `banner.imagem_url`).
- `AdminBannersPage.tsx`: badge de posição e contagem de slides no card.
- `GuardianInicioPage.tsx`: header compacto + dois `<BannersCarrossel posicao="topo|produtos" />`.

## Fora de escopo

- Nenhuma mudança em outras áreas (financeiro, escolas, push, etc.).
- Sem alteração nas regras de segmentação por escola — continuam por banner.
