# WCAG Audit

## Automated Result

Run on 2026-07-11 against the local worktree with `WCAG_URL=http://127.0.0.1:3010 npm run audit:wcag`.

- Standard: axe-core `wcag2a`, `wcag2aa`, `wcag21aa`, `wcag22aa`
- Routes: `/`, `/liff`
- Viewports: 375x844, 390x844, 430x844
- Result: pass after correcting seven status-page text contrast failures.
- Keyboard smoke: Tab reaches an interactive element whenever the tested route has one.

## Authenticated Dashboard Scope

The full LIFF dashboard requires a real LINE login and cannot be audited safely with a bypass in production. Capture an authenticated Playwright storage state outside the repository, then run:

```bash
WCAG_URL=https://lua-ai-two.vercel.app \
WCAG_STORAGE_STATE=/secure/path/liff-state.json \
WCAG_PATHS=/liff \
npm run audit:wcag
```

Do not commit the storage-state file. Record the command result and manually verify screen-reader announcements, focus order, and destructive-action confirmation before calling the authenticated-dashboard audit complete.
