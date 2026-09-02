"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Share, X, Plus } from "lucide-react";
import { popupsAllowedOn } from "@/lib/funnel";

/**
 * In-app install prompt.
 *
 * Android/Chrome fires `beforeinstallprompt`, which is captured and replayed
 * on a click — the native sheet only opens from a gesture, so the event has to
 * be stashed rather than used on arrival.
 *
 * iOS has NO install API. Safari installs only through Share → Add to Home
 * Screen, and no script can open that sheet. The first version therefore had
 * nothing to tap on iPhone: the button only rendered when a captured event
 * existed, so the bar looked actionable and did nothing. On iOS the whole bar
 * is now a button that opens the actual steps, which is the only thing a page
 * can do there.
 *
 * Dismissal is per SESSION, not for weeks: the bar comes back on the next
 * visit until the app is actually installed (George, 2026-09-02). An install
 * silences it for good — `appinstalled` on Android, and on iOS the fact that a
 * standalone launch reports itself.
 */
const INSTALLED_KEY = "ib-install-done";
const SESSION_KEY = "ib-install-hidden";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function InstallPrompt() {
  const pathname = usePathname() || "/";
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [visible, setVisible] = useState(false);
  const [steps, setSteps] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  // The funnel popups are full-screen modals anchored over the same corner.
  // While one is open its backdrop eats every tap, so the install bar looks
  // present but dead — which is exactly how this was reported on iPhone.
  // Yield to them rather than stack on top.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const check = () => setModalOpen(!!document.querySelector('[role="dialog"][aria-modal="true"]'));
    check();
    const mo = new MutationObserver(check);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Running as the installed app: mark it and never ask again.
    if (isStandalone()) {
      try {
        localStorage.setItem(INSTALLED_KEY, "1");
      } catch {
        /* ignore */
      }
      return;
    }
    try {
      if (localStorage.getItem(INSTALLED_KEY) === "1") return;
      if (sessionStorage.getItem(SESSION_KEY) === "1") return;
    } catch {
      /* storage blocked — still show, it is only a bar */
    }

    const onBeforeInstall = (e: Event) => {
      e.preventDefault(); // suppress Chrome's own mini-infobar
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      try {
        localStorage.setItem(INSTALLED_KEY, "1");
      } catch {
        /* ignore */
      }
      setVisible(false);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    // Only Safari can install on iOS — Chrome and Firefox there cannot, so
    // telling their users to "Add to Home Screen" would be a dead end.
    const ua = navigator.userAgent;
    const isIos =
      /iPad|iPhone|iPod/.test(ua) ||
      // iPadOS 13+ reports itself as a Mac; the touch points give it away.
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
    if (isIos && isSafari) setIos(true);

    setVisible(true);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  /** Hidden for this session only — it returns next visit until installed. */
  const dismiss = () => {
    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      /* ignore */
    }
    setVisible(false);
    setSteps(false);
  };

  const install = async () => {
    if (!deferred) return;
    try {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      if (outcome === "accepted") {
        try {
          localStorage.setItem(INSTALLED_KEY, "1");
        } catch {
          /* ignore */
        }
      }
      setVisible(false);
    } catch {
      /* sheet closed */
    }
    setDeferred(null);
  };

  if (!visible || modalOpen) return null;
  if (!deferred && !ios) return null;
  if (!popupsAllowedOn(pathname)) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[45] px-3 pointer-events-none"
      // Safari's floating URL bar sits above the safe-area inset and is not
      // covered by it, so the bar has to clear both or it renders half-hidden
      // behind Safari's own chrome (seen in the iOS 26 simulator).
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 68px)" }}
    >
      <div
        className="pointer-events-auto mx-auto max-w-lg rounded-xl shadow-lg overflow-hidden"
        style={{
          background: "var(--bg-2)",
          border: "1px solid color-mix(in srgb, var(--accent) 34%, var(--border))",
        }}
      >
        <div className="flex items-center gap-3 p-3">
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
            <div className="text-[11.5px] text-mute leading-snug mt-0.5">
              Full screen, opens straight to the scores.
            </div>
          </div>

          {deferred ? (
            <button
              onClick={install}
              className="flex-shrink-0 rounded-lg px-3.5 py-2 text-[13px] font-bold"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              Install
            </button>
          ) : (
            // iOS: no API exists, so the button can only reveal the steps.
            <button
              onClick={() => setSteps((v) => !v)}
              className="flex-shrink-0 rounded-lg px-3.5 py-2 text-[13px] font-bold"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              {steps ? "Close" : "How"}
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

        {steps && (
          <div
            className="px-3 pb-3 pt-1 text-[12.5px] leading-relaxed"
            style={{ borderTop: "1px solid var(--border)", color: "var(--text)" }}
          >
            <ol className="space-y-2 mt-2">
              <li className="flex items-start gap-2">
                <span className="font-bold" style={{ color: "var(--accent)" }}>1.</span>
                <span className="inline-flex items-center gap-1.5 flex-wrap">
                  At the bottom of Safari, tap
                  <b className="whitespace-nowrap">&#8943;</b>
                  <span className="text-mute">(newer iOS)</span> or the Share icon
                  <Share className="h-4 w-4" style={{ color: "var(--accent)" }} />
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold" style={{ color: "var(--accent)" }}>2.</span>
                <span className="inline-flex items-center gap-1.5 flex-wrap">
                  Scroll down and tap
                  <b className="inline-flex items-center gap-1">
                    <Plus className="h-3.5 w-3.5" /> Add to Home Screen
                  </b>
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold" style={{ color: "var(--accent)" }}>3.</span>
                <span>
                  Tap <b>Add</b> — the app appears on your home screen.
                </span>
              </li>
            </ol>
            <p className="text-mute text-[11.5px] mt-2.5">
              Safari only — iPhone does not allow other browsers to install apps.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
