"use client";

import React from 'react';
import { CqsScoreCell } from './CqsScoreCell';

interface CqsBreakdownCardProps {
  score: {
    cqs: number;
    grade: string;
    isGoldRing: boolean;
    c1ClusterBreadth: number;
    c2PositionSize: number;
    c3CommitteeInfluence: number;
    c4ContractAlignment: number;
    c5BuyerTrackRecord: number;
    c6RelativeConviction: number;
    c7Freshness: number;
    c8NetDirection: number;
    multiplierInsiderOverlap?: number;
    multiplierLegislativeCatalyst?: number;
    multiplierContrarianEntry?: number;
    multiplierLiquidityNorm?: number;
    multiplierFilingLag?: number;
    distinctMembers?: number;
    isBipartisan?: boolean;
    totalEstBuyValue?: number;
  };
}

export function CqsBreakdownCard({ score }: CqsBreakdownCardProps) {
  const components = [
    { label: 'Cluster Breadth', val: Number(score.c1ClusterBreadth || 0), weight: '20%', desc: `${score.distinctMembers || 0} buyers ${score.isBipartisan ? '(Bipartisan +10)' : ''}` },
    { label: 'Position Size', val: Number(score.c2PositionSize || 0), weight: '15%', desc: 'Summed disclosure band floors' },
    { label: 'Committee Influence', val: Number(score.c3CommitteeInfluence || 0), weight: '15%', desc: 'Jurisdiction oversight & member roles' },
    { label: 'Contract Alignment', val: Number(score.c4ContractAlignment || 0), weight: '15%', desc: 'Agency contract proximity (CTS)' },
    { label: 'Buyer Track Record', val: Number(score.c5BuyerTrackRecord || 0), weight: '12%', desc: 'Historical member performance grade' },
    { label: 'Relative Conviction', val: Number(score.c6RelativeConviction || 0), weight: '8%', desc: 'Trade size vs median baseline' },
    { label: 'Freshness Decay', val: Number(score.c7Freshness || 0), weight: '10%', desc: 'Decay from transaction date' },
    { label: 'Net Direction', val: Number(score.c8NetDirection || 0), weight: '5%', desc: 'Buy vs Sell volume ratio' },
  ];

  const multipliers = [
    { label: 'Insider Overlap', val: score.multiplierInsiderOverlap, active: (score.multiplierInsiderOverlap || 1) > 1, mult: '× 1.20' },
    { label: 'Legislative Catalyst', val: score.multiplierLegislativeCatalyst, active: (score.multiplierLegislativeCatalyst || 1) > 1, mult: '× 1.10' },
    { label: 'Contrarian Entry', val: score.multiplierContrarianEntry, active: (score.multiplierContrarianEntry || 1) > 1, mult: '× 1.10' },
    { label: 'Liquidity Norm', val: score.multiplierLiquidityNorm, active: (score.multiplierLiquidityNorm || 1) < 1, mult: '× 0.80' },
    { label: 'Filing-Lag Dampener', val: score.multiplierFilingLag, active: (score.multiplierFilingLag || 1) < 1, mult: '× 0.85' },
  ];

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4 mb-4">
        <div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">
            Congress Quality Score (CQS)
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Brief v9 stock-level congressional buying conviction
          </p>
        </div>
        <CqsScoreCell cqs={score.cqs} grade={score.grade} isGoldRing={score.isGoldRing} />
      </div>

      {/* 8 Components Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
        {components.map((c, i) => (
          <div key={i} className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
            <div className="flex justify-between items-center mb-1 text-xs">
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                {c.label} <span className="text-slate-400">({c.weight})</span>
              </span>
              <span className="font-bold tabular-nums text-slate-900 dark:text-white">
                {Math.round(c.val)} / 100
              </span>
            </div>
            <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden mb-1">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, Math.max(0, c.val))}%` }}
              />
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 block truncate">
              {c.desc}
            </span>
          </div>
        ))}
      </div>

      {/* Active Multipliers */}
      <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
          Signal Multipliers
        </h4>
        <div className="flex flex-wrap gap-2">
          {multipliers.map((m, i) => (
            <span
              key={i}
              className={`px-2.5 py-1 rounded-md text-xs font-medium border ${
                m.active
                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 font-semibold'
                  : 'bg-slate-100 text-slate-400 border-slate-200 dark:bg-slate-800 dark:border-slate-700'
              }`}
            >
              {m.label} <span className="font-bold">{m.mult}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
