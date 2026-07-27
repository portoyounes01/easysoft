# Fallback when the certified program cannot issue — PT legal brief

Research date **2026-07-27**, for register **D-FR1** (non-fiscal fallback receipt).
Not tax advice — confirm with the accountant before go-live. Sources at the end.

## 1. The fallback is a real, named legal path

When a certified invoicing program is **inoperable**, the entity must issue its
invoices on **pre-printed documents from an AT-authorised tipografia**, and those
documents must **afterwards be recovered into the certified program**.

**Ofício-Circulado n.º 30213, de 2019-10-01** defines inoperability as: failure of
the computer equipment, lack of electricity, or inability to reach the application
because the telecom operator provides no network coverage.

That maps exactly onto our trigger conditions (offline, backend unreachable, no
valid ATCUD/QR obtainable).

## 2. What this means for the till — the design consequences

1. **The paper book is the fiscal document; ours is not.** The legal invoice for
   that sale is the handwritten one. Our printed fallback is an internal
   sale slip, so it must carry no ATCUD, no QR, no fatura number, and must say
   plainly that it is not an invoice.
2. **It must not consume a number from the fatura series.** Confirmed by the user
   and required anyway — a fatura number issued but never used as a fatura breaks
   the sequence the AT expects. Give the fallback its own non-fiscal counter.
3. ⚠️ **"Recovered into the program" is a REQUIREMENT, and it is a capability we
   do not have.** Once the system is back, the manually-issued invoices have to be
   entered into the certified software. That is not the same as re-issuing a
   fatura for the sale — re-issuing would double-invoice it. What is needed is a
   way to register the manual document against the existing sale: its series, its
   number, its ATCUD, its date and totals.
4. **The book must be a real AT-authorised tipografia book.** It carries its own
   communicated series and pre-printed ATCUD; for tipografia documents the
   tipografia is responsible for communicating the series. A plain notebook or a
   generic receipt pad is **not** a valid fallback.

## 3. Series questions

- Series must be communicated to AT **before** the first document of that series
  is issued; the AT returns a validation code. Legal basis: **Portaria
  n.º 195/2020, de 13 de agosto** (arts. 3 and 16).
- **Discontinued series:** there is **no obligation** to formally close a series —
  the facility exists for management convenience. If you do close one, report the
  **actual last document number issued**, never a projected one. A validation code
  can never be reused, and numbering of an already-used series can never restart.
  So a till that stops using a series can simply stop; nothing must be filed.

## 4. Open question for the operator

**Does the shop actually hold an AT-authorised manual invoice book?** The whole
fallback path is only lawful if it does. If it does not, the honest options are to
obtain one, or to block sales while fiscal issuance is down. We should surface the
book's series/number on screen at fallback time so the cashier records it.

## Sources

- [AT — Séries/ATCUD, âmbito de aplicação (Portal das Finanças FAQ)](https://info.portaldasfinancas.gov.pt/pt/apoio_contribuinte/questoes_frequentes/Pages/faqs-00883.aspx)
- [Artsoft — procedimentos na emissão de documentos (cites Ofício-Circulado 30213)](https://artsoft.pt/sobrenos/blog/item/28-procedimentos-na-emissao-de-documentos)
- [Cegid Vendus — as faturas manuais são válidas em 2026?](https://www.vendus.pt/blog/faturas-manuais-2026/)
- [izibizi — ATCUD e séries de faturação](https://izibizi.pt/blog/atcud-series-faturacao-saiba-tudo/)
- [OCC — Decreto-Lei n.º 28/2019](https://occ.pt/pt-pt/noticias/decreto-lei-no-282019)

## 5. How the three providers handle "recovery into the certified program"

Researched 2026-07-27. **The same pattern in all three: the paper book is its own
series, and its documents are entered afterwards — never given a number from the
software's own fatura series.** That confirms the design decision.

### Vendus — has the feature, and it names the pattern explicitly
"Registar documento manual": POS → add the items that were invoiced on paper →
Options → *Documento Manual* → enter the **emission date** and the **series/number**
of the paper document → Apply. Its stated purpose is exactly our case: temporary
loss of access through internet failure or device malfunction.

The decisive detail is the numbering. Vendus keeps manual documents on a
**separate series** from software-issued ones — its own example contrasts
`FT 01P2019/` (software) with `FT 01M2019/` (manual). So the manual document is
recorded as a document of a *different series*, not as a new software invoice.
Their help page does not state how ATCUD or SAF-T are handled for these; assume
the ATCUD is the tipografia's pre-printed one and verify before copying.

### InvoiceXpress — no dedicated outage feature; the building blocks exist
No "manual document during outage" workflow was found. What it does have:
- **"Registar Série"** for a series that *already has documents issued* — the path
  for declaring the tipografia book's series inside the software.
- **Batch invoice import (CSV)** for loading previously-issued invoices.
- SAF-T XML export, manual monthly or automatic submission.

So the same shape, assembled by hand: register the book's series, then import its
documents.

### fiskaly SIGN PT — unknown, and this is a gap to close with them
No public documentation on offline fallback or on registering externally-issued
documents. It does manage the full series lifecycle (creation, AT communication,
ATCUD retrieval) and generates/submits SAF-T PT. Its FAQ carries the question
"What happens if my system goes offline?" but the answer is not published.

⚠️ **Action: ask fiskaly directly** — (a) can a series be registered whose
documents originate outside fiskaly (the tipografia book), and (b) can a document
be recorded after the fact with a supplied series/number/ATCUD without minting a
new fiskaly number? This blocks the reconciliation half of D-FR1 on the fiskaly
track. Add to the fiskaly question list (register B6).

### What this means for our implementation

1. The fallback slip stays non-fiscal and numberless (own counter) — unchanged.
2. Recovery is a **separate document series** for the paper book, declared once,
   plus a per-sale record of *which paper document* covered it (series, number,
   ATCUD, date). We are recording an existing document, not issuing a new one.
3. The ATCUD comes from the pre-printed book, so we must capture it rather than
   generate it.

### Additional sources

- [Vendus — Como registar um documento manual?](https://www.vendus.pt/ajuda/como-registar-um-documento-manual/)
- [InvoiceXpress — Como registar uma série já existente?](https://invoicexpress.helpscoutdocs.com/article/234-registar-serie-ja-existente)
- [InvoiceXpress — Posso importar faturas?](https://invoicexpress.com/faqs/importacao-exportacao-dados/importar-facturas/)
- [fiskaly SIGN PT](https://www.fiskaly.com/signpt)

---

## 6. What was implemented (2026-07-27)

The rule that shaped the whole implementation is not a legal one, it is a
mechanical one: **a paper invoice may only be written for a sale the backend
certainly does not already hold a document for.** Everything else follows.

### The dispatch question

`src/fiscal/fiscalFailure.ts` classifies an issuance failure into exactly two
buckets, on the single question of whether the request left the till:

| Bucket | Thrown by | Meaning | Fallback |
|---|---|---|---|
| `not-dispatched` | the issuers' `assertOnline()` guards, which run **before** the issue-attempt row is created | no connectivity; nothing can exist at the provider | offered directly |
| `unresolved` | the `catch` wrapped around everything from the network call onward | timeout, 5xx, reset, provider rejection, or a success body we could not parse — a document **may** exist | only after the operator attests they checked the backoffice |

Any other error (missing register id, expired series, invalid line price) is
**not** classified and the sale stays blocked as before. Those are configuration
faults; a handwritten invoice does not fix them and they will still be there
tomorrow.

The two buckets are deliberately coarse. A timeout, an HTTP 500 and an
unparseable 200 are indistinguishable from the till — in all three the request
is already at the provider. Widening the optimistic bucket needs the edge
functions to report the provider's actual status (register **D-FR3**); until
then, the conservative reading is the correct one, because guessing
optimistically is precisely what double-invoices a sale.

### The slip

`createNonFiscalFallbackAtomic` (`src/lib/localDatabase.ts`) writes the
transaction, its items and the `NON_FISCAL_FALLBACK_ISSUED` audit event in one
IndexedDB transaction, and writes **no `fiscal_documents` row at all**. That
absence is load-bearing: SAF-T is built from fiscal documents
(`exportSaft.ts`), so the slip is excluded from it structurally rather than by
a filter someone can forget. For the same reason it never enters the AT hash
chain, and `POSContext` skips the série-counter advance for it — a série that
skips a number is a defect, a série that numbers a document which does not
exist is a fiscal one.

The reference is `TNF-<till>-<nnnnnn>` from its own per-till counter, read
inside the write transaction so two tabs cannot mint the same one. The till
discriminator comes from the device pairing scope, because the audit log is
per-device: without it, two tills that go offline together would both mint
`TNF-000001` and recording one paper invoice would clear the other's reminder.

### What the customer gets

The slip keeps everything commercial — logo, company block, items, totals, IVA
table, payment, queue number — and drops everything fiscal: no ATCUD, no QR, no
hash, no customer NIF block, and neither the AT certification phrase nor the
Veri*factu legend. The document number is replaced by `ID: <slip reference>`,
and it carries **ESTE TALÃO NÃO SERVE COMO FATURA** plus the instruction to
issue the invoice from the authorised paper book. The ESC/POS builder and the
on-screen `ThermalReceipt` suppress exactly the same elements, and the
back-office reprint (`Transactions.tsx`) reads the `nonFiscal` marker off the
transaction's metadata so a reprint months later still renders a slip.

### Recovery

Per §5 no provider offers an API to register a pre-issued paper document, so
recovery is operator work with per-provider instructions surfaced on the fiscal
log page. The till **never re-issues these online** — for InvoiceXpress and
fiskaly that is explicit in the reminder text. `ManualDocumentDialog` captures
the book's series, number, ATCUD and date (all transcribed, never generated),
which pairs against the issuance event and clears the reminder.
