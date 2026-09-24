# CureFit ad copywriter

Turns a product CSV into Meta ad copy: one row out for every product row in.

```
python3 -m adcopy products.csv -o ad_copy.csv
```

Export the Google Sheet with **File → Download → Comma-separated values (.csv)**.
No dependencies beyond Python 3.9+.

## Input

A header row followed by one product per row. The column names can vary:

| Field | Accepted headers |
|---|---|
| SKU (required) | `SKU`, `Code`, `Product Code`, `Item Code`, `Product ID`, `ID` |
| Product name (required) | `Product Name`, `Name`, `Product`, `Item Name`, `Title` |
| Brand | `Brand` |
| Category | `Category`, `Product Category`, `Type` |
| Price | `Price`, `MRP`, `Selling Price` (`₹1299`, `rs1599`, `₹ 5000`, `"Rs. 1,299"` all work) |
| Description | `Description`, `Product Description`, `Details` |

## Output

`source_row, sku, product_name, status, primary_text, headline, description, cta, review_notes`

- **READY**: copy filled in. Headline ≤ 40 chars, description ≤ 30, primary text ≤ 125 (Meta's truncation points).
- **NEEDS_REVIEW**: copy left blank and `review_notes` says why. Causes: missing SKU or name,
  duplicate SKU (every row sharing it is flagged; case and spaces are ignored, so `CS 178` matches `CS178`), a price of 0 or a price that can't be read,
  a row with more cells than headers (usually an unquoted comma in a price), or source text
  that calls out the viewer's health or body.

## How it avoids making things up

Copy comes from fixed templates filled only with that row's values, so nothing is carried
over from other rows, and no benefits, discounts, urgency, reviews or guarantees get added.
A missing price leaves price out of the copy completely and switches the CTA to *Learn More*.
As a last check, the finished copy is scanned for claim words (`guaranteed`, `% off`,
`limited`, `best`, …). If one shows up that isn't in the source row, the row goes to review.

## Tests

```
python3 -m unittest discover -s tests -v
```
