"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Stage = "delivered" | "returned";

type Photo = { path: string; url: string };

// Renders the "Delivered" or "Returned" lifecycle card on the admin
// booking detail page. Admin can stamp a timestamp + upload photos.
// `initialTimestamp` is the ISO value from the DB; `initialPhotos` are
// already-signed URLs the server minted on render (paths stay private).
export function StagePanel({
  bookingId,
  stage,
  initialTimestamp,
  initialPhotos,
}: {
  bookingId: string;
  stage: Stage;
  initialTimestamp: string | null;
  initialPhotos: Photo[];
}) {
  const router = useRouter();
  const [timestamp, setTimestamp] = useState<string>(toLocalInputValue(initialTimestamp));
  const [photos, setPhotos] = useState<Photo[]>(initialPhotos);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMarked = !!initialTimestamp;
  const verbing = stage === "delivered" ? "Delivery" : "Return";
  const stageNoun = stage === "delivered" ? "delivery" : "return";

  async function onFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("stage", stageNoun);
      for (const f of Array.from(files)) form.append("files", f);
      const res = await fetch(`/api/admin/bookings/${bookingId}/condition-photos`, {
        method: "POST",
        body: form,
      });
      const json = await res.json();
      if (!res.ok || !Array.isArray(json.photos)) {
        setError(json.error ?? "Upload failed");
        return;
      }
      setPhotos((prev) => [...prev, ...(json.photos as Photo[])]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  function removePhoto(path: string) {
    setPhotos((prev) => prev.filter((p) => p.path !== path));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const isoTimestamp = timestamp ? new Date(timestamp).toISOString() : null;
      const res = await fetch(`/api/admin/bookings/${bookingId}/mark-stage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          stage,
          timestamp: isoTimestamp,
          photo_paths: photos.map((p) => p.path),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Failed to save");
        return;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function clearStage() {
    if (!confirm(`Clear the ${stageNoun} record? This removes the timestamp but leaves uploaded photos in storage.`)) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}/mark-stage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stage, timestamp: null, photo_paths: [] }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? "Failed to clear");
        return;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-6 rounded-2xl border border-ink/10 p-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-mono text-xs uppercase tracking-widest text-muted">{verbing}</h2>
        {isMarked && (
          <span className="rounded-full bg-emerald-50 border border-emerald-300 px-3 py-1 text-xs font-mono uppercase tracking-widest text-emerald-900">
            ✓ Marked
          </span>
        )}
      </div>

      {error && (
        <div className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
          {error}
        </div>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm text-muted">{verbing} date &amp; time</span>
          <input
            type="datetime-local"
            value={timestamp}
            onChange={(e) => setTimestamp(e.target.value)}
            className="mt-1 w-full rounded-lg border border-ink/15 bg-paper px-3 py-2 font-mono text-sm"
          />
        </label>
        <label className="block">
          <span className="text-sm text-muted">Add photos</span>
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={onFileSelect}
            disabled={uploading || saving}
            className="mt-1 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-ink file:text-paper file:px-3 file:py-2 file:font-medium hover:file:bg-ink/85"
          />
          {uploading && <p className="mt-1 text-xs text-muted">Uploading…</p>}
        </label>
      </div>

      {photos.length > 0 && (
        <div className="mt-4 grid gap-2 grid-cols-3 sm:grid-cols-4 md:grid-cols-6">
          {photos.map((p) => (
            <div key={p.path} className="relative group rounded-lg overflow-hidden border border-ink/10 bg-ink/5 aspect-square">
              {p.url ? (
                <a href={p.url} target="_blank" rel="noopener">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt="" className="w-full h-full object-cover" />
                </a>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs text-muted text-center px-2">
                  Saved
                </div>
              )}
              <button
                type="button"
                onClick={() => removePhoto(p.path)}
                className="absolute top-1 right-1 rounded-full bg-red-600 text-white text-xs w-6 h-6 leading-6 opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Remove photo"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-5 flex items-center justify-between gap-3">
        {isMarked ? (
          <button
            type="button"
            onClick={clearStage}
            disabled={saving}
            className="rounded-full border border-ink/15 px-5 py-2 text-sm font-medium hover:bg-ink/5 disabled:opacity-50 transition-colors"
          >
            Clear {stageNoun}
          </button>
        ) : <span />}
        <button
          type="button"
          onClick={save}
          disabled={saving || uploading || !timestamp}
          className="rounded-full bg-accent text-paper px-5 py-2 text-sm font-medium hover:bg-accent-hover disabled:opacity-50 transition-colors"
        >
          {saving ? "Saving…" : isMarked ? "Update" : `Mark ${stageNoun}`}
        </button>
      </div>
    </section>
  );
}

// `<input type="datetime-local">` wants "YYYY-MM-DDTHH:MM" in local time.
// Convert the ISO timestamp from the DB by formatting from a Date object.
function toLocalInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
