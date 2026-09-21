"use client";
/**
 * One site-wide "you need a free account for this" prompt.
 *
 * George 2026-09-21: "when you click add to watch list without having an
 * account, this must prompt the user to create an account (free)". Any
 * component can call `requireAccount()`; <AuthPromptHost> (mounted once in
 * AppShell) listens and opens the LoginModal in sign-up mode. Kept as an
 * event so a table cell never has to mount its own modal inside a row link.
 */
export const AUTH_PROMPT_EVENT = "ib:require-account";

export interface AuthPromptDetail {
  /** Why the account is needed — shown as the modal's subtitle. */
  reason?: string;
}

export function requireAccount(detail: AuthPromptDetail = {}): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<AuthPromptDetail>(AUTH_PROMPT_EVENT, { detail }));
}
