# Anulação (status "A") vs Nota de Crédito — Portuguese fiscal rules

> Research memo, 2026-07-04. Primary sources: AT FAQs (verbatim), CIVA, Despacho 8632/2014, Portaria 302/2016, OCC pareceres, CAAD case law. Supports `docs/multi-tenant-plan.md` §7.6 (the per-tenant CANCELLATION policy flag). **This memo informs the policy; written confirmation from the tenant's accountant is still required before enabling annulment for any tenant.**

## The dividing line

- **Nota de crédito (NC/ND) is mandatory** whenever the **taxable value or VAT of an operation that took commercial effect** is altered — "por qualquer motivo, incluindo inexatidão" (CIVA art. 29.º/7). Returns, post-sale discounts, price errors, VAT-rate errors, partial cancellations (CIVA art. 78.º/2–3). A new invoice may never rectify value/tax (Ofício-Circulado 30136/2012, pt. 14).
- **Anulação (SAF-T status A) is the correct instrument** when the document was **"invalidamente emitido"** — issued in error with no real operation behind it, or with an error that does **not** touch value/VAT (e.g., buyer identification) — **and the original never stays with the customer** (AT SAF-T FAQ 2764, verbatim: "o original do documento em circunstância alguma pode ficar na posse do cliente").

## Lawful annulment — cumulative conditions (ALL must hold)

1. Invalidly/erroneously issued: no effective operation, or error in the "outros motivos" branch of OC 30136/2012 pt. 14 (identification of acquirer, description) — never value/VAT of a real sale.
2. The original is not with the customer — never delivered, or physically recovered into the issuer's archive (FAQ 2764).
3. No risk of tax-revenue loss — the acquirer cannot be left holding a deductible document (CIVA art. 2.º/1/c; TCASul proc. 49/10.5BESNT via CAAD 925/2019-T).
4. Recorded, never deleted: document stays in DB and SAF-T with `InvoiceStatus=A`, `InvoiceStatusDate` (to the second) and `SourceID` (user) mandatory; `Reason` expected though not schema-mandatory (Portaria 302/2016 4.1.4.3; AT FAQ 2798). Any 2.ª via printed afterwards must state "anulado" (FAQ 2764).
5. Annulment communicated to AT **via the same channel used for the original** (e-fatura FAQ 4955) — annulment after communication is expressly possible; monthly SAF-T must include annulled docs "devidamente assinalados" (Portaria 302/2016, table 4.1).

No statutory same-day/same-period deadline for annulment was found (UNVERIFIED — vendor guidance framing "before communication/delivery" is convenience, not a legal cutoff). VAT exigibility is untouched by annul-and-reissue (OCC).

## Certified-software sequencing rules (Despacho 8632/2014)

- pt. 1.9/1.11 — nothing deleted, no fiscally-relevant alteration of signed documents.
- pt. 3.3.7 — **no NC over an annulled or fully rectified document.**
- pt. 3.3.8 — **no annulment of a document that already has an NC/ND** without first annulling the rectifying document.
- pt. 2.2.6 — printed docs carry no negative values; corrections only via documentos retificativos.
- pt. 3.3.3 — customer NIF cannot be edited on a record with issued documents → NIF fixes go through annul-and-reissue, never record edits.

## Application to this POS (fiskaly SIGN PT, online-required v1)

**Valid annulment cases (back-office only, policy flag per plan §7.6):**
1. **Duplicate signed document** from a technical fault (double-submit/timeout/printer jam) — the duplicate reflects no operation; an NC would fabricate the reversal of a non-existent sale (CAAD 925/2019-T: such NCs are "mera documentação interna").
2. **Orphan document — payment failed after issuance**: fiskaly signs at checkout, then the card declines / the sale never completes. Signed doc, no supply, nothing delivered → anular. *This class is created by the online checkout architecture itself; the `fiscal-record-reconciler`/`issued_unpersisted` sweeper surfaces it.*
3. **Immediate operator error, original never delivered** (wrong items/amount caught at the till before handing the receipt; no payment retained).
4. **Wrong buyer identification/NIF on an FT** — annul + reissue is the sanctioned route (OC 30136/2012 pt. 14; OCC cliente-cessado parecer); NC is the *wrong* instrument for identification errors. Original must be recovered.

**Never annulment — NC always (unchanged from current posture):**
returns/exchanges; post-sale discounts; price or VAT corrections on an effective sale; any case where the customer kept goods and/or an unrecoverable original (then NC + art. 78.º/5 proof); **any till-side flow — the till never gets a cancellation control.**

## Sources

- CIVA art. 78.º: https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/codigos_tributarios/civa_rep/Pages/iva78.aspx
- CIVA art. 2.º: https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/codigos_tributarios/civa_rep/Pages/iva2.aspx
- Despacho n.º 8632/2014 (AT, PDF): https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/legislacao/diplomas_legislativos/Documents/Despacho_n%C2%BA_8632_2014_03_07.pdf
- AT SAF-T FAQs 2764, 2798: https://info.portaldasfinancas.gov.pt/pt/apoio_contribuinte/questoes_frequentes/Pages/faqs-00276.aspx
- AT e-fatura FAQs 4945, 4955: https://info.portaldasfinancas.gov.pt/pt/apoio_contribuinte/questoes_frequentes/pages/faqs-00978.aspx
- AT e-fatura Pedidos de Eliminação FAQs 4948/4975/4976: https://info.portaldasfinancas.gov.pt/pt/faturas/Pages/faqs-00985.aspx
- Portaria n.º 302/2016 (SAF-T PT structure, PDF): https://www.olisoft.pt/pdf/Portaria_302_2016_AT.pdf
- OCC — retificação de faturas emitidas: https://www.occ.pt/pt-pt/noticias/iva-retificacao-de-faturas-emitidas
- OCC — fatura emitida a um cliente cessado: https://www.occ.pt/pt-pt/noticias/iva-retificacao-de-fatura-emitida-um-cliente-cessado
- OCC — erros na faturação: https://www.occ.pt/pt-pt/noticias/iva-erros-na-faturacao
- OCC — anulação de fatura (PT25734): https://www.occ.pt/pt-pt/noticias/anulacao-de-fatura
- OCC — regularizações de faturas: https://www.occ.pt/pt-pt/noticias/iva-regularizacoes-de-faturas
- CAAD proc. 925/2019-T: https://caad.org.pt/tributario/decisoes/view.php?l=MjAyMDExMDUyMjMwNTMwLlA5MjVfMjAxOS1UIC0gMjAyMC0wOS0yMSAtIEpVUklTUFJVREVOQ0lBLnBkZg%3D%3D
- TOConline — anular documento já comunicado: https://manual.toconline.pt/support/solutions/articles/3000117676
- OC 30136/2012 pt. 14 corroborated via three OCC pareceres + ficha doutrinária (original PDF not directly fetched): http://antigo.apcmc.pt/legislacao/2012/alteracoes_facturacao_oficio_AT.html
