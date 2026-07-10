# AI Assistant — Architecture & Maintenance Guide

**Audience:** whoever maintains the in-app AI assistant — human or AI agent.
**Most important section:** [Updating the illustrated tutorials after a UI change](#5-updating-the-illustrated-tutorials-after-a-ui-change).
If you merge this into the real software and the UI changes, that section tells you exactly how to regenerate the screenshots so the assistant stays correct.

---

## 1. What the assistant is

An in-app, **read-only**, tenant-scoped AI helper (the "✨ Assistant" sidebar page). It answers two kinds of questions:

1. **Business data** — "how much did I sell today?", "top products?", "which employee sold most?". It calls curated, read-only, tenant-scoped SQL functions (it never writes and never emits raw SQL).
2. **How-to / tutorials** — "how do I add a product?". It retrieves from a knowledge base (RAG) that includes 100 text Q&A **and** illustrated step-by-step tutorials (screenshots with arrows/cursor circles).

Model: **`claude-haiku-4-5`** (cheapest tier; fine for lookups + how-to). Change in `supabase/functions/assistant/core.ts` (`DEFAULT_MODEL`).

GDPR: personal names/NIF/email/phone are pseudonymized before the model sees them and re-hydrated in the answer (`pii.ts`). Tenant isolation is enforced on every DB function.

---

## 2. File map

| Area | Files |
|---|---|
| **DB — read tools** | `supabase/migrations/20260720000000_assistant_readonly_rpcs.sql` — the `assistant_*` SECURITY DEFINER, service-role-only, tenant-scoped read functions |
| **DB — knowledge base** | `20260720000001_assistant_kb_docs.sql` — `kb_documents` table + `assistant_search_docs` (Postgres full-text) |
| **DB — history/audit** | `20260720000002_assistant_conversations.sql` — conversations, messages, audit, retention purge |
| **Edge function** | `supabase/functions/assistant/` → `index.ts` (auth + HTTP + persistence), `core.ts` (Claude tool-use loop + system prompt), `tools.ts` (tool defs → RPCs), `pii.ts` (pseudonymize/rehydrate), `*_test.ts` (Deno tests) |
| **Login fn (for auth)** | `supabase/functions/pwa-login/` (already in repo) |
| **Config** | `supabase/config.toml` → `[functions.assistant] verify_jwt = true` |
| **KB content** | `ASSISTANT_QA.md` (100 owner Q&A, EN/PT) and `TUTORIALS.md` (generated illustrated guides) |
| **Scripts** | `scripts/build-kb.cjs` (index KB), `scripts/capture-guide.cjs` (screenshot + annotate), `scripts/upload-guide.cjs` (upload + write `TUTORIALS.md`) |
| **Frontend** | `src/pages/Assistant.tsx` (chat UI + markdown/image rendering), `src/contexts/AssistantContext.tsx`, `src/services/assistantService.ts`, route in `src/App.tsx`, nav item in `src/components/Layout/Sidebar.tsx`, i18n keys in `src/i18n.ts` |
| **Tutorial images** | Committed in **`public/guide/*.png`** (served by the app at relative `/guide/<file>` — portable across deployments). Also mirrored to a public Supabase Storage bucket `guide`, but the RAG uses the **relative** URLs. |
| **npm scripts** | `npm run build:kb`, `npm run seed` |

---

## 3. How data questions work (read-only guarantee)

- Each tool in `tools.ts` maps 1:1 to an `assistant_*` SQL function. The model can ONLY call these — it never writes SQL.
- Every function is `SECURITY DEFINER`, takes an explicit `p_tenant_id`, filters every query by it, and is `EXECUTE`-granted to **`service_role` only** (revoked from anon/authenticated). No browser client can call them with a forged tenant; only the edge function (service key) can, and it resolves the tenant from the **verified JWT**.
- The functions contain **only SELECTs** — there is no write path exposed to the AI.
- **Gotcha:** managed Supabase's `postgres` role can't `ALTER FUNCTION … OWNER TO` a restricted role (needs superuser), so functions are owned by `postgres` (which owns the tables and bypasses RLS). This matches the repo's existing `get_*_delta` pattern. Don't try to re-add a SELECT-only owning role on hosted Supabase — it will fail on `db push`.
- **Gotcha:** the `active_products_with_categories` view has **no `tenant_id`** (its `products.*` froze before `tenant_id` was added). The product tools query base `public.products` directly. If you add a product tool, do the same.

To add a new data tool: write a new `assistant_<name>(p_tenant_id, …)` function (new migration), add a tool definition + dispatch case in `tools.ts`, and (if it exposes names) add it to `PII_TOOLS` in `tools.ts`.

---

## 4. How the RAG (how-to + tutorials) works

- Content lives in two root markdown files: **`ASSISTANT_QA.md`** (100 owner Q&A, bilingual EN/PT headings) and **`TUTORIALS.md`** (auto-generated illustrated guides). `scripts/build-kb.cjs` chunks them by `##` heading and upserts into `kb_documents` (heading = question, content = answer). Its `INCLUDE` array lists which files to index.
- Retrieval: `assistant_search_docs(query)` runs Postgres full-text. **It ORs the query terms** (`websearch_to_tsquery` ANDs them, which is too strict for doc lookup — we swap `&`→`|`). Keep this if you edit the function, or recall gets bad.
- The model is told (in `core.ts` system prompt) to reproduce numbered steps in order and **include the `![](url)` images** from an illustrated snippet. That's why tutorials render pictures.
- Images are markdown; the frontend (`Assistant.tsx`) renders them via `react-markdown` (`img` component). Tutorial images are committed to **`public/guide/`** and referenced by **relative `/guide/<file>` URLs**, so they resolve against whatever origin the app runs on (portable — no dependency on a specific Supabase project). `scripts/upload-guide.cjs` copies the captured PNGs into `public/guide/`, writes those relative URLs into `TUTORIALS.md`, and also mirrors the files to a public Supabase Storage bucket `guide` as a backup.

To add/edit **text Q&A**: edit `ASSISTANT_QA.md`, then `npm run build:kb`. (Each `## Question?` becomes one retrievable chunk. Keep headings unique.)

---

## 5. Updating the illustrated tutorials after a UI change

**This is the key maintenance task.** The screenshots are captured by driving the *real running app*, so if the UI changes you just re-capture. The capture is written to be **resilient** — it finds elements by role + text, and enumerates form fields generically — so **most UI tweaks need no code change, only a re-run.**

### One-time prerequisites
- Dev server running: `npm run dev` (serves `http://localhost:5173`).
- A logged-in owner account exists. The capture logs in as `owner@easysoft.test` / `EasySoft2026!` (see `capture-guide.cjs`). If those change, update the constants at the top of the script.
- A Chromium-based browser for Playwright. Two options:
  - `npx playwright install chromium` (must match the project's `@playwright/test` version — if versions mismatch you'll get "Executable doesn't exist"), **or**
  - point at an installed browser: `export CHROME_PATH="/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"` (Brave/Chrome/Edge all work). This is what we used to skip the slow download.
- Env for upload: `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` in `supabase/.env` (same as `npm run seed`).

### Re-capture → upload → index (the whole loop)
```bash
export OUT_DIR="/tmp/guide-shots"                       # any working dir
export CHROME_PATH="/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"  # or omit if playwright chromium is installed
node scripts/capture-guide.cjs        # logs in, clicks through each flow, annotates, screenshots -> $OUT_DIR + manifest.json
OUT_DIR="$OUT_DIR" node scripts/upload-guide.cjs   # uploads PNGs to Storage bucket "guide", regenerates TUTORIALS.md
npm run build:kb                      # re-indexes ASSISTANT_QA.md + TUTORIALS.md into kb_documents
# (no redeploy needed unless you changed the edge function code)
```
Then test: ask the assistant "how do I add a product?" — it should return the updated steps + fresh screenshots.

### How the capture locates things (what to tweak if it breaks)
In `scripts/capture-guide.cjs`, each workflow is one entry in the `flows` array:
```js
{ key:'add-product', menu:/products/i, menuText:'Products', route:'/products',
  addRe:/add|new|create|\+/i, addText:'Add', noun:'product',
  title:'How to add a product', kb:'How do I add a new product?', sample:{}, sampleDefault:'Sample Coffee' }
```
Each flow runs: **click the menu item → click the Add button → fill each visible form field → point at Save.** At every micro-step it draws a red highlight box + blue cursor circle + numbered caption, screenshots, then performs the action.

If the UI changes, adjust only what broke:
- **Menu label changed** (e.g., "Products" → "Catalog"): update `menu` (regex) and `menuText`.
- **Add button text/shape changed**: update `addRe` (it matches add/new/create/＋ by default).
- **Form fields changed**: usually **nothing to do** — the script enumerates whatever visible `input/textarea/select` the dialog shows and auto-labels each from its `<label>` (falling back to placeholder). New/renamed fields are captured automatically. It skips read-only/auto fields (like an auto-generated SKU).
- **A dialog/modal wrapper changed**: the field scope selector is `[role="dialog"], .fixed .bg-white, form` — widen it if the new modal isn't matched.
- **Login flow changed**: update the `login()` function selectors (currently `input[type="text"]`, `input[type="password"]`, button `/sign in/i`).

Captions are generated from field labels; if a caption reads oddly, improve the label heuristic in the field `evaluate()` block (it strips "Enter/Type", parentheses, `*`, and ignores value-like placeholders such as "0.00").

### Adding a NEW tutorial workflow (e.g., "make a sale", "issue a refund")
Add an entry to the `flows` array with its menu label, route, add-button regex, and a `kb` heading that matches the question users will ask. Re-run the loop above. For non-"create" flows (e.g., a multi-screen POS sale) you may need a bespoke step list instead of the generic create-flow — copy `createFlow()` and script the specific clicks, using the same `annotate()` + `shot()` helpers.

---

## 6. Deploy / redeploy checklist

```bash
# DB (idempotent; applies any new migrations)
supabase db push

# Secrets (Claude key; GDPR: use a DPA + zero-retention org)
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...

# Edge function (after editing anything in supabase/functions/assistant/)
supabase functions deploy assistant

# Knowledge base (after editing ASSISTANT_QA.md / TUTORIALS.md / capturing tutorials)
npm run build:kb
```
The assistant function auto-receives `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` from the platform; you only set `ANTHROPIC_API_KEY`.

Owner login for testing (created during setup): `owner@easysoft.test` / `EasySoft2026!` (an `auth.users` row + a `tenant_members` row with `role='owner'` for the Default Tenant). `pwa-login` accepts an email directly, so no `user_profiles` username row is required for an email login.

---

## 7. Tests

- Edge-function logic (offline, mocked Anthropic + Supabase): `deno test --no-check -A supabase/functions/assistant/`
  - `pii_test.ts` — pseudonymize/strip/rehydrate.
  - `core_test.ts` — the tool-use loop; proves real names never reach the model.
- The SQL read functions can be exercised with `SELECT public.assistant_sales_overview('<tenant>', CURRENT_DATE-30, CURRENT_DATE);` etc. (as the DB owner / via the Management API).

---

## 8. Gotchas & troubleshooting (things that actually bit us)

- **`.env` was RTF** — the cloned repo's `.env` had been saved as Rich Text and wouldn't parse. Keep `.env` and `supabase/.env` as plain text.
- **Playwright browser mismatch** — `npx playwright install` may fetch a chromium newer than the project's `@playwright/test`, causing "Executable doesn't exist". Use the project's own `./node_modules/.bin/playwright install chromium`, or `CHROME_PATH=<installed Chromium/Brave/Chrome>`.
- **macOS quarantine / partial builds** — a half-downloaded chromium `.app` fails with a missing "Chromium Framework". Delete the partial build and reinstall cleanly, or use `CHROME_PATH`.
- **tsvector too strict** — see §4; keep the `&`→`|` OR-swap in `assistant_search_docs`.
- **Product view has no tenant_id** — see §3; query base `products`.
- **`ALTER FUNCTION OWNER TO` fails on hosted Supabase** — see §3; keep functions owned by `postgres` + service-role-only `EXECUTE`.
- **Images don't render** — tutorial images live in `public/guide/` and are referenced by relative `/guide/<file>` URLs; confirm the file exists there and `curl http://localhost:5173/guide/<file>` returns HTTP 200. When merging into a different app/deployment, keep `public/guide/` in the build output so `/guide/*` is served.
- **How-to answers feel "developer-y"** — only index owner-facing content in `build-kb.cjs`'s `INCLUDE` (we deliberately dropped the repo's developer `.md` guides).

---

## 9. GDPR / security summary

- Read-only, tenant-scoped SQL functions are the only data surface; the model can't write or cross tenants.
- `pii.ts` keeps personal data out of the model (pseudonyms in, real names restored only in the reply).
- Conversation/audit tables are tenant-scoped (RLS) with a retention purge (`assistant_purge_history`).
- The `ANTHROPIC_API_KEY` is a function secret (never `VITE_`, never committed). Use a Claude org with a DPA + zero data retention.
