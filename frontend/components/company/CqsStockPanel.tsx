"use client";

import React, { useEffect, useState } from 'react';
import { CqsBreakdownCard } from '../CqsBreakdownCard';

export function CqsStockPanel({ ticker }: { ticker: string }) {
  const [score, setScore] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCqs() {
      try {
        const res = await fetch(`/api/backend/cqs/ticker/${ticker}`);
        if (res.ok) {
          const data = await res.json();
          if (data.score) {
            setScore(data.score);
          }
        }
      } catch (err) {
        console.error('Failed to load CQS ticker score:', err);
      } finally {
        setLoading(false);
      }
    }

    if (ticker) fetchCqs();
  }, [ticker]);

  if (loading || !score) return null;

  return (
    <div className="my-6">
      <CqsBreakdownCard score={score} />
    </div>
  );
}
