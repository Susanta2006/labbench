import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (request) => {
  const secret = Deno.env.get("TEMP_UPLOAD_CLEANUP_SECRET");
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return new Response("Missing Supabase configuration", { status: 500 });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: expired, error } = await admin.from("temporary_uploads")
    .select("id, object_path").lte("expires_at", new Date().toISOString()).limit(500);
  if (error) return Response.json({ error: "Could not list expired uploads" }, { status: 500 });
  if (!expired?.length) return Response.json({ deleted: 0 });

  const { error: removeError } = await admin.storage.from("labbench-temporary-uploads")
    .remove(expired.map((row) => row.object_path));
  if (removeError) return Response.json({ error: "Could not remove expired files" }, { status: 500 });
  const { error: rowError } = await admin.from("temporary_uploads")
    .delete().in("id", expired.map((row) => row.id));
  if (rowError) return Response.json({ error: "Could not remove expired upload records" }, { status: 500 });
  return Response.json({ deleted: expired.length });
});
