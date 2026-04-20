# Project notes (structured)

Organized from `notes`. Source file is unchanged.

---

## Customer data

- Customer record must include **address** and **postal code**. (in the POS interface, when we click customer button in the top right corner, we should add the address and postal code)

---

## SAFT, duplication, and logging

- When generating SAFT files, all included data (transactions, etc.) must be **marked/flagged** so a later SAFT export does not repeat the same records (avoid duplicates).
- Whatever is sent to SAFT needs to be **marked/flagged**.
- **Logs are critical**: if something goes wrong, everything should be reconstructable from logs.
- **Duplicate invoice** (`fatura duplicada`) — track/mitigate as a risk area.

---

## Environment / modes

- Support **test / stage / formation / debug** modes (and related behaviour).

---

## Series and AT (Finanças)

- **Invoice series** must be filled manually (admin or manager); values come from the AT.
- **Each POS machine** should have a **unique series**.
- **Series in settings** (as provided by Finanças) must match **all documents** and the **generated SAFT**.
- Series in settings should include a **description** field.
- **No reset policy**: series resets at year-end require a **new** series; the original series must not be tampered with.

---

## VAT (IVA)

- **IVA percentages** (6%, 13%, 23%) must be stored in the DB (already present) and **sent to AT/Finanças**.

---

## Recibos

- **Recibos** (receipts) — noted as a separate document type to handle.

---

## Document numbering and sequencing

- Document number must **start from 1** when appropriate and stay **sequential** (**very important**).
- **Hash of document N** depends on **hash of document N−1** (chain).
- **New series**: document numbers can start from **1** again.
- **Existing/reused series**: document numbers must continue **sequentially** from the **last number used** in that series.
- **Never** create a new document without **verifying** it (or its number/identifier) does not already exist.
- Add **UI** showing **last document number used** per series to reduce human error and show what comes next.

---

## Hash (document chain)

- System **entry date** (and related fields) are part of hash considerations (see full spec in codebase / AT docs).

---

## QR code

- Add **country code** to the payload.
- QR should **not** expose the full hash — only **last 4 characters** (or equivalent truncation per spec).

---

## SAF-T content

- **All products** must appear in SAF-T, including **newly added products with no orders** yet.

---

## HashControl

- **Must not** be exposed in Settings, **even for system admin**.

---

## Settings

- Review **settings prefix** (hardcoded `ABC` — verify and remove if inappropriate).

---

## Invoices (Faturas)

- **FS vs FT** (and similar types) are **different** — do **not** generate both document types for the **same order**.
- Invoice numbers must **always** be sequential **within the same series**; only restart at **1** for a **new** series issued by Finanças.
- **NC (credit note)**: **motivo** does not need to appear on the **receipt**, but **must** be in the **SAFT**.
- For **FT**, add option to issue **recibo** where applicable.

---

## Cancelling a document (Anular documento)

- An invoice can be **cancelled** (e.g. customer no longer wants it) but must **remain stored**, in **SAFT**, and on the **printed** document it must show as **cancelled**.

---

## POS UI and receipts

- POS: allow **removing one line item** (e.g. click item in **right panel** to remove).
- Show **client NIF** in the POS **right panel** when a customer is selected; also on **printed receipt** and in **SAFT**.
- **Company NIF** should appear **at the top** with the rest of company data on receipts/output.
- Include **name of the user** who issued the document on the receipt.

---

## Data integrity and demo

- **Important**: verify transactions are saved correctly to **both** local DB and remote DB — currently **broken** (needs fix).
- **Unique DB** for demo / **formação** mode.

---

## Quick reference checklist

| Area              | Priority / note                                      |
| ----------------- | ---------------------------------------------------- |
| Sequential numbers| Critical; per-series; hash chain                     |
| SAFT flags        | Mark exported data; avoid duplicates                 |
| Logs              | Critical for reconstruction                          |
| Series            | Manual AT values; unique per POS; settings = SAF-T   |
| HashControl       | Never in settings UI                                 |
| FS vs FT          | One document type per order                          |
| Cancelled docs    | Kept + visible cancelled + in SAF-T                  |
| Sync              | Local + remote transaction persistence               |
