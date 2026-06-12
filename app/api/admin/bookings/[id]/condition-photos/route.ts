import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

const PathSchema = z.object({ id: z.string().uuid() });
const StageSchema = z.enum(["delivery", "return"]);

function parseAdminEmails(): Set<string> {
  const raw = process.env.BIGDS_ADMIN_EMAIL ?? "";
  return new Set(raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
}

const BUCKET = "condition-photos";
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB per photo
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/heic", "image/heif", "image/webp"]);

// Multipart upload endpoint. Admin posts one or more "files" plus a
// "stage" form field ("delivery" or "return"). Each file is stored at
// condition-photos/<bookingId>/<stage>/<uuid>.<ext>. Returns the array
// of storage paths so the client can persist them via mark-stage.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await createSupabaseServerClient();
  const { data: { user } } = await auth.auth.getUser();
  const adminEmails = parseAdminEmails();
  if (!user?.email || !adminEmails.has(user.email.toLowerCase())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = PathSchema.safeParse(await params);
  if (!parsed.success) return NextResponse.json({ error: "Invalid booking id" }, { status: 400 });
  const { id } = parsed.data;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const stageResult = StageSchema.safeParse(form.get("stage"));
  if (!stageResult.success) {
    return NextResponse.json({ error: "stage must be 'delivery' or 'return'" }, { status: 400 });
  }
  const stage = stageResult.data;

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
  }

  const supabase = createSupabaseServiceClient();
  const uploaded: { path: string; url: string }[] = [];
  for (const file of files) {
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: `${file.name}: exceeds 10 MB limit` }, { status: 400 });
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: `${file.name}: unsupported type ${file.type}` }, { status: 400 });
    }
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${id}/${stage}/${randomUUID()}.${ext}`;
    const buf = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, buf, { contentType: file.type, upsert: false });
    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }
    // Mint a signed URL so the client can render a thumbnail
    // immediately, before the admin saves the form.
    const { data: signed } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, 60 * 60);
    uploaded.push({ path, url: signed?.signedUrl ?? "" });
  }

  return NextResponse.json({ ok: true, photos: uploaded });
}
