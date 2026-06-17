"use client";
import { useState } from "react";
import {
  Facebook,
  Linkedin,
  Link as LinkIcon,
  Mail,
  Printer,
  Share2,
} from "lucide-react";

interface Props {
  url?: string;
  title?: string;
}

/** MarketBeat-style horizontal social share row — sits on the right of
 *  the byline / left of the deck on article pages. Subtle, monochrome,
 *  finance-publication aesthetic. */
export function ArticleShareRow({ url, title }: Props) {
  const [copied, setCopied] = useState(false);
  const fullUrl =
    url || (typeof window !== "undefined" ? window.location.href : "");
  const q = encodeURIComponent(title || "");
  const u = encodeURIComponent(fullUrl);
  const tweet = `https://x.com/intent/post?text=${q}&url=${u}`;
  const linkedin = `https://www.linkedin.com/sharing/share-offsite/?url=${u}`;
  const facebook = `https://www.facebook.com/sharer/sharer.php?u=${u}`;
  const mail = `mailto:?subject=${q}&body=${u}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  function print() {
    if (typeof window !== "undefined") window.print();
  }

  return (
    <div className="flex items-center gap-1.5">
      <ShareBtn href={facebook} label="Share on Facebook">
        <Facebook className="h-3.5 w-3.5" strokeWidth={2.2} />
      </ShareBtn>
      <ShareBtn href={tweet} label="Share on X">
        <XIcon />
      </ShareBtn>
      <ShareBtn href={linkedin} label="Share on LinkedIn">
        <Linkedin className="h-3.5 w-3.5" strokeWidth={2.2} />
      </ShareBtn>
      <ShareBtn href="#" label="Share" onClick={(e) => e.preventDefault()}>
        <Share2 className="h-3.5 w-3.5" strokeWidth={2.2} />
      </ShareBtn>
      <ShareBtn href="#" label="Print" onClick={(e) => { e.preventDefault(); print(); }}>
        <Printer className="h-3.5 w-3.5" strokeWidth={2.2} />
      </ShareBtn>
      <ShareBtn href={mail} label="Email this article">
        <Mail className="h-3.5 w-3.5" strokeWidth={2.2} />
      </ShareBtn>
      <ShareBtn
        href="#"
        label={copied ? "Copied!" : "Copy link"}
        onClick={(e) => { e.preventDefault(); copy(); }}
      >
        <LinkIcon className="h-3.5 w-3.5" strokeWidth={2.2} />
      </ShareBtn>
    </div>
  );
}

function ShareBtn({
  href,
  label,
  onClick,
  children,
}: {
  href: string;
  label: string;
  onClick?: (e: React.MouseEvent) => void;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target={href.startsWith("http") ? "_blank" : undefined}
      rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
      onClick={onClick}
      title={label}
      aria-label={label}
      className="inline-flex items-center justify-center h-8 w-8 rounded-full transition"
      style={{
        background: "var(--bg-2)",
        border: "1px solid var(--border)",
        color: "var(--text-mute)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--accent-soft)";
        e.currentTarget.style.color = "var(--accent)";
        e.currentTarget.style.borderColor = "var(--accent)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "var(--bg-2)";
        e.currentTarget.style.color = "var(--text-mute)";
        e.currentTarget.style.borderColor = "var(--border)";
      }}
    >
      {children}
    </a>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden>
      <path
        fill="currentColor"
        d="M18.244 2H21l-6.5 7.43L22 22h-6.844l-5.36-7.012L3.6 22H.844l6.96-7.96L0 2h7l4.846 6.4L18.244 2zm-1.2 18h1.84L5.04 4H3.1l13.944 16z"
      />
    </svg>
  );
}
