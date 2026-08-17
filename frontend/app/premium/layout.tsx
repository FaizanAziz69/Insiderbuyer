import { pageMetadata } from "@/lib/seo-meta";

export const metadata = pageMetadata("/premium");

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
