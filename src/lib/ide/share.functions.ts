import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const filesSchema = z.record(z.string().min(1).max(180), z.string().max(150_000));
const imageSchema = z.string().max(4_000_000).regex(/^data:image\/(png|jpeg);base64,/).nullable();

export const createShare = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ files: filesSchema, output: z.string().max(40_000), image: imageSchema.optional() }).parse(input))
  .handler(async ({ data }) => {
    if (Object.keys(data.files).length > 100 || JSON.stringify(data.files).length > 500_000) throw new Error("Folder is too large to share (500 KB max).");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: share, error } = await supabaseAdmin.from("shared_workspaces")
      .insert({ files: data.files, output: data.output, image: data.image ?? null }).select("id, expires_at").single();
    if (error || !share) throw new Error("Could not create a share link. Try again.");
    return { id: share.id, expiresAt: share.expires_at };
  });

export const getShare = createServerFn({ method: "GET" })
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: share, error } = await supabaseAdmin.from("shared_workspaces")
      .select("files, output, image, expires_at").eq("id", data.id).gt("expires_at", new Date().toISOString()).maybeSingle();
    if (error) throw new Error("Unable to open this share right now.");
    return share ? { files: filesSchema.parse(share.files), output: share.output, image: share.image as string | null, expiresAt: share.expires_at } : null;
  });
