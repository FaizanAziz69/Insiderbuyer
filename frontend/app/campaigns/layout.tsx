import type { Metadata } from "next";
import { Archivo, IBM_Plex_Mono, Nunito_Sans } from "next/font/google";

const archivo = Archivo({ subsets: ["latin"], weight: ["700", "800"], variable: "--b2b-display", display: "swap" });
const nunito = Nunito_Sans({ subsets: ["latin"], weight: ["400", "600", "700"], variable: "--b2b-body", display: "swap" });
const plex = IBM_Plex_Mono({ subsets: ["latin"], weight: ["500"], variable: "--b2b-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Investor Relations Campaigns | InsiderBuying.com",
  description: "Agency-run press distribution, investor-acquisition campaigns and sponsored editorial from InsiderBuying.com. Book a discovery call.",
};

export default function CampaignsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-bare-page className={`${archivo.variable} ${nunito.variable} ${plex.variable}`}>
      {children}
    </div>
  );
}
