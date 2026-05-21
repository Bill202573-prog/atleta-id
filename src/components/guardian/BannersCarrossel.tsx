import { useEffect, useState } from 'react';
import Autoplay from 'embla-carousel-autoplay';
import { useBannersAtivos } from '@/hooks/useBannersData';
import {
  Carousel,
  CarouselApi,
  CarouselContent,
  CarouselItem,
} from '@/components/ui/carousel';
import { cn } from '@/lib/utils';

export function BannersCarrossel() {
  const { data: banners = [], isLoading } = useBannersAtivos();
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (!api) return;
    setCurrent(api.selectedScrollSnap());
    const onSelect = () => setCurrent(api.selectedScrollSnap());
    api.on('select', onSelect);
    return () => {
      api.off('select', onSelect);
    };
  }, [api]);

  if (isLoading || banners.length === 0) return null;

  const isInternalLink = (url: string) => url.startsWith('/');

  return (
    <div className="space-y-2">
      <Carousel
        setApi={setApi}
        opts={{ loop: banners.length > 1, align: 'start' }}
        plugins={
          banners.length > 1
            ? [Autoplay({ delay: 5000, stopOnInteraction: true })]
            : []
        }
      >
        <CarouselContent>
          {banners.map((banner) => {
            const internal = isInternalLink(banner.link_url);
            const target = banner.abrir_nova_aba && !internal ? '_blank' : '_self';
            const rel = target === '_blank' ? 'noopener noreferrer' : undefined;
            return (
              <CarouselItem key={banner.id}>
                <a
                  href={banner.link_url}
                  target={target}
                  rel={rel}
                  className="block overflow-hidden rounded-lg border bg-card shadow-sm transition-transform hover:scale-[1.01]"
                  aria-label={banner.titulo}
                >
                  <img
                    src={banner.imagem_url}
                    alt={banner.titulo}
                    className="w-full aspect-video object-cover"
                    loading="lazy"
                  />
                </a>
              </CarouselItem>
            );
          })}
        </CarouselContent>
      </Carousel>

      {banners.length > 1 && (
        <div className="flex justify-center gap-1.5">
          {banners.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Ir para banner ${i + 1}`}
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
