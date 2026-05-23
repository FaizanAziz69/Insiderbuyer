import { InsiderRole } from '../entities/insider-transaction.entity';

export function normalizeRole(title: string, isDirector: boolean, isOfficer: boolean): InsiderRole {
  const t = (title || '').toLowerCase();
  if (/chief\s+executive|^ceo\b|\bceo\b/.test(t)) return 'CEO';
  if (/chief\s+financial|^cfo\b|\bcfo\b/.test(t)) return 'CFO';
  if (/chief\s+operating|^coo\b|\bcoo\b/.test(t)) return 'COO';
  if (isDirector || /director/.test(t)) return 'Director';
  if (isOfficer || t) return 'Other';
  return 'Other';
}

export function roleMultiplier(role: InsiderRole): number {
  switch (role) {
    case 'CEO':
    case 'CFO':
    case 'COO':
      return 3.0;
    case 'Director':
      return 2.0;
    default:
      return 1.0;
  }
}
