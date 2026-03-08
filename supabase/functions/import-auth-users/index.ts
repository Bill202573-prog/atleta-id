import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-import-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ImportUser {
  id: string;
  email: string;
  encrypted_password: string;
  email_confirmed_at?: string;
  raw_app_meta_data?: Record<string, unknown>;
  raw_user_meta_data?: Record<string, unknown>;
  created_at?: string;
  phone?: string;
  role?: string;
  aud?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const dbUrl = Deno.env.get("SUPABASE_DB_URL");

    if (!dbUrl) {
      throw new Error("SUPABASE_DB_URL secret not configured");
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Parse body
    const { users }: { users: ImportUser[] } = await req.json();

    if (!Array.isArray(users) || users.length === 0) {
      throw new Error("No users provided");
    }

    // Import postgres driver for direct SQL
    const { default: postgres } = await import("https://deno.land/x/postgresjs@v3.4.5/mod.js");
    const sql = postgres(dbUrl);

    let imported = 0;
    let skipped = 0;
    const errors: Array<{ email: string; error: string }> = [];

    for (const u of users) {
      try {
        const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
          id: u.id,
          email: u.email,
          password: "temp_import_" + Math.random().toString(36).slice(2),
          email_confirm: true,
          user_metadata: u.raw_user_meta_data || {},
          app_metadata: u.raw_app_meta_data || {},
          phone: u.phone || undefined,
        });

        if (createErr) {
          if (
            createErr.message?.includes("already been registered") ||
            createErr.message?.includes("already exists")
          ) {
            skipped++;
            continue;
          }
          errors.push({ email: u.email, error: createErr.message });
          continue;
        }

        // Replace password hash with original using direct SQL
        const userId = created.user?.id || u.id;
        await sql`UPDATE auth.users SET encrypted_password = ${u.encrypted_password} WHERE id = ${userId}::uuid`;

        if (u.created_at) {
          await sql`UPDATE auth.users SET created_at = ${u.created_at}::timestamptz WHERE id = ${userId}::uuid`;
        }

        imported++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push({ email: u.email, error: msg });
      }
    }

    await sql.end();

    return new Response(
      JSON.stringify({ imported, skipped, errors, total: users.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("Import error:", error);
    return new Response(JSON.stringify({ error: msg }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
