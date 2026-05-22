import { useEffect, useMemo, useState } from 'react';
import Autoplay from 'embla-carousel-autoplay';
import { BannerPosicao, useBannersAtivos } from '@/hooks/useBannersData';
import {
  Carousel,
  CarouselApi,
  CarouselContent,
  CarouselItem,
} from '@/components/ui/carousel';
import { cn } from '@/lib/utils';

interface Props {
  posicao?: BannerPosicao;
}

interface FlatSlide {
  key: string;
  imagem_url: string;
  link_url: string;
  abrir_nova_aba: boolean;
  titulo: string;
}

export function BannersCarrossel({ posicao }: Props) {
  const { data: banners = [], isLoading } = useBannersAtivos(posicao);
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);

  const slides: FlatSlide[] = useMemo(
    () =>
      banners.flatMap((b) =>
        b.slides.map((s, i) => ({
          key: `${b.id}-${i}`,
          imagem_url: s.imagem_url,
          link_url: s.link_url,
          abrir_nova_aba: s.abrir_nova_aba,
          titulo: b.titulo,
        })),
      ),
    [banners],
  );

  useEffect(() => {
    if (!api) return;
    setCurrent(api.selectedScrollSnap());
    const onSelect = () => setCurrent(api.selectedScrollSnap());
    api.on('select', onSelect);
    return () => {
      api.off('select', onSelect);
    };
  }, [api]);

  if (isLoading || slides.length === 0) return null;

  const isInternalLink = (url: string) => url.startsWith('/');
  const delayMs =
    Math.min(60, Math.max(2, Number(banners[0]?.autoplay_segundos ?? 5))) * 1000;

  return (
    <div className="space-y-2">
      <Carousel
        setApi={setApi}
        opts={{ loop: slides.length > 1, align: 'start' }}
        plugins={
          slides.length > 1
            ? [Autoplay({ delay: delayMs, stopOnInteraction: true })]
            : []
        }
      >
        <CarouselContent>
          {slides.map((slide) => {
            const internal = isInternalLink(slide.link_url);
            const target = slide.abrir_nova_aba && !internal ? '_blank' : '_self';
            const rel = target === '_blank' ? 'noopener noreferrer' : undefined;
            return (
              <CarouselItem key={slide.key}>
                <a
                  href={slide.link_url || '#'}
                  target={target}
                  rel={rel}
                  className="block overflow-hidden rounded-lg border bg-card shadow-sm transition-transform hover:scale-[1.01]"
                  aria-label={slide.titulo}
                >
                  <img
                    src={slide.imagem_url}
                    alt={slide.titulo}
                    className="w-full aspect-video object-cover"
                    loading="lazy"
                  />
                </a>
              </CarouselItem>
            );
          })}
        </CarouselContent>
      </Carousel>

      {slides.length > 1 && (
        <div className="flex justify-center gap-1.5">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Ir para slide ${i + 1}`}
              onClick={() => api?.scrollTo(i)}
              className={cn(
                'h-1.5 rounded-full transition-all',
                i === current ? 'w-6 bg-primary' : 'w-1.5 bg-muted-foreground/30'
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default BannersCarrossel;
