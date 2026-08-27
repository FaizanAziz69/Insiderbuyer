import type { Metadata } from "next";

/** Internal editorial tooling — never indexed, never in the sitemap. */
export const metadata: Metadata = {
  title: "Editorial Desk — Internal",
  robots: { index: false, follow: false },
};

export default function EditorialDeskLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
