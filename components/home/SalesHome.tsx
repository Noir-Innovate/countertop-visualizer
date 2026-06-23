"use client";

import { useEffect } from "react";
import Link from "next/link";
import { captureAndPersistAttribution } from "@/lib/attribution";
import {
  ONBOARDING_EVENTS,
  trackOnboarding,
} from "@/lib/onboarding-track";

// Commission rate is configured via REFERRAL_COMMISSION_BPS in lib/referrals.ts.
// Default is 4000 bps (40%) — kept in sync here for marketing copy.
const COMMISSION_PERCENT = 40;

function trackCta(destination: "demo" | "signup" | "login", placement: string) {
  trackOnboarding(ONBOARDING_EVENTS.rootCtaClicked, {
    destination,
    placement,
  });
}

export default function SalesHome() {
  useEffect(() => {
    captureAndPersistAttribution();
    trackOnboarding(ONBOARDING_EVENTS.rootViewed);
  }, []);

  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* Top nav */}
      <header className="border-b border-slate-200">
        <div className="container mx-auto max-w-6xl px-4 py-4 flex items-center justify-between">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            Countertop Visualizer
          </Link>
          <nav className="flex items-center gap-3 text-sm">
            <Link
              href="/demo"
              onClick={() => trackCta("demo", "nav")}
              className="text-slate-600 hover:text-slate-900 transition-colors"
            >
              Try the demo
            </Link>
            <Link
              href="/dashboard"
              onClick={() => trackCta("login", "nav")}
              className="text-slate-600 hover:text-slate-900 transition-colors"
            >
              Log in
            </Link>
            <Link
              href="/dashboard/signup"
              onClick={() => trackCta("signup", "nav")}
              className="px-4 py-2 rounded-full bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition-colors"
            >
              Start free trial
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="container mx-auto max-w-5xl px-4 pt-20 pb-16 text-center">
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-tight">
          Turn your stone catalog
          <br />
          into a closing tool.
        </h1>
        <p className="mt-6 text-lg md:text-xl text-slate-600 max-w-2xl mx-auto">
          Your sales team shows buyers <em>their</em> kitchen with{" "}
          <em>your</em> slabs — right in the showroom or on in-home visits.
          Set up in minutes.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/dashboard/signup"
            onClick={() => trackCta("signup", "hero")}
            className="px-8 py-4 rounded-full bg-slate-900 text-white font-semibold text-lg hover:bg-slate-800 transition-colors shadow-lg"
          >
            Start free trial
          </Link>
          <Link
            href="/demo"
            onClick={() => trackCta("demo", "hero")}
            className="px-8 py-4 rounded-full border border-slate-300 text-slate-900 font-semibold text-lg hover:bg-slate-50 transition-colors"
          >
            Try the demo first
          </Link>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-slate-50 border-y border-slate-200">
        <div className="container mx-auto max-w-5xl px-4 py-16">
          <h2 className="text-3xl font-bold text-center">
            From signup to selling in 3 steps
          </h2>
          <div className="mt-12 grid md:grid-cols-3 gap-6">
            {[
              {
                n: 1,
                title: "Set up your organization",
                body: "Pick a name and a subdomain for your sales portal.",
              },
              {
                n: 2,
                title: "Paste your website URL",
                body: "We scrape your logo, colors, and slab catalog automatically. You confirm.",
              },
              {
                n: 3,
                title: "Sell with it",
                body: "Open it on any device to show buyers their kitchen with your slabs — in the showroom or on in-home visits.",
              },
            ].map((step) => (
              <div
                key={step.n}
                className="bg-white rounded-2xl p-6 border border-slate-200"
              >
                <div className="w-10 h-10 rounded-full bg-slate-900 text-white flex items-center justify-center font-semibold mb-4">
                  {step.n}
                </div>
                <h3 className="font-semibold text-lg mb-2">{step.title}</h3>
                <p className="text-slate-600 text-sm">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Affiliate program */}
      <section className="container mx-auto max-w-5xl px-4 py-20">
        <div className="rounded-3xl bg-gradient-to-br from-slate-900 to-slate-700 text-white p-10 md:p-14">
          <div className="max-w-2xl">
            <p className="uppercase tracking-wider text-xs text-slate-300 font-semibold mb-3">
              Affiliate program
            </p>
            <h2 className="text-3xl md:text-4xl font-bold leading-tight">
              Earn {COMMISSION_PERCENT}% recurring commission for every
              fabricator you refer.
            </h2>
            <p className="mt-5 text-slate-200 text-lg">
              Every paying customer you bring in pays you {COMMISSION_PERCENT}%
              of their subscription, every month, for as long as they stay.
              Your unique referral code is generated as soon as your trial
              starts.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Link
                href="/dashboard/signup?source=affiliate"
                onClick={() => trackCta("signup", "affiliate")}
                className="px-8 py-4 rounded-full bg-white text-slate-900 font-semibold hover:bg-slate-100 transition-colors"
              >
                Become an affiliate
              </Link>
              <Link
                href="/demo"
                onClick={() => trackCta("demo", "affiliate")}
                className="px-8 py-4 rounded-full border border-white/30 text-white font-semibold hover:bg-white/10 transition-colors"
              >
                See it in action
              </Link>
            </div>
            <p className="mt-4 text-sm text-slate-300">
              Affiliates use the same signup as customers — start your trial,
              then share your code from the Referrals page.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200">
        <div className="container mx-auto max-w-6xl px-4 py-8 flex flex-col md:flex-row items-center justify-between gap-3 text-sm text-slate-500">
          <div>© Countertop Visualizer</div>
          <div className="flex gap-5">
            <Link href="/demo" className="hover:text-slate-900 transition-colors">
              Demo
            </Link>
            <Link
              href="/dashboard"
              className="hover:text-slate-900 transition-colors"
            >
              Log in
            </Link>
            <Link
              href="/privacy"
              className="hover:text-slate-900 transition-colors"
            >
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-slate-900 transition-colors">
              Terms
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
