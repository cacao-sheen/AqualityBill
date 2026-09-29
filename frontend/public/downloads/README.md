# App downloads

Two Android APKs are served as static files from here, both linked from
`/download` (src/app/download/page.tsx):

- `aqualitybill.apk` — the consumer app (view bills, report leaks).
- `aquabilling.apk` — the collector app (record meter readings, manage
  on-the-ground bill collection).

To ship a new version of either, replace the file with the same name — no
code changes needed.

Note: these are binaries and get committed to git as-is. That's fine for
occasional app updates, but the repo grows by each file's size (a few MB to a
few dozen MB) every time one is replaced and committed. If that becomes a
problem later, swap the download page's links to point at an external host
(e.g. a Supabase Storage bucket or a GitHub Release asset) instead of this
folder.
