import { Suspense } from "react";
import PageClient from "./PageClient";

export default function Page() {
  // useSearchParams (the ?m= deep link) needs a Suspense boundary in the App
  // Router; the fallback is the arena's own background so there is no flash.
  return (
    <Suspense fallback={<div style={{ minHeight: "70vh", background: "var(--bg-1)" }} />}>
      <PageClient />
    </Suspense>
  );
}
