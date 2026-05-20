"use client";

// Styled file-upload drop zone matching the booking flow's design.
// Used in both the multi-step booking form (Step 2) and the
// /account/details edit form so customers see one consistent UX
// for uploading their driver's license.
export function DLDropZone({
  label,
  side,
  uploaded,
  uploading,
  onChange,
}: {
  label: string;
  side: string;
  uploaded: boolean;
  uploading: boolean;
  onChange: (file: File | null) => void;
}) {
  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-widest text-muted">{label}</p>
      <label
        className={`mt-2 flex h-32 flex-col items-center justify-center rounded-2xl border-2 border-dashed cursor-pointer transition-colors ${
          uploaded
            ? "border-accent bg-accent/5"
            : "border-ink/20 hover:border-accent/60 hover:bg-accent/[0.03]"
        }`}
      >
        <input
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        />
        {uploading ? (
          <p className="text-sm text-muted">Uploading…</p>
        ) : uploaded ? (
          <>
            <span className="text-2xl text-accent" aria-hidden>✓</span>
            <p className="mt-1 text-sm font-medium text-accent">Uploaded</p>
            <p className="text-xs text-muted">Click to replace</p>
          </>
        ) : (
          <>
            <span className="text-3xl text-accent leading-none" aria-hidden>+</span>
            <p className="mt-2 text-sm text-ink/70">Upload License {side}</p>
          </>
        )}
      </label>
    </div>
  );
}
