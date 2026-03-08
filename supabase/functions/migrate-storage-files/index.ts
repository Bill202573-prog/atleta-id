import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OLD_SUPABASE_URL = "https://obvfyxiuvcpiogdyclke.supabase.co";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const newSupabase = createClient(supabaseUrl, serviceRoleKey);

    const results: Record<string, any> = {};

    // Helper: download from old project and upload to new
    async function copyFile(oldUrl: string, bucket: string, path: string): Promise<string | null> {
      const response = await fetch(oldUrl);
      if (!response.ok) return `HTTP ${response.status}`;
      
      const blob = await response.blob();
      const uint8Array = new Uint8Array(await blob.arrayBuffer());
      
      const { error } = await newSupabase.storage
        .from(bucket)
        .upload(path, uint8Array, {
          contentType: blob.type || 'image/jpeg',
          upsert: true,
        });
      
      return error ? error.message : null;
    }

    // Helper: extract bucket and path from a full URL
    function extractBucketPath(url: string): { bucket: string; path: string } | null {
      const match = url.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+?)(?:\?|$)/);
      return match ? { bucket: match[1], path: match[2] } : null;
    }

    // 1. CHILD PHOTOS - private bucket, paths are stored as "uuid/filename"
    // Need to use the OLD service role key or find another way
    // Since child-photos was private, we can try fetching via the old public URL pattern
    // Some were public, some were signed
    const { data: criancas } = await newSupabase
      .from('criancas')
      .select('id, nome, foto_url')
      .not('foto_url', 'is', null);
    
    const pathOnlyChildren = (criancas || []).filter(c => c.foto_url && !c.foto_url.startsWith('http'));
    results.child_photos = { total: pathOnlyChildren.length, copied: 0, failed: [] as string[] };

    for (const child of pathOnlyChildren) {
      // Try multiple URL patterns from old project
      const path = child.foto_url;
      const urls = [
        `${OLD_SUPABASE_URL}/storage/v1/object/public/child-photos/${path}`,
        // Also try render/image endpoint  
        `${OLD_SUPABASE_URL}/storage/v1/render/image/public/child-photos/${path}`,
      ];
      
      let success = false;
      for (const url of urls) {
        try {
          const response = await fetch(url);
          if (response.ok) {
            const blob = await response.blob();
            const uint8Array = new Uint8Array(await blob.arrayBuffer());
            const { error } = await newSupabase.storage
              .from('child-photos')
              .upload(path, uint8Array, {
                contentType: blob.type || 'image/jpeg',
                upsert: true,
              });
            if (!error) {
              success = true;
              results.child_photos.copied++;
              break;
            }
          }
        } catch (_) { /* try next */ }
      }
      if (!success) {
        results.child_photos.failed.push(child.nome);
      }
    }

    // 2. PERFIL ATLETA - bucket is "atleta-fotos" 
    const { data: perfis } = await newSupabase
      .from('perfil_atleta')
      .select('id, foto_url')
      .like('foto_url', `%${supabaseUrl.replace('https://', '')}%`);
    
    results.perfil_atleta = { total: (perfis || []).length, copied: 0, failed: [] as string[] };
    
    for (const perfil of perfis || []) {
      const parsed = extractBucketPath(perfil.foto_url);
      if (!parsed) continue;
      
      const oldUrl = `${OLD_SUPABASE_URL}/storage/v1/object/public/${parsed.bucket}/${parsed.path}`;
      const err = await copyFile(oldUrl, parsed.bucket, parsed.path);
      if (err) results.perfil_atleta.failed.push(`${perfil.id}: ${err}`);
      else results.perfil_atleta.copied++;
    }

    // 3. PRODUTOS - bucket is "product-photos"
    const { data: produtos } = await newSupabase
      .from('produtos')
      .select('id, nome, foto_url')
      .like('foto_url', `%${supabaseUrl.replace('https://', '')}%`);
    
    results.produtos = { total: (produtos || []).length, copied: 0, failed: [] as string[] };
    
    for (const prod of produtos || []) {
      const parsed = extractBucketPath(prod.foto_url);
      if (!parsed) continue;
      
      const oldUrl = `${OLD_SUPABASE_URL}/storage/v1/object/public/${parsed.bucket}/${parsed.path}`;
      const err = await copyFile(oldUrl, parsed.bucket, parsed.path);
      if (err) results.produtos.failed.push(`${prod.nome}: ${err}`);
      else results.produtos.copied++;
    }

    return new Response(JSON.stringify({ success: true, results }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("File migration error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
