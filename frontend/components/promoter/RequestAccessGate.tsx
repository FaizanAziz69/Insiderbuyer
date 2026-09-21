"use client";
import { useState } from "react";
import { Lock } from "lucide-react";
import { API_BASE } from "@/lib/api";
import type { DatasetKey } from "@/lib/data-access";

/**
 * The Request Access form that stands where the subscription paywall used to
 * (George 2026-09-21). Four fields, exactly as specified: name, title,
 * company, company email.
 */

const FIELDS = [
  { key: "name", label: "Name", placeholder: "Jane Okafor", autoComplete: "name" },
  { key: "title", label: "Title", placeholder: "Head of Research", autoComplete: "organization-title" },
  { key: "company", label: "Company", placeholder: "Northline Capital", autoComplete: "organization" },
  { key: "companyEmail", label: "Company email", placeholder: "jane@northline.com", autoComplete: "email" },
] as const;

type FieldKey = (typeof FIELDS)[number]["key"];

export function RequestAccessGate({
  dataset,
  title = "This dataset is available on request",
  blurb,
  bullets,
}: {
  dataset: DatasetKey;
  title?: string;
  blurb?: string;
  bullets?: string[];
}) {
  const [form, setForm] = useState<Record<FieldKey, string>>({
    name: "",
    title: "",
    company: "",
    companyEmail: "",
  });
  const [state, setState] = useState<"idle" | "busy" | "done" | "already">("idle");
  const [error, setError] = useState<string | null>(null);

  const set = (k: FieldKey, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setError(null);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state === "busy") return;
    setState("busy");
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/data-access/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, dataset }),
      });
      const json = (await res.json().catch(() => null)) as { status?: string; message?: string } | null;
      if (!res.ok) throw new Error(json?.message || "Something went wrong. Please try again.");
      setState(json?.status === "approved" ? "already" : "done");
    } catch (err) {
      setState("idle");
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  }

  if (state === "done" || state === "already") {
    return (
      <section
        id="request-access"
        className="rounded-xl px-6 py-8 text-center"
        style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
      >
        <h3 className="text-[18px] font-bold" style={{ color: "var(--text)" }}>
          {state === "already" ? "You already have access" : "Request received"}
        </h3>
        <p className="text-[13.5px] mt-2 max-w-[520px] mx-auto" style={{ color: "var(--text-mute)" }}>
          {state === "already"
            ? "Access for this address was already approved. Open the link in the approval email to unlock the dataset in this browser."
            : "We review each request by hand. If it is approved you will get an email at your company address with a link that opens the dataset."}
        </p>
      </section>
    );
  }

  return (
    <section
      id="request-access"
      className="rounded-xl px-6 py-7"
      style={{
        border: "1px solid color-mix(in srgb, var(--premium) 30%, var(--border))",
        background: "linear-gradient(180deg, color-mix(in srgb, var(--premium) 7%, var(--bg-2)) 0%, var(--bg-2) 100%)",
      }}
    >
      <div className="max-w-[640px] mx-auto text-center">
        <Lock className="h-5 w-5 mx-auto" style={{ color: "var(--premium)" }} aria-hidden />
        <h3 className="text-[19px] font-bold mt-2" style={{ color: "var(--text)" }}>
          {title}
        </h3>
        <p className="text-[13.5px] mt-2" style={{ color: "var(--text-mute)" }}>
          {blurb ||
            "This is a business dataset rather than part of a subscription, so it is not something you can buy from this page. Tell us who you are and we will review your request."}
        </p>
        {bullets?.length ? (
          <ul className="text-[13px] mt-4 space-y-1.5 text-left inline-block" style={{ color: "var(--text-soft)" }}>
            {bullets.map((b) => (
              <li key={b} className="flex gap-2">
                <span style={{ color: "var(--premium)" }}>·</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        ) : null}

        <form onSubmit={submit} className="mt-6 grid gap-3 sm:grid-cols-2 text-left">
          {FIELDS.map((f) => (
            <label key={f.key} className="block">
              <span className="block text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--text-mute)" }}>
                {f.label}
              </span>
              <input
                required
                type={f.key === "companyEmail" ? "email" : "text"}
                autoComplete={f.autoComplete}
                value={form[f.key]}
                onChange={(e) => set(f.key, e.target.value)}
                placeholder={f.placeholder}
                className="w-full h-11 rounded-md px-3 text-[14px]"
                style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text)" }}
              />
            </label>
          ))}
          <div className="sm:col-span-2 flex flex-col items-center gap-2 mt-1">
            <button
              type="submit"
              disabled={state === "busy"}
              className="h-11 px-7 rounded-md text-[14px] font-extrabold w-full sm:w-auto"
              style={{ background: "var(--accent)", color: "#fff", opacity: state === "busy" ? 0.7 : 1 }}
            >
              {state === "busy" ? "Sending…" : "Request access"}
            </button>
            <span className="text-[11.5px]" style={{ color: "var(--text-mute)" }}>
              Please use your company email address. We review each request by hand.
            </span>
          </div>
        </form>
        {error && (
          <p className="text-[13px] mt-3" role="alert" style={{ color: "var(--bad)" }}>
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
