#!/usr/bin/env python3
"""
Builds the OCR accuracy corpus.

Two sources:
  1. Real receipt photographs copied in from disk (ground truth read by eye).
  2. Synthetic receipts rendered from HTML via headless Chrome, then optionally
     degraded with PIL to approximate poor phone captures.

HONEST LIMITATION, stated here and in the report: a rendered-then-degraded
image is NOT the same thing as a real phone photo of a crumpled thermal
receipt. Synthetic blur/noise/rotation is uniform and predictable; real capture
noise is not. The synthetic set is useful for testing the PARSER against layout
and date-format variety, which is what most of the failures were about. It
over-states robustness to real-world photo quality.

Writes images to ./images/ and ground truth to ./ground-truth.json.
"""

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter

HERE = Path(__file__).parent
IMAGES = HERE / "images"
HTML_TMP = HERE / ".html-tmp"

CHROME = shutil.which("google-chrome") or shutil.which("chromium") or shutil.which("chromium-browser")
if not CHROME:
    sys.exit("No Chrome/Chromium found — needed to render synthetic receipts.")

# ---------------------------------------------------------------------------
# Real receipt photographs. Ground truth transcribed by reading each image.
# ---------------------------------------------------------------------------
REAL_RECEIPTS = [
    {
        "id": "real-01-ph-pos-photo",
        "source": "/home/ken/Downloads/receipt.jpeg",
        "conditions": "Real phone photo, PH POS thermal receipt, on wooden table, slight crumple, store name cropped out of frame",
        # The store's own name is NOT in the photo — the top of the receipt is
        # cut off, so the first readable line is the VAT registration line.
        # There is no correct vendor available in this image.
        "expected": {"date": "2026-07-11", "vendor": None, "amount": 188.00},
        "vendor_note": "Store name is not present in the image (top cropped). No extractable ground truth.",
    },
    {
        "id": "real-02-clean-digital",
        "source": "/home/ken/Downloads/ItemizedBarcode.jpg",
        "conditions": "Clean digitally-generated receipt, high contrast, US layout, vendor at top, no TOTAL keyword (uses AMT/BALANCE)",
        "expected": {"date": "2019-12-27", "vendor": "AROMA CAFE", "amount": 8.70},
    },
]

# ---------------------------------------------------------------------------
# Synthetic receipts. Each varies one thing that could plausibly break parsing.
# ---------------------------------------------------------------------------
RECEIPT_CSS = """
  body { margin:0; background:#fff; }
  .r { width:520px; padding:28px 34px; font-family:'DejaVu Sans Mono','Liberation Mono',monospace;
       font-size:19px; color:#111; line-height:1.55; }
  .c { text-align:center; }
  .row { display:flex; justify-content:space-between; }
  .big { font-size:23px; font-weight:bold; }
  .sep { border-top:1px dashed #444; margin:10px 0; }
  .sm { font-size:15px; color:#333; }
"""


def receipt_html(body: str) -> str:
    return f"<!doctype html><html><head><meta charset='utf-8'><style>{RECEIPT_CSS}</style></head><body><div class='r'>{body}</div></body></html>"


def rows(items):
    return "".join(f"<div class='row'><span>{n}</span><span>{v}</span></div>" for n, v in items)


SYNTHETIC = [
    {
        "id": "syn-01-vendor-top-iso-date",
        "conditions": "Printed, vendor at top, ISO date (YYYY-MM-DD), TOTAL keyword, no thousands separator",
        "expected": {"date": "2026-07-20", "vendor": "ALING NENA SARI-SARI STORE", "amount": 1220.00},
        "body": "<div class='c big'>ALING NENA SARI-SARI STORE</div>"
                "<div class='c sm'>Apas, Cebu City</div><div class='sep'></div>"
                "<div>Date: 2026-07-20</div><div class='sep'></div>"
                + rows([("Rice 25kg", "1050.00"), ("Cooking oil 1L", "170.00")])
                + "<div class='sep'></div>"
                + rows([("TOTAL", "1220.00"), ("CASH", "1500.00"), ("CHANGE", "280.00")]),
    },
    {
        "id": "syn-02-vendor-bottom",
        "conditions": "Printed, vendor at BOTTOM of receipt (known layout weakness), ISO date",
        "expected": {"date": "2026-07-18", "vendor": "TINDAHAN NI MANG JOSE", "amount": 845.50},
        "body": "<div class='c sm'>*** SALES INVOICE ***</div><div class='sep'></div>"
                "<div>Date: 2026-07-18</div>"
                + rows([("Softdrinks case", "540.00"), ("Bread", "305.50")])
                + "<div class='sep'></div>" + rows([("TOTAL", "845.50")])
                + "<div class='sep'></div><div class='c big'>TINDAHAN NI MANG JOSE</div>"
                  "<div class='c sm'>Thank you, come again!</div>",
    },
    {
        "id": "syn-03-ambiguous-slash-date",
        # Both components <= 12, so this is unresolvable from the text alone.
        # Ground truth is the Philippine reading (3 September), which is what
        # the parser now assumes. A US-format receipt printing the same string
        # would be read wrong — the unavoidable cost of picking a default, and
        # the right way round for this market.
        "conditions": "Printed, ambiguous numeric date 03/09/2026 (both components <= 12) — read as DD/MM per PH convention",
        "expected": {"date": "2026-09-03", "vendor": "CEBU MINI GROCERY", "amount": 2340.75},
        "known_ambiguous": True,
        "body": "<div class='c big'>CEBU MINI GROCERY</div><div class='sep'></div>"
                "<div>Date: 03/09/2026</div>"
                + rows([("Assorted goods", "2340.75")])
                + "<div class='sep'></div>" + rows([("TOTAL", "2340.75")]),
    },
    {
        "id": "syn-04-month-name-date",
        "conditions": "Printed, month-name date (Jul 05, 2026)",
        "expected": {"date": "2026-07-05", "vendor": "BARANGAY SUPPLY DEPOT", "amount": 675.00},
        "body": "<div class='c big'>BARANGAY SUPPLY DEPOT</div><div class='sep'></div>"
                "<div>Jul 05, 2026</div>"
                + rows([("Cleaning supplies", "675.00")])
                + "<div class='sep'></div>" + rows([("TOTAL", "675.00")]),
    },
    {
        "id": "syn-05-thousands-separator",
        "conditions": "Printed, amount with thousands separator (12,450.00)",
        "expected": {"date": "2026-07-12", "vendor": "METRO WHOLESALE TRADING", "amount": 12450.00},
        "body": "<div class='c big'>METRO WHOLESALE TRADING</div><div class='sep'></div>"
                "<div>Date: 2026-07-12</div>"
                + rows([("Bulk inventory", "12,450.00")])
                + "<div class='sep'></div>" + rows([("TOTAL", "12,450.00")]),
    },
    {
        "id": "syn-06-subtotal-then-total",
        "conditions": "Printed, SUBTOTAL present before TOTAL (must not pick subtotal)",
        "expected": {"date": "2026-07-14", "vendor": "SARI-SARI EXPRESS", "amount": 1120.00},
        "body": "<div class='c big'>SARI-SARI EXPRESS</div><div class='sep'></div>"
                "<div>Date: 2026-07-14</div>"
                + rows([("Goods", "1000.00")])
                + "<div class='sep'></div>"
                + rows([("SUBTOTAL", "1000.00"), ("VAT 12%", "120.00"), ("TOTAL", "1120.00")]),
    },
    {
        "id": "syn-07-no-total-keyword",
        "conditions": "Printed, NO 'TOTAL' keyword at all (uses 'Amount Due') — tests the max-value fallback",
        "expected": {"date": "2026-07-16", "vendor": "JAH GENERAL MERCHANDISE", "amount": 3400.00},
        "body": "<div class='c big'>JAH GENERAL MERCHANDISE</div><div class='sep'></div>"
                "<div>Date: 2026-07-16</div>"
                + rows([("Stock purchase", "3400.00")])
                + "<div class='sep'></div>" + rows([("Amount Due", "3400.00")]),
    },
    {
        "id": "syn-08-peso-sign",
        "conditions": "Printed, peso sign prefixes every amount",
        "expected": {"date": "2026-07-19", "vendor": "VISAYAS FOOD SUPPLY", "amount": 980.25},
        "body": "<div class='c big'>VISAYAS FOOD SUPPLY</div><div class='sep'></div>"
                "<div>Date: 2026-07-19</div>"
                + rows([("Frozen goods", "&#8369;980.25")])
                + "<div class='sep'></div>" + rows([("TOTAL", "&#8369;980.25")]),
    },
    {
        "id": "syn-09-two-digit-year",
        "conditions": "Printed, two-digit year (07/22/26)",
        "expected": {"date": "2026-07-22", "vendor": "QUICK MART APAS", "amount": 455.00},
        "body": "<div class='c big'>QUICK MART APAS</div><div class='sep'></div>"
                "<div>Date: 07/22/26</div>"
                + rows([("Snacks", "455.00")])
                + "<div class='sep'></div>" + rows([("TOTAL", "455.00")]),
    },
    {
        "id": "syn-10-dd-mm-yyyy",
        "conditions": "Printed, DD/MM/YYYY date (25/07/2026) — resolvable by validity, since 25 cannot be a month",
        "expected": {"date": "2026-07-25", "vendor": "MANDAUE DRY GOODS", "amount": 1875.00},
        "body": "<div class='c big'>MANDAUE DRY GOODS</div><div class='sep'></div>"
                "<div>Date: 25/07/2026</div>"
                + rows([("Dry goods", "1875.00")])
                + "<div class='sep'></div>" + rows([("TOTAL", "1875.00")]),
    },
    {
        "id": "syn-11-long-header",
        "conditions": "Printed, several administrative lines before the vendor name (TIN/permit block first)",
        "expected": {"date": "2026-07-21", "vendor": "LAPU-LAPU TRADING CO", "amount": 5600.00},
        "known_layout_risk": True,
        "body": "<div class='sm'>VAT REG TIN: 123-456-789-00000</div>"
                "<div class='sm'>PERMIT NO: FP102026-080-0473287</div>"
                "<div class='sm'>POS SN: 1000104650067</div><div class='sep'></div>"
                "<div class='c big'>LAPU-LAPU TRADING CO</div><div class='sep'></div>"
                "<div>Date: 2026-07-21</div>"
                + rows([("Hardware", "5600.00")])
                + "<div class='sep'></div>" + rows([("TOTAL", "5600.00")]),
    },
    {
        "id": "syn-12-tiny-amount",
        "conditions": "Printed, very small amount (single-digit pesos)",
        "expected": {"date": "2026-07-23", "vendor": "CORNER STORE APAS", "amount": 8.50},
        "body": "<div class='c big'>CORNER STORE APAS</div><div class='sep'></div>"
                "<div>Date: 2026-07-23</div>"
                + rows([("Candy", "8.50")])
                + "<div class='sep'></div>" + rows([("TOTAL", "8.50")]),
    },
]

# Degraded variants: (source synthetic id, new id, condition label, transform)
DEGRADATIONS = [
    ("syn-01-vendor-top-iso-date", "deg-01-blur", "Synthetic + Gaussian blur r=1.6 (simulates out-of-focus capture)",
     lambda im: im.filter(ImageFilter.GaussianBlur(1.6))),
    ("syn-01-vendor-top-iso-date", "deg-02-low-contrast", "Synthetic + contrast reduced to 35% (simulates faded thermal print)",
     lambda im: ImageEnhance.Contrast(im).enhance(0.35)),
    ("syn-05-thousands-separator", "deg-03-rotated", "Synthetic + rotated 4 degrees (simulates handheld skew)",
     lambda im: im.rotate(-4, expand=True, fillcolor=(255, 255, 255))),
    ("syn-05-thousands-separator", "deg-04-low-resolution", "Synthetic + downscaled to 45% then back up (simulates a distant/low-res photo)",
     lambda im: im.resize((int(im.width * 0.45), int(im.height * 0.45)), Image.LANCZOS)
                  .resize((im.width, im.height), Image.LANCZOS)),
    ("syn-06-subtotal-then-total", "deg-05-dark", "Synthetic + brightness reduced to 45% (simulates poor lighting)",
     lambda im: ImageEnhance.Brightness(im).enhance(0.45)),
    ("syn-06-subtotal-then-total", "deg-06-jpeg-artifacts", "Synthetic + heavy JPEG compression (quality 12)",
     "jpeg12"),
]


def render(html: str, out: Path):
    HTML_TMP.mkdir(exist_ok=True)
    page = HTML_TMP / "r.html"
    page.write_text(html, encoding="utf-8")
    subprocess.run(
        [CHROME, "--headless", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
         "--force-device-scale-factor=2", "--window-size=600,1000",
         f"--screenshot={out}", f"file://{page}"],
        check=True, capture_output=True,
    )
    # Trim the uniform white margin Chrome leaves around the receipt.
    im = Image.open(out).convert("RGB")
    bbox = Image.eval(im, lambda p: 255 - p).getbbox()
    if bbox:
        im.crop((max(0, bbox[0] - 12), max(0, bbox[1] - 12),
                 min(im.width, bbox[2] + 12), min(im.height, bbox[3] + 12))).save(out)


def main():
    if IMAGES.exists():
        shutil.rmtree(IMAGES)
    IMAGES.mkdir(parents=True)

    corpus = []

    for r in REAL_RECEIPTS:
        src = Path(r["source"])
        if not src.exists():
            print(f"  SKIP {r['id']} — source missing: {src}")
            continue
        dest = IMAGES / f"{r['id']}{src.suffix}"
        shutil.copy(src, dest)
        corpus.append({"id": r["id"], "file": dest.name, "kind": "real",
                       "conditions": r["conditions"], "expected": r["expected"],
                       **({"vendor_note": r["vendor_note"]} if "vendor_note" in r else {})})
        print(f"  real      {r['id']}")

    rendered = {}
    for s in SYNTHETIC:
        dest = IMAGES / f"{s['id']}.png"
        render(receipt_html(s["body"]), dest)
        rendered[s["id"]] = dest
        entry = {"id": s["id"], "file": dest.name, "kind": "synthetic",
                 "conditions": s["conditions"], "expected": s["expected"]}
        for k in ("known_ambiguous", "known_layout_risk"):
            if s.get(k):
                entry[k] = True
        corpus.append(entry)
        print(f"  synthetic {s['id']}")

    for src_id, new_id, conditions, transform in DEGRADATIONS:
        if src_id not in rendered:
            continue
        base = SYNTHETIC[[s["id"] for s in SYNTHETIC].index(src_id)]
        im = Image.open(rendered[src_id]).convert("RGB")
        if transform == "jpeg12":
            dest = IMAGES / f"{new_id}.jpg"
            im.save(dest, "JPEG", quality=12)
        else:
            dest = IMAGES / f"{new_id}.png"
            transform(im).save(dest)
        corpus.append({"id": new_id, "file": dest.name, "kind": "degraded",
                       "derived_from": src_id, "conditions": conditions,
                       "expected": base["expected"]})
        print(f"  degraded  {new_id}")

    (HERE / "ground-truth.json").write_text(json.dumps(corpus, indent=2) + "\n", encoding="utf-8")
    if HTML_TMP.exists():
        shutil.rmtree(HTML_TMP)

    kinds = {}
    for c in corpus:
        kinds[c["kind"]] = kinds.get(c["kind"], 0) + 1
    print(f"\n{len(corpus)} images: " + ", ".join(f"{v} {k}" for k, v in sorted(kinds.items())))


if __name__ == "__main__":
    main()
