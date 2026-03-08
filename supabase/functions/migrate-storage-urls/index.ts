import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const OLD_DOMAIN = "https://obvfyxiuvcpiogdyclke.supabase.co";
    const NEW_DOMAIN = supabaseUrl; // https://vxzktyklzkfqitptzctk.supabase.co

    const results: Record<string, any> = {};

    // 1. PUBLIC BUCKETS - Simple domain replacement
    // escolinhas.logo_url
    const { data: r1, error: e1 } = await supabase.rpc('exec_sql', { 
      sql: '' // won't work, need raw SQL
    }).select();

    // Use direct postgres via fetch to supabase REST API with service role
    const pgUrl = `${supabaseUrl}/rest/v1/rpc/`;
    
    // Actually, let's use supabase client updates directly
    
    // 1a. escolinhas.logo_url
    const { data: escolinhas } = await supabase
      .from('escolinhas')
      .select('id, logo_url')
      .like('logo_url', `%obvfyxiuvcpiogdyclke%`);
    
    if (escolinhas) {
      for (const row of escolinhas) {
        const newUrl = row.logo_url.replace(OLD_DOMAIN, NEW_DOMAIN);
        await supabase.from('escolinhas').update({ logo_url: newUrl }).eq('id', row.id);
      }
      results['escolinhas.logo_url'] = escolinhas.length;
    }

    // 1b. professores.foto_url
    const { data: professores } = await supabase
      .from('professores')
      .select('id, foto_url')
      .like('foto_url', `%obvfyxiuvcpiogdyclke%`);
    
    if (professores) {
      for (const row of professores) {
        const newUrl = row.foto_url.replace(OLD_DOMAIN, NEW_DOMAIN);
        await supabase.from('professores').update({ foto_url: newUrl }).eq('id', row.id);
      }
      results['professores.foto_url'] = professores.length;
    }

    // 1c. produtos.foto_url
    const { data: produtos } = await supabase
      .from('produtos')
      .select('id, foto_url')
      .like('foto_url', `%obvfyxiuvcpiogdyclke%`);
    
    if (produtos) {
      for (const row of produtos) {
        const newUrl = row.foto_url.replace(OLD_DOMAIN, NEW_DOMAIN);
        await supabase.from('produtos').update({ foto_url: newUrl }).eq('id', row.id);
      }
      results['produtos.foto_url'] = produtos.length;
    }

    // 1d. perfil_atleta.foto_url
    const { data: perfis } = await supabase
      .from('perfil_atleta')
      .select('id, foto_url')
      .like('foto_url', `%obvfyxiuvcpiogdyclke%`);
    
    if (perfis) {
      for (const row of perfis) {
        const newUrl = row.foto_url.replace(OLD_DOMAIN, NEW_DOMAIN);
        await supabase.from('perfil_atleta').update({ foto_url: newUrl }).eq('id', row.id);
      }
      results['perfil_atleta.foto_url'] = perfis.length;
    }

    // 1e. posts_escola.imagens_urls (array)
    const { data: postsEscola } = await supabase
      .from('posts_escola')
      .select('id, imagens_urls');
    
    const postsEscolaAffected = (postsEscola || []).filter(
      p => p.imagens_urls && JSON.stringify(p.imagens_urls).includes('obvfyxiuvcpiogdyclke')
    );
    
    for (const row of postsEscolaAffected) {
      const newUrls = row.imagens_urls.map((url: string) => 
        url.replace(OLD_DOMAIN, NEW_DOMAIN)
      );
      await supabase.from('posts_escola').update({ imagens_urls: newUrls }).eq('id', row.id);
    }
    results['posts_escola.imagens_urls'] = postsEscolaAffected.length;

    // 2. PRIVATE BUCKETS - Convert to path-only

    // 2a. criancas.foto_url -> extract path after child-photos/
    const { data: criancas } = await supabase
      .from('criancas')
      .select('id, foto_url')
      .like('foto_url', `%obvfyxiuvcpiogdyclke%`);
    
    if (criancas) {
      for (const row of criancas) {
        // Remove query params first
        const urlWithoutParams = row.foto_url.split('?')[0];
        // Extract path after child-photos/
        const match = urlWithoutParams.match(/child-photos\/(.+)/);
        if (match) {
          const path = match[1];
          await supabase.from('criancas').update({ foto_url: path }).eq('id', row.id);
        }
      }
      results['criancas.foto_url'] = criancas.length;
    }

    // 2b. atividades_externas.fotos_urls (array) -> extract paths
    const { data: atividades } = await supabase
      .from('atividades_externas')
      .select('id, fotos_urls');
    
    const atividadesAffected = (atividades || []).filter(
      a => a.fotos_urls && JSON.stringify(a.fotos_urls).includes('obvfyxiuvcpiogdyclke')
    );
    
    for (const row of atividadesAffected) {
      const newPaths = row.fotos_urls.map((url: string) => {
        if (!url.includes('obvfyxiuvcpiogdyclke')) return url;
        const urlWithoutParams = url.split('?')[0];
        const match = urlWithoutParams.match(/atividade-externa-fotos\/(.+)/);
        return match ? match[1] : url;
      });
      await supabase.from('atividades_externas').update({ fotos_urls: newPaths }).eq('id', row.id);
    }
    results['atividades_externas.fotos_urls'] = atividadesAffected.length;

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Migration error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
