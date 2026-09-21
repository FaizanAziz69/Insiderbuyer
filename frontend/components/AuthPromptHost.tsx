"use client";
import { useEffect, useState } from "react";
import { LoginModal } from "@/components/LoginModal";
import { AUTH_PROMPT_EVENT, type AuthPromptDetail } from "@/lib/auth-prompt";

/** Mounted once in AppShell; opens the sign-up modal on `requireAccount()`. */
export function AuthPromptHost() {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string | undefined>(undefined);
  useEffect(() => {
    const onPrompt = (e: Event) => {
      const d = (e as CustomEvent<AuthPromptDetail>).detail || {};
      setReason(d.reason);
      setOpen(true);
    };
    window.addEventListener(AUTH_PROMPT_EVENT, onPrompt);
    return () => window.removeEventListener(AUTH_PROMPT_EVENT, onPrompt);
  }, []);
  return <LoginModal open={open} onClose={() => setOpen(false)} initialMode="signup" subtitle={reason} />;
}
