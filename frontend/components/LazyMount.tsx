"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Renders its children only once they scroll near the viewport, so the data
 * hooks inside (SWR fetches, charts) don't fire on page load. Used to defer
 * below-the-fold sections — the stock page's civic grid fires ~9 API calls,
 * none of which the visitor sees until they scroll down.
 *
 * Reserves `minHeight` before mounting so the scrollbar/layout doesn't jump
 * when the real content appears. Falls back to eager render where
 * IntersectionObserver is unavailable (old browsers).
 *
 * SSR (2026-09-09): the FIRST document render is eager — on the server and
 * during hydration — so the deferred sections are in the HTML a crawler gets
 * (the homepage kept ~80% of its content inside one LazyMount, and it used to
 * render as an empty box server-side). Their data is prefetched by the server
 * shell anyway, so eager mounting costs no extra API calls on that first load.
 * Laziness still applies to every client-side navigation after that: the
 * module flag flips once the first mount's effects have run.
 */
let firstDocumentRender = true;

export function LazyMount({
  children,
  rootMargin = "500px",
  minHeight = 320,
}: {
  children: ReactNode;
  rootMargin?: string;
  minHeight?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [show, setShow] = useState(firstDocumentRender);

  useEffect(() => {
    firstDocumentRender = false;
    if (show) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setShow(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShow(true);
          io.disconnect();
        }
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [show, rootMargin]);

  return (
    <div ref={ref} style={show ? undefined : { minHeight }}>
      {show ? children : null}
    </div>
  );
}
