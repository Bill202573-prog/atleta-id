import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Usuário não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: { user }, error: userError } = await authClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Sessão inválida" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // GET: list activities and their photo status
    if (req.method === "GET") {
      const { data: rows, error } = await supabaseAdmin
        .from("atividades_externas")
        .select("id, crianca_id, tipo, data, local_atividade, profissional_instituicao, fotos_urls")
        .order("data", { ascending: false });

      if (error) throw error;

      // Also fetch child names
      const criancaIds = [...new Set((rows || []).map((r) => r.crianca_id))];
      const { data: criancas } = await supabaseAdmin
        .from("criancas")
        .select("id, nome")
        .in("id", criancaIds);

      const criancaMap = Object.fromEntries((criancas || []).map((c) => [c.id, c.nome]));

      const activities = (rows || []).map((row) => ({
        id: row.id,
        crianca_id: row.crianca_id,
        crianca_nome: criancaMap[row.crianca_id] || "Desconhecido",
        tipo: row.tipo,
        data: row.data,
        local: row.local_atividade,
        instituicao: row.profissional_instituicao,
        fotos_count: row.fotos_urls?.length || 0,
        fotos_urls: row.fotos_urls || [],
      }));

      return new Response(JSON.stringify({ activities }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POST: upload photo for an activity
    if (req.method === "POST") {
      const formData = await req.formData();
      const atividadeId = String(formData.get("atividadeId") || "").trim();
      const targetPath = String(formData.get("targetPath") || "").trim();
      const file = formData.get("file");

      if (!atividadeId) {
        return new Response(JSON.stringify({ error: "atividadeId é obrigatório" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!(file instanceof File)) {
        return new Response(JSON.stringify({ error: "Arquivo inválido" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get the activity
      const { data: atividade, error: atError } = await supabaseAdmin
        .from("atividades_externas")
        .select("id, crianca_id, fotos_urls")
        .eq("id", atividadeId)
        .maybeSingle();

      if (atError) throw atError;
      if (!atividade) {
        return new Response(JSON.stringify({ error: "Atividade não encontrada" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const filePath = targetPath || `${atividade.crianca_id}/${file.name}`;
      if (!filePath.startsWith(`${atividade.crianca_id}/`)) {
        return new Response(JSON.stringify({ error: "targetPath inválido para a atividade" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const currentPhotos = atividade.fotos_urls || [];
      if (currentPhotos.includes(filePath)) {
        return new Response(JSON.stringify({ success: true, atividadeId, filePath, totalPhotos: currentPhotos.length, alreadyLinked: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (currentPhotos.length >= 3) {
        return new Response(JSON.stringify({ error: "Máximo de 3 fotos por atividade" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: uploadError } = await supabaseAdmin.storage
        .from("atividade-externa-fotos")
        .upload(filePath, file, {
          upsert: true,
          contentType: file.type || undefined,
        });

      if (uploadError) throw uploadError;

      // Update fotos_urls array in the activity
      const newPhotos = [...currentPhotos, filePath];
      const { error: updateError } = await supabaseAdmin
        .from("atividades_externas")
        .update({ fotos_urls: newPhotos })
        .eq("id", atividadeId);

      if (updateError) throw updateError;

      return new Response(JSON.stringify({ success: true, atividadeId, filePath, totalPhotos: newPhotos.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Método não suportado" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro inesperado";
    console.error("migrate-atividade-fotos error:", error);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
