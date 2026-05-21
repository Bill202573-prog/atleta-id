# Banners Publicitários na Tela Início (Responsáveis)

## Objetivo

Dividir a tela "Início" do app do responsável em duas áreas:

1. **Topo**: Avisos da Escola (já existe, mantém).
2. **Base**: Carrossel de **banners publicitários clicáveis**, gerenciados pelo Admin (Atleta ID).

## Como o usuário vê

```text
┌──────────────────────────┐
│ Olá! Acompanhe avisos    │
│ ┌──────────────────────┐ │
│ │ Avisos da Escola     │ │  ← já existe
│ └──────────────────────┘ │
│                          │
│ ┌──────────────────────┐ │
│ │   [ BANNER 1 ] •••   │ │  ← novo (carrossel)
│ │   imagem clicável    │ │
│ └──────────────────────┘ │
└──────────────────────────┘
```

- Carrossel com auto-play (5s), swipe no mobile, indicadores (dots).
- Tocar no banner abre o link em nova aba (ou rota interna se for URL do próprio app).
- Se não houver banner ativo, área simplesmente não aparece (sem espaço vazio).

## Tamanho e formato dos banners

Recomendação para boa nitidez em telas mobile retina, sem ficar pesado:

- **Proporção**: 16:9 (padrão) — ex.: 1200 x 675 px
- **Alternativa "wide banner"**: 3:1 — ex.: 1200 x 400 px (mais discreto)
- **Peso máximo**: 500 KB (compressão automática client-side via `compressImage`, conforme padrão do projeto)
- **Formatos aceitos**: JPG, PNG, WEBP
- **Renderização**: largura 100% do card, altura proporcional, `object-cover`, cantos arredondados

Vamos padronizar em **16:9 / 1200x675** como recomendação principal e mostrar isso no painel do admin no momento do upload.

## Painel Admin (Atleta ID Admin)

Nova seção em **Admin → Banners Publicitários** com lista + formulário:

Campos por banner:
- Título interno (apenas referência, não aparece ao usuário)
- Imagem (upload, com aviso "1200x675 (16:9), até 500KB")
- URL de destino (link clicável)
- Abrir em: nova aba / mesma aba
- Ordem de exibição (drag & drop ou número)
- Ativo (switch)
- Data de início / Data de fim (opcionais — permite agendar)
- **Segmentação por escola** (multi-select). Se vazio = todas as escolas. **Fase 1: cadastraremos apenas a escola do Fluminense**, então só os responsáveis dessa escola verão os banners.

Ações: criar, editar, ativar/desativar, excluir, reordenar.

Métrica simples (fase 2): contador de impressões e cliques por banner.

## Detalhes técnicos

**Banco (Supabase, nova migração):**

```sql
create table public.banners_publicitarios (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  imagem_url text not null,
  link_url text not null,
  abrir_nova_aba boolean default true,
  ordem int default 0,
  ativo boolean default true,
  inicio_em timestamptz,
  fim_em timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Segmentação por escola (N:N). Se um banner NÃO tem linha aqui, vale para todas as escolas.
create table public.banner_escolas (
  banner_id uuid references public.banners_publicitarios(id) on delete cascade,
  escolinha_id uuid references public.escolinhas(id) on delete cascade,
  primary key (banner_id, escolinha_id)
);
```

- RLS `banners_publicitarios.select`: usuário autenticado, `ativo = true`, dentro da janela de datas E (sem segmentação OU possui filho ativo em escola listada via `banner_escolas`, reaproveitando `guardian_can_access_escolinha`).
- RLS `banner_escolas.select`: mesma lógica (visível se o banner for visível).
- `insert/update/delete` em ambas: apenas `has_role(auth.uid(), 'admin')`.
- Bucket de storage: `banners-publicitarios` (público), upload comprimido client-side via `compressImage`.
- **Seed Fase 1**: ao criar o primeiro banner pelo admin, marcar somente a escola do Fluminense na segmentação.


**Frontend:**

- Novo componente `BannersCarrossel.tsx` em `src/components/guardian/` usando `components/ui/carousel.tsx` (já instalado) + auto-play.
- Hook `useBannersAtivos()` em `src/hooks/useBannersData.ts` (React Query, cache 5min).
- Inserido em `GuardianInicioPage.tsx` logo abaixo do `MuralAvisosEscolaInicio` / `MuralConsolidado`.
- Página admin: `src/pages/dashboard/admin/AdminBannersPage.tsx` + dialog de form. Adicionar item no sidebar do admin.

**Tracking (fase 2, opcional):**
- Tabela `banner_eventos` (banner_id, tipo: 'impression'|'click', user_id, created_at) preenchida pelo carrossel/click handler.

## Fases sugeridas

1. **Fase 1 (entrega agora)**: tabela + segmentação por escola, RLS, storage, carrossel na tela início, CRUD admin com upload, agendamento e seletor de escolas. Banner inicial restrito ao **Fluminense**.
2. **Fase 2 (depois, se quiser)**: contagem de impressões e cliques por banner.

## O que NÃO muda

- Layout atual dos Avisos da Escola permanece igual.
- Bottom nav, header e demais telas não são tocados.
