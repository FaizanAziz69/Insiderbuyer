"use client";
import { motion } from "framer-motion";
import { Check, Sparkles, Ticket } from "lucide-react";

interface Tier {
  name: string;
  price: string;
  description: string;
  features: string[];
  highlighted?: boolean;
}

const TIERS: Tier[] = [
  {
    name: "Basic",
    price: "$ 199.00 USD",
    description:
      "Access exclusive event content and behind-the-scenes perks with our Basic Insider Ticket.",
    features: [
      "Three-day, two night accommodations",
      "All sessions, meals and networking events",
      "A 3-month print + digital subscription.",
    ],
  },
  {
    name: "Standard",
    price: "$ 299.00 USD",
    description:
      "Enjoy enhanced access and premium perks with our Standard Insider Event Ticket.",
    features: [
      "Priority access to event sessions",
      "Exclusive networking opportunities",
      "Premium seating options",
      "Access to special Q&A sessions",
    ],
    highlighted: true,
  },
  {
    name: "Premium",
    price: "$ 399.00 USD",
    description:
      "Experience the ultimate event access and exclusive perks with our Premium Insider Ticket.",
    features: [
      "VIP seating and reserved areas",
      "All Standard Package benefits",
      "One-on-one interactions with speakers and VIPs",
      "Premium event merchandise",
    ],
  },
];

export default function PremiumPage() {
  return (
    <>
      {/* HERO — full-width strip under the navbar */}
      <section
        className="relative overflow-hidden -mx-4 sm:-mx-6 lg:-mx-8 -mt-6 sm:-mt-8 mb-12"
        style={{
          background:
            "linear-gradient(135deg, color-mix(in srgb, var(--accent) 12%, var(--bg-2)) 0%, color-mix(in srgb, var(--accent-2) 14%, var(--bg-2)) 100%)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div
          aria-hidden
          className="absolute -top-32 -right-32 h-80 w-80 rounded-full blur-3xl"
          style={{ background: "color-mix(in srgb, var(--accent) 35%, transparent)" }}
        />
        <div
          aria-hidden
          className="absolute -bottom-24 -left-24 h-64 w-64 rounded-full blur-3xl"
          style={{ background: "color-mix(in srgb, var(--accent-2) 30%, transparent)" }}
        />
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 text-center">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <div
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold uppercase tracking-wider text-white mb-5"
              style={{ background: "linear-gradient(90deg, var(--accent), var(--accent-2))" }}
            >
              <Sparkles className="h-3 w-3" />
              Subscribe
            </div>
            <h1
              className="text-[36px] sm:text-[48px] font-bold tracking-tight leading-tight"
              style={{ letterSpacing: "-0.6px" }}
            >
              Unlock the full IQS picture
            </h1>
            <p className="text-soft mt-4 text-[15px] sm:text-[17px] max-w-2xl mx-auto leading-relaxed">
              Choose the plan that fits your edge. Every tier removes the top-3 paywall on
              insider rankings and unlocks more of the data, alerts, and analysis layer.
            </p>
          </motion.div>
        </div>
      </section>

      {/* PRICING CARDS */}
      <section className="max-w-6xl mx-auto pb-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 lg:gap-6 items-start">
          {TIERS.map((tier, i) => (
            <motion.div
              key={tier.name}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.45, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
              className={`card p-6 sm:p-7 ${tier.highlighted ? "md:-translate-y-6" : ""}`}
              style={
                tier.highlighted
                  ? {
                      borderColor: "color-mix(in srgb, var(--accent) 40%, var(--border))",
                      boxShadow:
                        "0 10px 32px color-mix(in srgb, var(--accent) 18%, transparent)",
                    }
                  : undefined
              }
            >
              <div className="flex items-start gap-3 mb-5">
                <div
                  className="h-12 w-12 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{
                    background:
                      "linear-gradient(135deg, color-mix(in srgb, var(--accent-2) 22%, var(--bg-3)), color-mix(in srgb, var(--accent) 18%, var(--bg-3)))",
                    border: "1px solid color-mix(in srgb, var(--accent-2) 30%, var(--border))",
                  }}
                >
                  <Ticket
                    className="h-6 w-6"
                    style={{ color: "var(--accent-2)" }}
                    strokeWidth={2}
                  />
                </div>
                <div className="min-w-0">
                  <div className="text-[12px] font-semibold text-mute mb-0.5">{tier.name}</div>
                  <div className="text-[22px] sm:text-[24px] font-bold tracking-tight leading-tight">
                    {tier.price}
                  </div>
                </div>
              </div>

              <p className="text-[14px] text-soft leading-relaxed mb-6">{tier.description}</p>

              <div className="h-px mb-5" style={{ background: "var(--border)" }} />

              <div className="text-[18px] font-bold tracking-tight mb-3.5">
                What&rsquo;s included?
              </div>
              <ul className="space-y-3 mb-7">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-3 text-[14px]">
                    <span
                      className="h-5 w-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{ background: "var(--text)", color: "var(--bg-2)" }}
                    >
                      <Check className="h-3 w-3" strokeWidth={3} />
                    </span>
                    <span className="text-soft">{f}</span>
                  </li>
                ))}
              </ul>

              <button
                className={tier.highlighted ? "btn-primary w-full" : "btn-secondary w-full"}
                style={{ padding: "11px 16px", fontSize: 14, fontWeight: 600 }}
              >
                Choose {tier.name}
              </button>
            </motion.div>
          ))}
        </div>

        <div className="text-center text-[12px] text-mute mt-10">
          Payments processing coming soon. No charges yet.
        </div>
      </section>
    </>
  );
}
