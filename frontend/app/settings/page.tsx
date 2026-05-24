"use client";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function SettingsPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <header>
        <h1 className="text-[24px] font-bold tracking-tight">Settings</h1>
        <p className="text-mute text-sm mt-1">Account and display preferences.</p>
      </header>

      <div className="card p-6 space-y-5">
        <Row label="Theme" hint="Switch between dark and light">
          <ThemeToggle />
        </Row>
        <div className="h-px" style={{ background: "var(--border)" }} />
        <Row label="Email" hint="Sign-in not enabled yet">
          <span className="text-mute text-sm">—</span>
        </Row>
        <div className="h-px" style={{ background: "var(--border)" }} />
        <Row label="Plan" hint="Free tier · upgrade for full access">
          <span className="badge badge-neutral">Free</span>
        </Row>
      </div>
    </div>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="font-medium text-sm">{label}</div>
        <div className="text-xs text-mute mt-0.5">{hint}</div>
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}
