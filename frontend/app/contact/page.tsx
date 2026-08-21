import Link from "next/link";
import { Mail, Briefcase, LifeBuoy } from "lucide-react";

import { pageMetadata } from "@/lib/seo-meta";

export const metadata = pageMetadata("/contact");

const GENERAL_EMAIL = "info@insiderbuying.com";
const SUPPORT_EMAIL = "support@insiderbuying.com";

export default function ContactPage() {
  const cards = [
    {
      icon: Mail,
      title: "General inquiries",
      desc: "Questions about the site, our data, or anything else.",
      email: GENERAL_EMAIL,
    },
    {
      icon: Briefcase,
      title: "Data & advertising",
      desc: "Licensing our insider data, advertising, or partnerships.",
      email: GENERAL_EMAIL,
    },
    {
      icon: LifeBuoy,
      title: "Customer support",
      desc: "Help with your account, subscription, or billing.",
      email: SUPPORT_EMAIL,
    },
  ];

  return (
    <div className="w-full max-w-3xl mx-auto space-y-6 py-2">
      <header>
        <div className="text-mute text-sm mb-1 font-mono uppercase tracking-wider text-[11px]">
          Contact Us
        </div>
        <h1 className="text-[30px] sm:text-[38px] font-bold tracking-tight" style={{ letterSpacing: "-0.5px" }}>
          Get in touch
        </h1>
        <p className="text-mute text-[15px] mt-3 max-w-2xl leading-relaxed">
          We&rsquo;d love to hear from you. Reach the right team below and we&rsquo;ll get
          back to you as soon as we can.
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {cards.map((c) => (
          <div
            key={c.title}
            className="rounded-xl p-5"
            style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
          >
            <span
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg mb-3"
              style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
            >
              <c.icon className="h-5 w-5" />
            </span>
            <div className="font-bold text-[15px]">{c.title}</div>
            <p className="text-[13px] text-mute mt-1 leading-relaxed">{c.desc}</p>
            <a
              href={`mailto:${c.email}`}
              className="mt-3 inline-block text-[13px] font-semibold text-accent hover:underline break-all"
            >
              {c.email}
            </a>
          </div>
        ))}
      </div>

      <p className="text-[13px] text-mute leading-relaxed">
        Insider Buying is an information service, not a broker or financial adviser. Nothing
        we publish is investment advice — please read our{" "}
        <Link href="/disclaimer" className="text-accent font-semibold hover:underline">
          Disclaimer
        </Link>
        .
      </p>
    </div>
  );
}
