"use client";

import React from 'react';

interface CqsScoreCellProps {
  cqs?: number | null;
  grade?: string | null;
  isGoldRing?: boolean;
}

export function CqsScoreCell({
  cqs,
  grade,
  isGoldRing = false,
}: CqsScoreCellProps) {
  if (typeof cqs !== 'number' || cqs <= 0) {
    return (
      <span
        className="text-gray-400 dark:text-gray-500 text-[11px] leading-tight inline-block max-w-[100px]"
        title="No qualifying congressional purchases in trailing 90 days — CQS only exists where members are buying."
      >
        No recent buying
      </span>
    );
  }

  const rounded = Math.round(cqs);
  const displayGrade = grade || (rounded >= 90 ? 'A+' : rounded >= 80 ? 'A' : rounded >= 70 ? 'B+' : rounded >= 60 ? 'B' : 'C');
  const gold = isGoldRing || rounded >= 80;

  // Grade color badges
  let badgeColor = 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
  if (displayGrade.startsWith('A')) {
    badgeColor = 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30';
  } else if (displayGrade.startsWith('B')) {
    badgeColor = 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30';
  }

  return (
    <div className="inline-flex flex-col items-center gap-1 leading-none">
      <div className="relative inline-flex items-center justify-center">
        {gold && (
          <span className="absolute -inset-1 rounded-full bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 opacity-75 blur-[2px] animate-pulse" />
        )}
        <span
          className={`relative px-2.5 py-1 rounded-md text-[14px] font-bold tabular-nums ${
            gold
              ? 'bg-amber-500 text-slate-950 font-extrabold shadow-sm ring-2 ring-amber-300/80'
              : 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
          }`}
        >
          {rounded}
        </span>
      </div>
      <span
        className={`px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wider ${badgeColor}`}
      >
        Grade {displayGrade}
      </span>
    </div>
  );
}
