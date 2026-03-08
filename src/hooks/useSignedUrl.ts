import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

// Cache signed URLs to avoid repeated API calls
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();
const CACHE_DURATION_MS = 3500000; // ~58 minutes (signed URLs last 1 year, but we refresh cache periodically)

/**
 * Resolves a foto_url that can be either:
 * - A full HTTP URL (legacy or public bucket) → used as-is
 * - A path-only string (private bucket) → generates a signed URL
 */
export function useSignedUrl(
  path: string | null | undefined,
  bucket: string = 'child-photos'
): string | null {
  const [url, setUrl] = useState<string | null>(() => {
    if (!path) return null;
    if (path.startsWith('http')) return path;
    const cached = signedUrlCache.get(`${bucket}/${path}`);
    if (cached && cached.expiresAt > Date.now()) return cached.url;
    return null;
  });

  useEffect(() => {
    if (!path || path.startsWith('http')) {
      setUrl(path || null);
      return;
    }

    const cacheKey = `${bucket}/${path}`;
    const cached = signedUrlCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      setUrl(cached.url);
      return;
    }

    let cancelled = false;

    supabase.storage
      .from(bucket)
      .createSignedUrl(path, 31536000) // 1 year
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data?.signedUrl) {
          console.warn(`Failed to get signed URL for ${bucket}/${path}:`, error);
          setUrl(null);
          return;
        }
        signedUrlCache.set(cacheKey, {
          url: data.signedUrl,
          expiresAt: Date.now() + CACHE_DURATION_MS,
        });
        setUrl(data.signedUrl);
      });

    return () => { cancelled = true; };
  }, [path, bucket]);

  return url;
}

/**
 * Resolves an array of foto paths/URLs (for fotos_urls arrays)
 */
export function useSignedUrls(
  paths: string[] | null | undefined,
  bucket: string = 'atividade-externa-fotos'
): string[] {
  const [urls, setUrls] = useState<string[]>([]);

  useEffect(() => {
    if (!paths || paths.length === 0) {
      setUrls([]);
      return;
    }

    let cancelled = false;

    Promise.all(
      paths.map(async (path) => {
        if (path.startsWith('http')) return path;
        
        const cacheKey = `${bucket}/${path}`;
        const cached = signedUrlCache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) return cached.url;

        const { data, error } = await supabase.storage
          .from(bucket)
          .createSignedUrl(path, 31536000);
        
        if (error || !data?.signedUrl) return null;
        
        signedUrlCache.set(cacheKey, {
          url: data.signedUrl,
          expiresAt: Date.now() + CACHE_DURATION_MS,
        });
        return data.signedUrl;
      })
    ).then((resolved) => {
      if (!cancelled) {
        setUrls(resolved.filter(Boolean) as string[]);
      }
    });

    return () => { cancelled = true; };
  }, [paths?.join(','), bucket]);

  return urls;
}

/**
 * Synchronous helper: returns the path/URL as-is if it's already an HTTP URL,
 * otherwise returns null (use useSignedUrl hook for async resolution)
 */
export function resolvePhotoUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  const cached = signedUrlCache.get(`child-photos/${path}`);
  if (cached && cached.expiresAt > Date.now()) return cached.url;
  return null;
}
