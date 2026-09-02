"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Share, X } from "lucide-react";
import { popupsAllowedOn } from "@/lib/funnel";

/**
 * In-app install prompt.
 *
 * Two platforms, two mechanisms:
 *  · Android/Chrome fires `beforeinstallprompt`, which we capture and replay
 *    on a click — the native sheet only opens from a user gesture, so the
 *    event has to be stashed rather than used immediately.
 *  · iOS has no API at all. Safari installs only through Share → Add to Home
 *    Screen, so there the bar can do nothing but say so.
 *
 * Deliberately quiet, because George has just had popups taken off the sales
 * page: a bottom bar rather than a modal, nothing above the fold, no dark
 * pattern on the dismiss, and it obeys the same POPUP_FREE_PREFIXES the funnel
 * popups do. A dismissal is remembered for 60 days; an install hides it for
 * good. It never appears to someone already running the installed app.
 */
const DISMISS_KEY = "ib-install-dismissed";
const DISMISS_DAYS = 60;
const SHOW_AFTER_MS = 12_000;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS reports it here rather than through display-mode.
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function dismissedRecently(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    if (raw === "installed") return true;
    return Date.now() - Number(raw) < DISMISS_DAYS * 86_400_000;
  } catch {
    // Private mode or storage blocked: err towards not nagging.
    return true;
  }
}

export function InstallPrompt() {
  const pathname = usePathname() || "/";
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [iosHint, setIosHint] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isStandalone() || dismissedRecently()) return;

    const onBeforeInstall = (e: Event) => {
      // Chrome shows its own mini-infobar unless this is prevented.
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    const onInstalled = () => {
      try {
        localStorage.setItem(DISMISS_KEY, "installed");
      } catch {
        /* ignore */
      }
      setVisible(false);
    };
    window.addEventListener("appinstalled", onInstalled);

    // iOS never fires beforeinstallprompt, so it is detected instead. Chrome
    // and Firefox on iOS cannot install either — only Safari can.
    const ua = navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(ua);
    const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
    if (isIos && isSafari) setIosHint(true);

    const t = setTimeout(() => setVisible(true), SHOW_AFTER_MS);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      clearTimeout(t);
    };
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
    setVisible(false);
  };

  const install = async () => {
    if (!deferred) return;
    setVisible(false);
    try {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      if (outcome === "dismissed") dismiss();
    } catch {
      /* the sheet was closed — nothing to do */
    }
    setDeferred(null);
  };

  // Nothing to offer, or a surface that must stay clean.
  if (!visible) return null;
  if (!deferred && !iosHint) return null;
  if (!popupsAllowedOn(pathname)) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[45] px-3 pb-3 pointer-events-none"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}
    >
      <div
        className="pointer-events-auto mx-auto flex max-w-lg items-center gap-3 rounded-xl p-3 shadow-lg"
        style={{
          background: "var(--bg-2)",
          border: "1px solid color-mix(in srgb, var(--accent) 34%, var(--border))",
        }}
      >
        <img
          src="/pwa/icon-192.png"
          alt=""
          width={40}
          height={40}
          className="rounded-lg flex-shrink-0"
        />
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-bold leading-tight">
            Add InsiderBuying to your home screen
          </div>
          {deferred ? (
            <div className="text-[11.5px] text-mute leading-snug mt-0.5">
              Full screen, opens straight to the scores.
            </div>
          ) : (
            <div className="text-[11.5px] text-mute leading-snug mt-0.5 inline-flex items-center gap-1 flex-wrap">
              Tap
              <Share className="h-3 w-3 inline" aria-label="the Share button" />
              then <b>Add to Home Screen</b>.
            </div>
          )}
        </div>
        {deferred && (
          <button
            onClick={install}
            className="flex-shrink-0 rounded-lg px-3.5 py-2 text-[13px] font-bold"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            Install
          </button>
        )}
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="flex-shrink-0 rounded-md p-1.5"
          style={{ color: "var(--text-mute)" }}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
