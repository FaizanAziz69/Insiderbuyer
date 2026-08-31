/**
 * Kill switch for the Data Articles section (Workstream A).
 * George, 2026-09-01: "remove the new data articles from the site — it needs
 * work, let's just remove for now." Flip to true to restore the nav item, the
 * /data pages and the sitemap entries in one deploy; the backend (tables,
 * refresh crons, Editorial Desk admin tab) stays untouched either way.
 */
export const DATA_ARTICLES_ENABLED = false;
