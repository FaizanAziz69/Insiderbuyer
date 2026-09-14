import PageClient from "./PageClient";

/** Per-issuer Promoter Score detail (Workstream F §2.5). */
export default async function Page({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  return <PageClient ticker={decodeURIComponent(ticker).toUpperCase()} />;
}
