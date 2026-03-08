import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Old system config
const OLD_SUPABASE_URL = "https://obvfyxiuvcpiogdyclke.supabase.co";
const OLD_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9idmZ5eGl1dmNwaW9nZHljbGtlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYzNTgwMzUsImV4cCI6MjA4MTkzNDAzNX0.hTeeBTYTqJwbZI9w-cSaGaummesDe5dmvUXgagyU1DQ";

// Complete mapping: new_activity_id → photo_paths
const MAPPING: Record<string, string[]> = {
  // David - competicao_torneio 2025-12-01
  "34e0cebc-3a6b-4b3d-bc82-5bb8226b13df": [
    "89c8bf37-31fd-4b60-b376-757d00e5a098/1772132486624-9w4a4fhcx.png",
  ],
  // David - treino 2026-01-02
  "dbe9fef9-1c5c-44d2-bb53-6a06714904fe": [
    "89c8bf37-31fd-4b60-b376-757d00e5a098/1772132436057-hftcy2tvw.png",
  ],
  // Cristiano - clinica_camp 2026-02-05
  "c240e3fd-fc33-46cc-b603-5b92f4f70ddc": [
    "a67a6e1b-e33f-4c2e-85a5-b5d29fdfbc05/1771894177589-lk2dn1bij.png",
  ],
  // Miguel - competicao_torneio 2025-12-14
  "7692c1e2-2d4c-4419-8518-b08c5ee2f04c": [
    "b196c67a-1983-4456-92fc-89609d22fb52/1770916869147-58vkeerfd.jpg",
  ],
  // Miguel - treino 2026-01-20
  "504a06bb-e47d-493a-b488-4aef1c7f0ab0": [
    "b196c67a-1983-4456-92fc-89609d22fb52/1770916302277-pz965hi4o.jpg",
    "b196c67a-1983-4456-92fc-89609d22fb52/1770916304103-8kz0m9qfk.jpg",
    "b196c67a-1983-4456-92fc-89609d22fb52/1770916305842-2udzya3um.jpg",
  ],
  // Miguel - clinica_camp 2026-01-30
  "8afb46c9-31ba-416e-99fd-603544ac0b42": [
    "b196c67a-1983-4456-92fc-89609d22fb52/1770915990598-okwdzz9ft.jpg",
    "b196c67a-1983-4456-92fc-89609d22fb52/1770915993521-d4ckkei1x.jpg",
    "b196c67a-1983-4456-92fc-89609d22fb52/1770915995164-j4tuyuchs.jpg",
  ],
  // Guilherme - clinica_camp 2026-01-29
  "9cfcbb8e-394d-4f49-91da-8c62096eedf5": [
    "e1277a26-c847-483b-a3f9-e76fad2ce8ac/1770321004212-z8xlzkf4a.jpg",
    "e1277a26-c847-483b-a3f9-e76fad2ce8ac/1770321060323-d41bnhfpn.jpg",
    "e1277a26-c847-483b-a3f9-e76fad2ce8ac/1770321061436-wlilmzq9m.jpg",
  ],
  // Guilherme - treino 2026-01-02
  "0fe1f34b-05b9-4ede-88bf-71e9cd8c4bf1": [
    "e1277a26-c847-483b-a3f9-e76fad2ce8ac/1770322673737-mg7ydg2a5.jpg",
    "e1277a26-c847-483b-a3f9-e76fad2ce8ac/1770322675235-lefrkdz0x.jpg",
  ],
  // Guilherme - avaliacao 2026-02-05
  "553ec2c0-b6e4-4a0f-ac13-b1bf4a57e7a3": [
    "e1277a26-c847-483b-a3f9-e76fad2ce8ac/1770325021242-ty3wt1ucl.jpg",
  ],
  // João Guilherme - competicao_torneio 2025-10-11
  "55315eca-1b88-41a0-a688-528ed9981929": [
    "ed3e3083-7455-452d-b7ac-6734c191adf4/1770061431486-hknk3d320.jpg",
    "ed3e3083-7455-452d-b7ac-6734c191adf4/1770061478287-ku66ja0rv.jpg",
    "ed3e3083-7455-452d-b7ac-6734c191adf4/1770062483967-piju49o12.jpg",
  ],
  // João Guilherme - competicao_torneio 2025-10-18
  "43bcbf0e-fe01-4c4f-8cf9-617f3f16bac6": [
    "ed3e3083-7455-452d-b7ac-6734c191adf4/1770062801529-4yeokx9ms.jpg",
    "ed3e3083-7455-452d-b7ac-6734c191adf4/1770063490724-o0c20foa9.jpg",
  ],
};

// Unmapped photos (no activity in new system)
const UNMAPPED = [
  "15c3695f-b846-4eff-b536-104c6b65eb80/1770167499888-bt922dyn0.jpg",
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
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

    const newAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const oldClient = createClient(OLD_SUPABASE_URL, OLD_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const url = new URL(req.url);
    const dryRun = url.searchParams.get("dry") === "true";

    const results: Array<{
      activity_id: string;
      path: string;
      status: string;
      error?: string;
    }> = [];

    for (const [activityId, paths] of Object.entries(MAPPING)) {
      for (const path of paths) {
        try {
          // 1. Get signed URL from old system
          const { data: signedData, error: signedError } = await oldClient.storage
            .from("atividade-externa-fotos")
            .createSignedUrl(path, 3600);

          if (signedError || !signedData?.signedUrl) {
            results.push({
              activity_id: activityId,
              path,
              status: "error",
              error: `Signed URL failed: ${signedError?.message || "no URL"}`,
            });
            continue;
          }

          if (dryRun) {
            results.push({ activity_id: activityId, path, status: "dry_run_ok" });
            continue;
          }

          // 2. Download the file
          const fileRes = await fetch(signedData.signedUrl);
          if (!fileRes.ok) {
            results.push({
              activity_id: activityId,
              path,
              status: "error",
              error: `Download failed: ${fileRes.status}`,
            });
            continue;
          }

          const fileBlob = await fileRes.blob();
          const contentType = fileRes.headers.get("content-type") || "image/jpeg";

          // 3. Upload to new bucket with same path
          const { error: uploadError } = await newAdmin.storage
            .from("atividade-externa-fotos")
            .upload(path, fileBlob, {
              upsert: true,
              contentType,
            });

          if (uploadError) {
            results.push({
              activity_id: activityId,
              path,
              status: "error",
              error: `Upload failed: ${uploadError.message}`,
            });
            continue;
          }

          results.push({ activity_id: activityId, path, status: "uploaded" });
        } catch (e) {
          results.push({
            activity_id: activityId,
            path,
            status: "error",
            error: e instanceof Error ? e.message : "Unknown error",
          });
        }
      }
    }

    // 4. Update fotos_urls in the database
    const dbUpdates: Array<{ activity_id: string; status: string; error?: string }> = [];

    if (!dryRun) {
      for (const [activityId, paths] of Object.entries(MAPPING)) {
        const uploadedPaths = results
          .filter((r) => r.activity_id === activityId && r.status === "uploaded")
          .map((r) => r.path);

        if (uploadedPaths.length === 0) {
          dbUpdates.push({
            activity_id: activityId,
            status: "skipped",
            error: "No photos uploaded successfully",
          });
          continue;
        }

        const { error: updateError } = await newAdmin
          .from("atividades_externas")
          .update({ fotos_urls: uploadedPaths })
          .eq("id", activityId);

        if (updateError) {
          dbUpdates.push({
            activity_id: activityId,
            status: "error",
            error: updateError.message,
          });
        } else {
          dbUpdates.push({
            activity_id: activityId,
            status: "updated",
          });
        }
      }
    }

    const totalPhotos = Object.values(MAPPING).flat().length;
    const uploaded = results.filter((r) => r.status === "uploaded").length;
    const errors = results.filter((r) => r.status === "error").length;
    const dbOk = dbUpdates.filter((d) => d.status === "updated").length;

    return new Response(
      JSON.stringify({
        summary: {
          total_photos: totalPhotos,
          uploaded,
          errors,
          db_updated: dbOk,
          dry_run: dryRun,
          unmapped_photos: UNMAPPED,
        },
        photo_results: results,
        db_results: dbUpdates,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro inesperado";
    console.error("migrate-atividade-fotos-auto error:", error);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
