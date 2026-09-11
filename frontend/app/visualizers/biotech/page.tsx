import { Suspense } from "react";
import PageClient from "./PageClient";

export default function Page() {
  return (
    <Suspense fallback={<div style={{ minHeight: "70vh", background: "var(--bg-1)" }} />}>
      <PageClient />
    </Suspense>
  );
}
