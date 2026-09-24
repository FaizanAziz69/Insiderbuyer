import PageClient from './PageClient';

export const metadata = {
  title: 'Congress Quality Score (CQS) Index | InsiderBuying',
  description:
    'Stock-level congressional buying conviction index (Brief v9). Ranked by Congress Quality Score (CQS), tracking member purchases, committee influence, and bipartisan clusters.',
};

export default function Page() {
  return <PageClient />;
}
