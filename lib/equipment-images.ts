// Resolve a storage path inside the `equipment-images` bucket to its
// public URL. The bucket is public, so no signed URL needed — direct
// Supabase Storage URL works and lets the browser cache aggressively.
export function publicEquipmentImageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return null;
  return `${supabaseUrl}/storage/v1/object/public/equipment-images/${encodeURIComponent(path)}`;
}
