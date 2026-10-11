import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const BUCKET = "labbench-temporary-uploads";
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

async function purgeExpiredUploads(admin: any) {
  const { data: expired } = await admin.from("temporary_uploads")
    .select("id, object_path").lte("expires_at", new Date().toISOString()).limit(100);
  if (!expired?.length) return;
  const paths = expired.map((row: { object_path: string }) => row.object_path);
  await admin.storage.from(BUCKET).remove(paths);
  await admin.from("temporary_uploads").delete().in("id", expired.map((row: { id: string }) => row.id));
}

export const createTemporaryUpload = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ name: z.string().min(1).max(255), size: z.number().int().positive().max(MAX_UPLOAD_BYTES), mimeType: z.string().max(150).optional() }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    await purgeExpiredUploads(admin);
    const id = crypto.randomUUID();
    const objectPath = `${id}/${crypto.randomUUID()}`;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { error: insertError } = await admin.from("temporary_uploads").insert({
      id, object_path: objectPath, file_name: data.name, mime_type: data.mimeType || "application/octet-stream",
      file_size: data.size, expires_at: expiresAt,
    });
    if (insertError) throw new Error("Could not prepare temporary cloud storage for this file.");
    const { data: signed, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(objectPath);
    if (error || !signed) {
      await admin.from("temporary_uploads").delete().eq("id", id);
      throw new Error("Could not prepare the upload. Check that the LabBench temporary storage migration has been applied.");
    }
    return { id, path: signed.path, token: signed.token, expiresAt };
  });

export const getTemporaryUploadUrl = createServerFn({ method: "GET" })
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    await purgeExpiredUploads(admin);
    const { data: upload, error } = await admin.from("temporary_uploads")
      .select("object_path, file_name, mime_type, file_size, expires_at")
      .eq("id", data.id).gt("expires_at", new Date().toISOString()).maybeSingle();
    if (error) throw new Error("Could not look up this temporary file.");
    if (!upload) return null;
    const { data: object, error: objectError } = await admin.storage.from(BUCKET).info(upload.object_path);
    if (objectError || !object) return null;
    const { data: signed, error: signError } = await admin.storage.from(BUCKET)
      .createSignedUrl(upload.object_path, 5 * 60, { download: upload.file_name });
    if (signError || !signed) throw new Error("Could not prepare a download for this temporary file.");
    return { url: signed.signedUrl, fileName: upload.file_name, mimeType: upload.mime_type, size: upload.file_size, expiresAt: upload.expires_at };
  });
