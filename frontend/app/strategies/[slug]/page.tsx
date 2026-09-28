import PageClient from "./PageClient";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PageClient slug={slug} />;
}
