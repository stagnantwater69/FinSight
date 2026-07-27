# FinSight OCR Accuracy Assessment

Generated: 2026-07-25

Corpus: **20 receipt images**. Pipeline under test: `extractText()` (tesseract.js) followed by `parseReceiptFields()` — the same two functions the receipt-scan endpoint calls.

A field is **correct** only on an exact match (amounts to the centavo, dates to the day). Vendor matching tolerates light OCR character noise but not a wrong line.

## Headline results

| Field | Correct | Wrong | Not extracted | Scored | Accuracy |
|---|---|---|---|---|---|
| Date | 20 | 0 | 0 | 20 | **100%** |
| Vendor | 18 | 1 | 0 | 19 | **95%** |
| Amount | 20 | 0 | 0 | 20 | **100%** |

All three fields correct on the same receipt: **19 of 20** (95%).

`n/a` fields are excluded from the denominator — those are receipts where the information genuinely is not present in the image, so there is nothing to extract.

## Results by image category

| Category | Images | Date | Vendor | Amount |
|---|---|---|---|---|
| real | 2 | 100% | 100% | 100% |
| synthetic | 12 | 100% | 92% | 100% |
| degraded | 6 | 100% | 100% | 100% |

## Per-image detail

| # | Image | Conditions | Date | Vendor | Amount |
|---|---|---|---|---|---|
| 1 | `real-01-ph-pos-photo` | Real phone photo, PH POS thermal receipt, on wooden table, slight crumple, store name cropped out of frame | ✅ | — | ✅ |
| 2 | `real-02-clean-digital` | Clean digitally-generated receipt, high contrast, US layout, vendor at top, no TOTAL keyword (uses AMT/BALANCE) | ✅ | ✅ | ✅ |
| 3 | `syn-01-vendor-top-iso-date` | Printed, vendor at top, ISO date (YYYY-MM-DD), TOTAL keyword, no thousands separator | ✅ | ✅ | ✅ |
| 4 | `syn-02-vendor-bottom` | Printed, vendor at BOTTOM of receipt (known layout weakness), ISO date | ✅ | ❌ | ✅ |
| 5 | `syn-03-ambiguous-slash-date` | Printed, ambiguous numeric date 03/09/2026 (both components <= 12) — read as DD/MM per PH convention | ✅ | ✅ | ✅ |
| 6 | `syn-04-month-name-date` | Printed, month-name date (Jul 05, 2026) | ✅ | ✅ | ✅ |
| 7 | `syn-05-thousands-separator` | Printed, amount with thousands separator (12,450.00) | ✅ | ✅ | ✅ |
| 8 | `syn-06-subtotal-then-total` | Printed, SUBTOTAL present before TOTAL (must not pick subtotal) | ✅ | ✅ | ✅ |
| 9 | `syn-07-no-total-keyword` | Printed, NO 'TOTAL' keyword at all (uses 'Amount Due') — tests the max-value fallback | ✅ | ✅ | ✅ |
| 10 | `syn-08-peso-sign` | Printed, peso sign prefixes every amount | ✅ | ✅ | ✅ |
| 11 | `syn-09-two-digit-year` | Printed, two-digit year (07/22/26) | ✅ | ✅ | ✅ |
| 12 | `syn-10-dd-mm-yyyy` | Printed, DD/MM/YYYY date (25/07/2026) — resolvable by validity, since 25 cannot be a month | ✅ | ✅ | ✅ |
| 13 | `syn-11-long-header` | Printed, several administrative lines before the vendor name (TIN/permit block first) | ✅ | ✅ | ✅ |
| 14 | `syn-12-tiny-amount` | Printed, very small amount (single-digit pesos) | ✅ | ✅ | ✅ |
| 15 | `deg-01-blur` | Synthetic + Gaussian blur r=1.6 (simulates out-of-focus capture) | ✅ | ✅ | ✅ |
| 16 | `deg-02-low-contrast` | Synthetic + contrast reduced to 35% (simulates faded thermal print) | ✅ | ✅ | ✅ |
| 17 | `deg-03-rotated` | Synthetic + rotated 4 degrees (simulates handheld skew) | ✅ | ✅ | ✅ |
| 18 | `deg-04-low-resolution` | Synthetic + downscaled to 45% then back up (simulates a distant/low-res photo) | ✅ | ✅ | ✅ |
| 19 | `deg-05-dark` | Synthetic + brightness reduced to 45% (simulates poor lighting) | ✅ | ✅ | ✅ |
| 20 | `deg-06-jpeg-artifacts` | Synthetic + heavy JPEG compression (quality 12) | ✅ | ✅ | ✅ |

✅ correct · ❌ wrong value returned · ⬜ nothing extracted · — not applicable (not present in image)

## Every failure, with what was returned instead

### `syn-02-vendor-bottom`

*Printed, vendor at BOTTOM of receipt (known layout weakness), ISO date*

| Field | Expected | Got | |
|---|---|---|---|
| vendor | `"TINDAHAN NI MANG JOSE"` | `"*xx GALES INVOICE ***"` | ❌ |

## Corpus composition and what it does and does not prove

| Category | Count | What it tests |
|---|---|---|
| real | 2 | Genuine receipt images, one a phone photo of a Philippine thermal POS receipt on a table |
| synthetic | 12 | Parser robustness across layouts, date formats, amount formats, currency symbols, header styles |
| degraded | 6 | Synthetic receipts degraded with blur, low contrast, rotation, downscaling, darkness and JPEG artifacts |

**This corpus over-states robustness to real-world photo quality.** Only 2 of the 20 images are real photographs. The 6 degraded images are *rendered* receipts with uniform, synthetic degradation applied programmatically — real phone captures have uneven lighting, curled thermal paper, motion blur, shadows and fold creases that are not reproduced here. Tesseract handled every degraded image perfectly, which is a claim about clean-render-plus-filter, **not** about a shopkeeper photographing a crumpled receipt in a dim store.

**No handwritten receipts are included.** None were available. Handwritten *resibo* are common in sari-sari stores, and tesseract's default model is trained on printed text — accuracy on handwriting should be assumed poor until measured. This is an untested gap, not a passing case.

## Failure patterns

### 1. Ambiguous numeric dates — resolved by defaulting to DD/MM

When a date reads `11/07/2026` and both components are ≤ 12, nothing in the text can resolve it. The parser previously assumed **MM/DD** (US convention) and read that as 7 November; on the real Philippine receipt in this corpus the true date was **11 July**, so it was exactly wrong, and confidently so.

The default is now **DD/MM**, the Philippine convention and this app's target market. Date accuracy went from 95% to **100%** on this corpus. Validity still wins where only one reading is possible — `07/22/2026` is still read as 22 July, because 22 cannot be a month.

**The cost, stated plainly:** a genuinely US-format receipt is now misread instead. That trade is unavoidable without a per-profile locale setting, and it is the right way round for these users. `syn-03` in the corpus is that ambiguous case, and its ground truth is the DD/MM reading.

### 2. Vendor name printed in the footer

The vendor heuristic takes the first substantive line, so a store name printed at the bottom is read wrong (it returns the document header instead). No cheap heuristic separates a footer store name from a "thank you, come again" line. Left to the confirm screen and recorded as a known limitation.

### 3. OCR losing the transaction-date line entirely on a real photo

On the real thermal-receipt photo, tesseract never recovered the `Jul 11 2026 (Sat)` line at all — it is absent from the extracted text. The parser can only work with what OCR returns, so no parsing rule could have recovered it. This is an image-quality/OCR-engine limit, and it is the kind of failure the 6 synthetic degraded images did **not** reproduce.

## Fixes applied during this assessment

1. **Invalid dates crashed the whole upload (defect, fixed).** A DD/MM/YYYY receipt dated after the 12th produced `2026-25-07` — month 25. That becomes an `Invalid Date`, which Prisma rejects with a validation error, so the entire receipt upload failed with a 500 and the owner lost the scan rather than getting a correctable draft. The parser now validates every date against the real calendar (including rejecting e.g. 31 February) and resolves `DD/MM` when the first component cannot be a month.
2. **Administrative dates were preferred over the transaction date (defect, fixed).** Philippine POS receipts print BIR permit, PTU-issued and accreditation dates *above* the transaction date; first-match-wins read those. The real receipt returned `2024-10-14` from its `PTU Issued` line. Those lines are now excluded, with a fallback so a wrong-but-correctable date still beats an empty field.
3. **Registration blocks were read as the vendor (defect, fixed).** `VAT REG TIN: …`, `POS SN: …` and bare `*** SALES INVOICE ***` headers are now skipped when choosing the vendor, as are lines that are mostly digits.

4. **Ambiguous numeric dates defaulted to the wrong locale (fixed).** Changed from MM/DD to DD/MM — see failure pattern 1 above.

Measured effect across all four: date accuracy 90% → **100%**, vendor accuracy 89% → **95%**, all-three-correct 16/20 → **19/20**. Every fix is pinned by regression tests in `tests/unit/ocrParsing.test.ts`.

## Bottom line

Amount extraction is the strongest and most important field, at 100% across the corpus including every degraded variant. Dates now also read 100% after the locale fix. The one remaining failure is a vendor name printed in a receipt footer.

These numbers should still not be read as "OCR is ~100% accurate". They are a claim about this corpus, which is 90% clean renders and only 2 real photographs, with no handwritten receipts at all. The design already assumes OCR will be wrong sometimes: every scan lands on a confirm screen as an editable draft and nothing is saved until the owner accepts it. Read these figures as "OCR gives a usable first draft on clean receipts, and needs correcting on difficult ones".

