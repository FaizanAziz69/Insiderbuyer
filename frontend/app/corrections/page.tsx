import { LegalPage, LegalSection } from "@/components/legal/LegalPage";
import { pageMetadata } from "@/lib/seo-meta";

export const metadata = pageMetadata("/corrections", {
  title: "Corrections Policy | Insider Buying",
  description:
    "How Insider Buying handles errors in articles and data, and how to report one.",
});

const SECTIONS: LegalSection[] = [
  {
    h: "Our commitment",
    p: "We aim for accuracy in everything we publish — articles, data tables and scores. When we get something wrong, we correct it promptly and transparently.",
  },
  {
    h: "Articles",
    p: "When a factual error in an article is identified, we update the article and, for material errors, note the correction within the piece. Minor issues such as typos or formatting are fixed without a note.",
  },
  {
    h: "Data & scores",
    p: "Market and filing data flows in continuously from sources such as SEC EDGAR, and filings are sometimes amended or restated by the filer. Our pipelines re-ingest amended filings and recompute affected figures and Insider Scores automatically. If you spot a figure that looks wrong, please report it — verified data errors are corrected at the source so every affected page updates.",
  },
  {
    h: "How to report an error",
    p: "Email admin@insiderbuying.com with a link to the page and a description of the issue. We review every report and respond to material corrections as quickly as we can.",
  },
];

export default function CorrectionsPage() {
  return (
    <LegalPage
      eyebrow="Editorial"
      title="Corrections Policy"
      intro="How we handle errors in articles and data, and how to report one."
      updated="August 17, 2026"
      sections={SECTIONS}
    />
  );
}
