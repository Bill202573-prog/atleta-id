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

    // 1. CHILD PHOTOS - path-only entries that need files copied
    const { data: criancas } = await newSupabase
      .from('criancas')
      .select('id, nome, foto_url')
      .not('foto_url', 'is', null);
    
    const pathOnlyChildren = (criancas || []).filter(c => c.foto_url && !c.foto_url.startsWith('http'));
    results.child_photos = { total: pathOnlyChildren.length, copied: 0, errors: [] as string[] };

    for (const child of pathOnlyChildren) {
      try {
        // The path is like: uuid/filename.jpg
        const path = child.foto_url;
        
        // Try public URL first
        const publicUrl = `${OLD_SUPABASE_URL}/storage/v1/object/public/child-photos/${path}`;
        let response = await fetch(publicUrl);
        
        if (!response.ok) {
          // Some might have been signed/private, try without token  
          results.child_photos.errors.push(`${child.nome}: HTTP ${response.status} from public URL`);
          continue;
        }

        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);

        // Upload to new bucket
        const { error: uploadError } = await newSupabase.storage
          .from('child-photos')
          .upload(path, uint8Array, {
            contentType: blob.type || 'image/jpeg',
            upsert: true,
          });

        if (uploadError) {
          results.child_photos.errors.push(`${child.nome}: Upload error - ${uploadError.message}`);
        } else {
          results.child_photos.copied++;
        }
      } catch (e) {
        results.child_photos.errors.push(`${child.nome}: ${e.message}`);
      }
    }

    // 2. PUBLIC BUCKET FILES - these now point to new domain but files don't exist
    // escolinhas logos
    const { data: escolinhas } = await newSupabase
      .from('escolinhas')
      .select('id, nome, logo_url')
      .like('logo_url', `%${supabaseUrl}%`);
    
    results.escolinha_logos = { total: (escolinhas || []).length, copied: 0, errors: [] as string[] };
    
    for (const escola of escolinhas || []) {
      try {
        // Current URL points to new domain, but file is on old domain
        const oldUrl = escola.logo_url.replace(supabaseUrl, OLD_SUPABASE_URL);
        const response = await fetch(oldUrl);
        if (!response.ok) {
          results.escolinha_logos.errors.push(`${escola.nome}: HTTP ${response.status}`);
          continue;
        }
        
        const blob = await response.blob();
        const uint8Array = new Uint8Array(await blob.arrayBuffer());
        
        // Extract path from URL
        const urlPath = new URL(escola.logo_url).pathname;
        const match = urlPath.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)/);
        if (!match) {
          results.escolinha_logos.errors.push(`${escola.nome}: Can't parse path from ${urlPath}`);
          continue;
        }
        
        const bucket = match[1];
        const filePath = match[2];
        
        // Upload to the appropriate bucket (escolinha-logos or original bucket)
        const targetBucket = bucket === 'escolinha-logos' ? 'escolinha-logos' : bucket;
        const { error: uploadError } = await newSupabase.storage
          .from(targetBucket)
          .upload(filePath, uint8Array, {
            contentType: blob.type || 'image/png',
            upsert: true,
          });
        
        if (uploadError) {
          results.escolinha_logos.errors.push(`${escola.nome}: ${uploadError.message}`);
        } else {
          results.escolinha_logos.copied++;
        }
      } catch (e) {
        results.escolinha_logos.errors.push(`${escola.nome}: ${e.message}`);
      }
    }

    // 3. Professor photos
    const { data: professores } = await newSupabase
      .from('professores')
      .select('id, nome, foto_url')
      .like('foto_url', `%${supabaseUrl}%`);
    
    results.professor_photos = { total: (professores || []).length, copied: 0, errors: [] as string[] };
    
    for (const prof of professores || []) {
      try {
        const oldUrl = prof.foto_url.replace(supabaseUrl, OLD_SUPABASE_URL);
        const response = await fetch(oldUrl);
        if (!response.ok) {
          results.professor_photos.errors.push(`${prof.nome}: HTTP ${response.status}`);
          continue;
        }
        
        const blob = await response.blob();
        const uint8Array = new Uint8Array(await blob.arrayBuffer());
        
        const urlPath = new URL(prof.foto_url).pathname;
        const match = urlPath.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)/);
        if (!match) continue;
        
        const { error: uploadError } = await newSupabase.storage
          .from(match[1] === 'professor-photos' ? 'professor-photos' : match[1])
          .upload(match[2], uint8Array, { contentType: blob.type || 'image/jpeg', upsert: true });
        
        if (uploadError) results.professor_photos.errors.push(`${prof.nome}: ${uploadError.message}`);
        else results.professor_photos.copied++;
      } catch (e) {
        results.professor_photos.errors.push(`${prof.nome}: ${e.message}`);
      }
    }

    // 4. Produto photos
    const { data: produtos } = await newSupabase
      .from('produtos')
      .select('id, nome, foto_url')
      .like('foto_url', `%${supabaseUrl}%`);
    
    results.produto_photos = { total: (produtos || []).length, copied: 0, errors: [] as string[] };
    
    for (const prod of produtos || []) {
      try {
        const oldUrl = prod.foto_url.replace(supabaseUrl, OLD_SUPABASE_URL);
        const response = await fetch(oldUrl);
        if (!response.ok) {
          results.produto_photos.errors.push(`${prod.nome}: HTTP ${response.status}`);
          continue;
        }
        
        const blob = await response.blob();
        const uint8Array = new Uint8Array(await blob.arrayBuffer());
        
        const urlPath = new URL(prod.foto_url).pathname;
        const match = urlPath.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)/);
        if (!match) continue;
        
        const { error: uploadError } = await newSupabase.storage
          .from(match[1] === 'produto-photos' ? 'produto-photos' : match[1])
          .upload(match[2], uint8Array, { contentType: blob.type || 'image/jpeg', upsert: true });
        
        if (uploadError) results.produto_photos.errors.push(`${prod.nome}: ${uploadError.message}`);
        else results.produto_photos.copied++;
      } catch (e) {
        results.produto_photos.errors.push(`${prod.nome}: ${e.message}`);
      }
    }

    // 5. Perfil atleta photos
    const { data: perfis } = await newSupabase
      .from('perfil_atleta')
      .select('id, foto_url')
      .like('foto_url', `%${supabaseUrl}%`);
    
    results.perfil_atleta_photos = { total: (perfis || []).length, copied: 0, errors: [] as string[] };
    
    for (const perfil of perfis || []) {
      try {
        const oldUrl = perfil.foto_url.replace(supabaseUrl, OLD_SUPABASE_URL);
        const response = await fetch(oldUrl);
        if (!response.ok) {
          results.perfil_atleta_photos.errors.push(`ID ${perfil.id}: HTTP ${response.status}`);
          continue;
        }
        
        const blob = await response.blob();
        const uint8Array = new Uint8Array(await blob.arrayBuffer());
        
        const urlPath = new URL(perfil.foto_url).pathname;
        const match = urlPath.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)/);
        if (!match) continue;
        
        const { error: uploadError } = await newSupabase.storage
          .from(match[1] === 'atleta-photos' ? 'atleta-photos' : match[1])
          .upload(match[2], uint8Array, { contentType: blob.type || 'image/jpeg', upsert: true });
        
        if (uploadError) results.perfil_atleta_photos.errors.push(`ID ${perfil.id}: ${uploadError.message}`);
        else results.perfil_atleta_photos.copied++;
      } catch (e) {
        results.perfil_atleta_photos.errors.push(`ID ${perfil.id}: ${e.message}`);
      }
    }

    // 6. Posts escola images
    const { data: postsEscola } = await newSupabase
      .from('posts_escola')
      .select('id, imagens_urls')
      .not('imagens_urls', 'is', null);
    
    const postsWithNewUrls = (postsEscola || []).filter(
      p => p.imagens_urls && JSON.stringify(p.imagens_urls).includes(supabaseUrl.replace('https://', ''))
    );
    
    results.posts_escola_images = { total: postsWithNewUrls.length, copied: 0, errors: [] as string[] };
    
    for (const post of postsWithNewUrls) {
      try {
        for (const imgUrl of post.imagens_urls) {
          if (!imgUrl.includes(supabaseUrl.replace('https://', ''))) continue;
          
          const oldUrl = imgUrl.replace(supabaseUrl, OLD_SUPABASE_URL);
          const response = await fetch(oldUrl);
          if (!response.ok) continue;
          
          const blob = await response.blob();
          const uint8Array = new Uint8Array(await blob.arrayBuffer());
          
          const urlPath = new URL(imgUrl).pathname;
          const match = urlPath.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)/);
          if (!match) continue;
          
          await newSupabase.storage
            .from(match[1] === 'escola-posts' ? 'escola-posts' : match[1])
            .upload(match[2], uint8Array, { contentType: blob.type || 'image/jpeg', upsert: true });
        }
        results.posts_escola_images.copied++;
      } catch (e) {
        results.posts_escola_images.errors.push(`Post ${post.id}: ${e.message}`);
      }
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
