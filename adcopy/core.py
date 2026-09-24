"""Turn product rows from a CSV into Meta ad copy.

Copy is built from fixed templates filled only with values from the row
itself, so nothing is invented: no benefits, discounts, urgency or claims
that the CSV doesn't contain. Rows that can't be written safely come back
as NEEDS_REVIEW with a note instead of copy.
"""

import csv
import io
import re

READY = "READY"
NEEDS_REVIEW = "NEEDS_REVIEW"

OUTPUT_FIELDS = [
    "source_row", "sku", "product_name", "status",
    "primary_text", "headline", "description", "cta", "review_notes",
]

# Meta's recommended lengths before text gets truncated in the feed.
MAX_PRIMARY = 125
MAX_HEADLINE = 40
MAX_DESCRIPTION = 30

COLUMN_ALIASES = {
    "sku": ["sku", "code", "sku_code", "product_code", "item_code", "product_id", "id"],
    "name": ["product_name", "name", "product", "item_name", "title"],
    "brand": ["brand", "brand_name"],
    "category": ["category", "product_category", "type"],
    "price": ["price", "mrp", "selling_price"],
    "description": ["description", "product_description", "details", "desc"],
}

# Wording that assumes or calls out the viewer's health or body. If the CSV
# itself contains it, the row goes to review rather than into an ad.
PERSONAL_ATTRIBUTE_PATTERNS = [
    r"struggling with", r"suffering from", r"tired of", r"are you\b",
    r"your (body|weight|belly|size|health|pain|back pain|skin|joints)",
    r"overweight", r"\bobese\b",
]

# Claims the templates must never introduce. Checked against the finished
# copy; a hit that isn't in the source row sends the row to review.
CLAIM_TERMS = [
    "guarantee", "guaranteed", "proven", "clinically", "certified", "best",
    "#1", "number one", "discount", "% off", "sale", "offer", "free",
    "limited", "hurry", "today only", "last chance", "in stock", "only a few",
    "bestseller", "best-seller", "customers love", "rated", "reviews",
    "results", "lose weight", "burn", "fat", "pain relief", "cure", "heal",
    "organic", "natural", "premium",
]

_CURRENCY = re.compile(r"^(₹|rs\.?|inr)\s*|\s*(/-|₹|rs\.?|inr)$", re.IGNORECASE)
_AMOUNT = re.compile(r"^\d+(\.\d{1,2})?$")


def generate_from_csv(text):
    """Return one ad dict per non-blank product row in the CSV text."""
    rows = _read_rows(text)
    sku_counts = {}
    for _, product, _ in rows:
        key = _sku_key(product["sku"])
        if key:
            sku_counts[key] = sku_counts.get(key, 0) + 1

    ads = []
    for line_no, product, extra_cells in rows:
        duplicate = sku_counts.get(_sku_key(product["sku"]), 0) > 1
        ads.append(_ad_for(line_no, product, duplicate, extra_cells))
    return ads


def generate_file(input_path, output_path):
    with open(input_path, encoding="utf-8-sig", newline="") as f:
        ads = generate_from_csv(f.read())
    with open(output_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=OUTPUT_FIELDS)
        writer.writeheader()
        writer.writerows(ads)
    return ads


# --- reading -----------------------------------------------------------------

def _read_rows(text):
    reader = csv.reader(io.StringIO(text.lstrip("﻿")))
    lines = [(reader.line_num, row) for row in reader]
    lines = [(n, row) for n, row in lines if any(cell.strip() for cell in row)]
    if not lines:
        return []

    _, header = lines[0]
    columns = _map_columns(header)
    products = []
    for line_no, row in lines[1:]:
        product = {
            field: (row[i].strip() if i is not None and i < len(row) else "")
            for field, i in columns.items()
        }
        extra = [c for c in row[len(header):] if c.strip()]
        products.append((line_no, product, bool(extra)))
    return products


def _map_columns(header):
    normalised = [re.sub(r"[^a-z0-9]+", "_", h.strip().lower()).strip("_") for h in header]
    columns = {}
    for field, aliases in COLUMN_ALIASES.items():
        columns[field] = next((normalised.index(a) for a in aliases if a in normalised), None)
    return columns


def _sku_key(sku):
    return re.sub(r"\s+", "", sku).lower()


# --- validation --------------------------------------------------------------

def _parse_price(raw):
    """Return (formatted_price, problem). Both None when the price is blank."""
    if not raw:
        return None, None
    amount = _CURRENCY.sub("", raw.strip()).replace(",", "").replace(" ", "")
    amount = _CURRENCY.sub("", amount)
    if not _AMOUNT.match(amount):
        return None, f"price '{raw}' could not be read"
    if float(amount) == 0:
        return None, f"price is {raw}; check before advertising"
    return _format_inr(amount), None


def _format_inr(amount):
    whole, _, paise = amount.partition(".")
    whole = whole.lstrip("0") or "0"
    if len(whole) > 3:
        head, tail = whole[:-3], whole[-3:]
        groups = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        if head:
            groups.insert(0, head)
        whole = ",".join(groups + [tail])
    if paise and int(paise):
        return f"₹{whole}.{paise.ljust(2, '0')}"
    return f"₹{whole}"


def _personal_attribute_hit(product):
    text = " ".join(product[f] for f in ("name", "category", "description")).lower()
    return any(re.search(p, text) for p in PERSONAL_ATTRIBUTE_PATTERNS)


def _unsupported_claims(copy, product):
    source = " ".join(product.values()).lower()
    found = []
    for term in CLAIM_TERMS:
        pattern = r"(?<!\w)" + re.escape(term) + r"(?!\w)"
        if re.search(pattern, copy.lower()) and not re.search(pattern, source):
            found.append(term)
    return found


# --- writing -----------------------------------------------------------------

def _ad_for(line_no, product, duplicate, extra_cells=False):
    ad = {field: "" for field in OUTPUT_FIELDS}
    ad.update(source_row=line_no, sku=product["sku"], product_name=product["name"])

    problems = []
    if not product["sku"]:
        problems.append("missing SKU")
    if not product["name"]:
        problems.append("missing product name")
    if duplicate:
        problems.append(f"duplicate SKU '{product['sku']}' appears in more than one row")
    if extra_cells:
        problems.append("row has more cells than the header has columns; "
                        "quote values that contain commas, e.g. \"1,299\"")
    price, price_problem = _parse_price(product["price"])
    if price_problem:
        problems.append(price_problem)
    if _personal_attribute_hit(product):
        problems.append("row contains wording that calls out the viewer's health or body")

    if problems:
        return _needs_review(ad, problems)

    copy = _write_copy(product, price)
    claims = _unsupported_claims(" ".join(copy.values()), product)
    if claims:
        return _needs_review(ad, [f"copy contains unsupported claim(s): {', '.join(claims)}"])

    ad.update(copy, status=READY)
    return ad


def _needs_review(ad, problems):
    ad["status"] = NEEDS_REVIEW
    ad["review_notes"] = "; ".join(problems)
    return ad


def _write_copy(product, price):
    name = _display(product["name"])
    brand = _display(product["brand"])
    category = _display(product["category"])
    full_name = name if not brand or brand.lower() in name.lower() else f"{brand} {name}"

    return {
        "primary_text": _primary_text(full_name, price, _first_sentence(product["description"])),
        "headline": _headline(full_name, price),
        "description": _description(category, price, brand),
        "cta": "Shop Now" if price else "Learn More",
    }


def _primary_text(full_name, price, detail):
    hook = _fit(f"Say hello to {full_name}.", MAX_PRIMARY)
    price_line = f"Yours for {price}." if price else ""
    closer = "Tap to take a look."

    text = _join(hook, price_line)
    if detail:
        room = MAX_PRIMARY - len(text) - 1
        if room >= 20:
            text = _join(hook, _fit(detail, room), price_line)
    if len(_join(text, closer)) <= MAX_PRIMARY:
        text = _join(text, closer)
    return text


def _headline(full_name, price):
    if price and len(f"{full_name} – {price}") <= MAX_HEADLINE:
        return f"{full_name} – {price}"
    return _fit(full_name, MAX_HEADLINE)


def _description(category, price, brand):
    for option in (category and price and f"{category} · {price}", category,
                   f"By {brand}" if brand else "", price):
        if option and len(option) <= MAX_DESCRIPTION:
            return option
    return "Tap to take a look"


def _display(value):
    value = " ".join(value.split())
    return value[:1].upper() + value[1:] if value.islower() else value


def _first_sentence(text):
    text = " ".join(text.split())
    match = re.match(r"(.+?[.!?])(\s|$)", text)
    sentence = match.group(1) if match else text
    if sentence and sentence[-1] not in ".!?":
        sentence += "."
    return sentence


def _fit(text, limit):
    if len(text) <= limit:
        return text
    cut = text[: limit - 1].rsplit(" ", 1)[0].rstrip(",;:.")
    return cut + "…"


def _join(*parts, sep=" "):
    return sep.join(p for p in parts if p)
