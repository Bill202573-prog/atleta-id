import "https://deno.land/std@0.224.0/dotenv/load.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

Deno.test("OPTIONS returns CORS headers", async () => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/change-password`, {
    method: "OPTIONS",
    headers: {
      "Origin": "https://example.com",
      "apikey": SUPABASE_ANON_KEY,
    },
  });
  const body = await res.text();
  console.log("OPTIONS status:", res.status);
  console.log("CORS allow-origin:", res.headers.get("access-control-allow-origin"));
  console.log("CORS allow-headers:", res.headers.get("access-control-allow-headers"));
  if (res.status > 204) {
    throw new Error(`OPTIONS failed with status ${res.status}: ${body}`);
  }
});

Deno.test("POST without auth returns 401", async () => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/change-password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ new_password: "test123456" }),
  });
  const data = await res.json();
  console.log("POST no-auth status:", res.status, "body:", JSON.stringify(data));
  if (res.status !== 401) {
    throw new Error(`Expected 401, got ${res.status}`);
  }
});

Deno.test("POST with short password returns 400", async () => {
  // Use a fake token to test - should get 401 since token is invalid
  const res = await fetch(`${SUPABASE_URL}/functions/v1/change-password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": "Bearer fake-token-12345",
    },
    body: JSON.stringify({ new_password: "ab" }),
  });
  const data = await res.json();
  console.log("POST fake-token status:", res.status, "body:", JSON.stringify(data));
  // Should be 401 since token is invalid
  if (res.status !== 401) {
    throw new Error(`Expected 401 for fake token, got ${res.status}`);
  }
});
