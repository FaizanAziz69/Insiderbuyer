/**
 * Kill switch for the /score-explainer page (the step-by-step Insider Score
 * calculation trace, built as a temporary client-education tool).
 * George, 2026-09-06: the "How it scored" link on Top Insider Buys "reveals
 * Insider Score and our proprietary formula" — the page showed the paygated
 * score and every formula step to anyone. While false the route 404s and no
 * page links to it; the backend trace endpoint is admin-token gated regardless.
 */
export const SCORE_EXPLAINER_ENABLED = false;
