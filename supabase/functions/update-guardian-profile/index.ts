import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type GuardianProfileUpdates = {
  nome?: string | null;
  telefone?: string | null;
  cpf?: string | null;
  cep?: string | null;
  rua?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  estado?: string | null;
  data_nascimento?: string | null;
};

const ALLOWED_FIELDS = new Set([
  "nome",
  "telefone",
  "cpf",
  "cep",
  "rua",
  "numero",
  "complemento",
  "bairro",
  "cidade",
  "estado",
  "data_nascimento",
]);

const normalizeDigits = (value: unknown) =>
  typeof value === "string" ? value.replace(/\D/g, "") : value;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization");

    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Usuário não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await supabaseAuth.auth.getUser();

    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: "Sessão inválida" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = userData.user.id;
    const body = await req.json().catch(() => ({}));
    const updates = (body?.updates ?? body ?? {}) as GuardianProfileUpdates;

    const safeUpdates: Record<string, string | null> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (!ALLOWED_FIELDS.has(key)) continue;
      safeUpdates[key] = typeof value === "string" ? value.trim() || null : value === null ? null : String(value);
    }

    if (safeUpdates.nome === null) {
      return new Response(JSON.stringify({ error: "Nome é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if ("telefone" in safeUpdates) safeUpdates.telefone = normalizeDigits(safeUpdates.telefone) as string | null;
    if ("cpf" in safeUpdates) safeUpdates.cpf = normalizeDigits(safeUpdates.cpf) as string | null;
    if ("cep" in safeUpdates) safeUpdates.cep = normalizeDigits(safeUpdates.cep) as string | null;
    safeUpdates.updated_at = new Date().toISOString();

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: currentGuardian, error: currentError } = await supabaseAdmin
      .from("responsaveis")
      .select("id, user_id, email")
      .eq("user_id", userId)
      .maybeSingle();

    if (currentError) throw currentError;
    if (!currentGuardian) {
      return new Response(JSON.stringify({ error: "Responsável não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data, error } = await supabaseAdmin
      .from("responsaveis")
      .update(safeUpdates)
      .eq("id", currentGuardian.id)
      .select()
      .single();

    if (error) throw error;

    console.log("Guardian profile updated", {
      userId,
      responsavelId: currentGuardian.id,
      fields: Object.keys(safeUpdates).filter((field) => field !== "updated_at"),
    });

    return new Response(JSON.stringify({ data }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("update-guardian-profile error", error);
    const message = error instanceof Error ? error.message : "Erro desconhecido ao salvar";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});