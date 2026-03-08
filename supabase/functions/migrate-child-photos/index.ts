import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface PendingChild {
  id: string;
  nome: string;
  foto_url: string;
  uploaded: boolean;
}

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

    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Sessão inválida" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    if (req.method === "GET") {
      const { data: rows, error } = await supabaseAdmin
        .from("criancas")
        .select("id, nome, foto_url")
        .not("foto_url", "is", null)
        .not("foto_url", "like", "http%")
        .order("nome");

      if (error) throw error;

      const children: PendingChild[] = await Promise.all(
        (rows || []).map(async (child) => {
          const [folder, ...rest] = (child.foto_url || "").split("/");
          const fullName = rest.join("/");
          const targetName = fullName.split("/").pop() || fullName;

          if (!folder || !targetName) {
            return {
              id: child.id,
              nome: child.nome,
              foto_url: child.foto_url,
              uploaded: false,
            };
          }

          const { data: files } = await supabaseAdmin.storage
            .from("child-photos")
            .list(folder, { limit: 100, search: targetName });

          return {
            id: child.id,
            nome: child.nome,
            foto_url: child.foto_url,
            uploaded: !!files?.some((f) => f.name === targetName),
          };
        })
      );

      return new Response(JSON.stringify({ children }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (req.method === "POST") {
      const formData = await req.formData();
      const childId = String(formData.get("childId") || "").trim();
      const file = formData.get("file");

      if (!childId) {
        return new Response(JSON.stringify({ error: "childId é obrigatório" }), {
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

      const { data: child, error: childError } = await supabaseAdmin
        .from("criancas")
        .select("id, nome, foto_url")
        .eq("id", childId)
        .maybeSingle();

      if (childError) throw childError;

      if (!child?.foto_url || child.foto_url.startsWith("http")) {
        return new Response(
          JSON.stringify({ error: "Caminho de foto inválido para esta criança" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const { error: uploadError } = await supabaseAdmin.storage
        .from("child-photos")
        .upload(child.foto_url, file, {
          upsert: true,
          contentType: file.type || undefined,
        });

      if (uploadError) throw uploadError;

      return new Response(JSON.stringify({ success: true, childId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Método não suportado" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro inesperado";
    console.error("migrate-child-photos error:", error);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
