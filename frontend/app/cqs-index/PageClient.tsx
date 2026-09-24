"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { CqsScoreCell } from '@/components/CqsScoreCell';

interface CqsRow {
  id: string;
  ticker: string;
  companyName: string;
  cqs: number;
  grade: string;
  isGoldRing: boolean;
  distinctMembers: number;
  isBipartisan: boolean;
  partyCounts: { R: number; D: number; I: number } | null;
  totalEstBuyValue: number;
  largestSingleBand: string | null;
  buyCount: number;
  sellCount: number;
  sector: string | null;
  marketCap: number | null;
  lastPrice: number | null;
  c1ClusterBreadth: number;
  c2PositionSize: number;
  c3CommitteeInfluence: number;
  c4ContractAlignment: number;
  c5BuyerTrackRecord: number;
  c6RelativeConviction: number;
  c7Freshness: number;
  c8NetDirection: number;
  multiplierInsiderOverlap: number;
  updatedAt: string;
}

export default function PageClient() {
  const [rows, setRows] = useState<CqsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sector, setSector] = useState('');
  const [bipartisanOnly, setBipartisanOnly] = useState(false);
  const [minScore, setMinScore] = useState(0);

  useEffect(() => {
    async function fetchCqs() {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set('limit', '100');
        if (search) params.set('search', search);
        if (sector) params.set('sector', sector);
        if (minScore > 0) params.set('minScore', minScore.toString());

        const res = await fetch(`/api/backend/cqs/leaderboard?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          setRows(data.rows || []);
        }
      } catch (err) {
        console.error('Failed to load CQS leaderboard:', err);
      } finally {
        setLoading(false);
      }
    }

    const timer = setTimeout(fetchCqs, 200);
    return () => clearTimeout(timer);
  }, [search, sector, minScore]);

  const filteredRows = rows.filter((r) => {
    if (bipartisanOnly && !r.isBipartisan) return false;
    return true;
  });

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        {/* Title Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-semibold mb-2">
              <span>Brief v9 Methodology</span>
              <span>•</span>
              <span>Gold Tier Active</span>
            </div>
            <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Congress Quality Score (CQS) Index
            </h1>
            <p className="text-slate-600 dark:text-slate-400 text-sm mt-1 max-w-3xl">
              Stock-level congressional buying conviction index. Evaluates cluster breadth, position sizes, committee jurisdiction, and contract proximity on a 0–100 scale.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/congressional-trades"
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 transition"
            >
              View Disclosure Stream
            </Link>
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              Search Ticker / Name
            </label>
            <input
              type="text"
              placeholder="e.g. NVDA, Apple..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              Sector Filter
            </label>
            <select
              value={sector}
              onChange={(e) => setSector(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="">All Sectors</option>
              <option value="Technology">Technology</option>
              <option value="Healthcare">Healthcare</option>
              <option value="Industrials">Industrials / Defense</option>
              <option value="Energy">Energy</option>
              <option value="Financials">Financials</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              Min CQS Score ({minScore})
            </label>
            <input
              type="range"
              min="0"
              max="90"
              step="5"
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
              className="w-full accent-amber-500 mt-2"
            />
          </div>

          <div className="flex items-end">
            <label className="inline-flex items-center gap-2 cursor-pointer pb-2">
              <input
                type="checkbox"
                checked={bipartisanOnly}
                onChange={(e) => setBipartisanOnly(e.target.checked)}
                className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500"
              />
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Bipartisan Clusters Only
              </span>
            </label>
          </div>
        </div>

        {/* CQS Index Leaderboard Table */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
          {loading ? (
            <div className="p-12 text-center text-slate-500 text-sm">
              Loading Congress Quality Score index...
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="p-12 text-center text-slate-500 text-sm">
              No qualified congressional buying stocks match the current filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="py-3.5 px-4 w-12 text-center">#</th>
                    <th className="py-3.5 px-4">Company</th>
                    <th className="py-3.5 px-4 text-center">CQS Score</th>
                    <th className="py-3.5 px-4 text-center">Party Mix</th>
                    <th className="py-3.5 px-4 text-right">Est. Buy Value</th>
                    <th className="py-3.5 px-4 text-center">Max Buy Band</th>
                    <th className="py-3.5 px-4 text-center">Insider Overlap</th>
                    <th className="py-3.5 px-4 text-right">Market Cap</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs text-slate-700 dark:text-slate-300">
                  {filteredRows.map((r, i) => {
                    const hasOverlap = Number(r.multiplierInsiderOverlap || 1) > 1;
                    return (
                      <tr
                        key={r.id || r.ticker}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="py-4 px-4 text-center font-bold text-slate-400 tabular-nums">
                          {i + 1}
                        </td>
                        <td className="py-4 px-4">
                          <Link
                            href={`/companies/${r.ticker}`}
                            className="font-bold text-slate-900 dark:text-white hover:text-amber-500 dark:hover:text-amber-400 transition"
                          >
                            {r.ticker}
                          </Link>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[200px]">
                            {r.companyName}
                          </div>
                        </td>
                        <td className="py-4 px-4 text-center">
                          <CqsScoreCell
                            cqs={r.cqs}
                            grade={r.grade}
                            isGoldRing={r.isGoldRing}
                          />
                        </td>
                        <td className="py-4 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {r.partyCounts?.R ? (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500/10 text-red-600 dark:text-red-400">
                                {r.partyCounts.R}R
                              </span>
                            ) : null}
                            {r.partyCounts?.D ? (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400">
                                {r.partyCounts.D}D
                              </span>
                            ) : null}
                            {r.isBipartisan && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                                Bipartisan
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-4 px-4 text-right font-semibold tabular-nums text-slate-900 dark:text-white">
                          ${(Number(r.totalEstBuyValue || 0) / 1000).toFixed(0)}k est.
                        </td>
                        <td className="py-4 px-4 text-center text-slate-500 font-mono text-[11px]">
                          {r.largestSingleBand || '—'}
                        </td>
                        <td className="py-4 px-4 text-center">
                          {hasOverlap ? (
                            <span
                              className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                              title="Corporate insiders are also net buyers (IQS >= 70)"
                            >
                              IQS + CQS Overlap
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[11px]">—</span>
                          )}
                        </td>
                        <td className="py-4 px-4 text-right tabular-nums text-slate-500">
                          {r.marketCap
                            ? `$${(Number(r.marketCap) / 1e9).toFixed(1)}B`
                            : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Legal Frame Compliance Footnote */}
        <div className="p-4 rounded-xl bg-slate-100 dark:bg-slate-800/40 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          <strong>Compliance Frame:</strong> Information based on public disclosures filed under the STOCK Act (Periodic Transaction Reports). CQS evaluates disclosed trading signal strength and does not imply impropriety or insider trading.
        </div>
      </div>
    </AppShell>
  );
}
