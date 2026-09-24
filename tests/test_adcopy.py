import re
import unittest

from adcopy import generate_from_csv

AD_FIELDS = ("primary_text", "headline", "description", "cta")

# Words the generator must never add on its own. Each one is a benefit,
# result, discount, urgency, testimonial, certification, guarantee or
# availability claim that a plain product row can't back up.
UNSUPPORTED_CLAIMS = [
    "guarantee", "guaranteed", "proven", "clinically", "certified",
    "best", "#1", "number one", "discount", "% off", "sale", "offer",
    "free", "limited", "hurry", "today only", "last chance", "in stock",
    "only a few", "bestseller", "best-seller", "customers love",
    "rated", "reviews", "results", "lose weight", "burn", "fat",
    "pain relief", "cure", "heal", "organic", "natural", "premium",
]

# Wording that assumes or calls out the viewer's health or body.
PERSONAL_ATTRIBUTE_PHRASES = [
    "your body", "your weight", "overweight", "your pain", "your back pain",
    "your health", "are you", "struggling with", "your belly", "your size",
]


def ad_text(ad):
    return " ".join(ad[f] for f in AD_FIELDS).lower()


def csv_of(*lines):
    return "\n".join(lines) + "\n"


class ValidRowTest(unittest.TestCase):
    def test_valid_row_produces_one_complete_ad_with_the_sku(self):
        ads = generate_from_csv(csv_of(
            "SKU,Product Name,Category,Price,Description",
            "CF-101,Cloud Runner,Footwear,₹2499,Lightweight mesh upper.",
        ))

        self.assertEqual(len(ads), 1)
        ad = ads[0]
        self.assertEqual(ad["sku"], "CF-101")
        self.assertEqual(ad["status"], "READY")
        for field in AD_FIELDS:
            self.assertTrue(ad[field].strip(), f"{field} is empty")
        self.assertIn("Cloud Runner", ad["primary_text"])
        self.assertIn("₹2,499", ad_text(ad))

    def test_output_stays_within_meta_length_guidance(self):
        ad = generate_from_csv(csv_of(
            "SKU,Product Name,Category,Price,Description",
            "CF-102,Cloud Runner Pro Max Ultra Edition Training Shoe,Footwear,₹2499,"
            "Lightweight mesh upper with a padded collar and a grippy rubber outsole "
            "for indoor sessions. Comes in three colours.",
        ))[0]

        self.assertLessEqual(len(ad["headline"]), 40)
        self.assertLessEqual(len(ad["description"]), 30)
        self.assertLessEqual(len(ad["primary_text"]), 125)

    def test_cta_is_a_standard_meta_button(self):
        ad = generate_from_csv(csv_of(
            "SKU,Product Name,Price",
            "CF-103,Yoga Mat,₹999",
        ))[0]
        self.assertIn(ad["cta"], {"Shop Now", "Learn More", "Buy Now", "See More"})

    def test_column_names_from_the_curefit_sheet_are_understood(self):
        ads = generate_from_csv(csv_of(
            "Code,Name,Brand,Price",
            "CS17,Apparel,Curefit,₹999",
        ))
        self.assertEqual(ads[0]["sku"], "CS17")
        self.assertEqual(ads[0]["status"], "READY")
        self.assertIn("Apparel", ads[0]["primary_text"])
        self.assertIn("Curefit", ad_text(ads[0]).title())

    def test_messy_price_formats_are_normalised(self):
        ads = generate_from_csv(csv_of(
            "Code,Name,Price",
            "A1,Shoe,rs1599",
            "A2,Tee,₹ 5000",
            'A3,Mat,"Rs. 1,299"',
        ))
        self.assertIn("₹1,599", ad_text(ads[0]))
        self.assertIn("₹5,000", ad_text(ads[1]))
        self.assertIn("₹1,299", ad_text(ads[2]))


class MissingDataTest(unittest.TestCase):
    def test_missing_product_name_is_flagged_for_review(self):
        ads = generate_from_csv(csv_of(
            "SKU,Product Name,Category,Price",
            "CF-201,,Footwear,₹2499",
        ))

        self.assertEqual(len(ads), 1)
        ad = ads[0]
        self.assertEqual(ad["sku"], "CF-201")
        self.assertEqual(ad["status"], "NEEDS_REVIEW")
        self.assertIn("product name", ad["review_notes"].lower())
        for field in AD_FIELDS:
            self.assertEqual(ad[field], "", f"{field} should not be invented")

    def test_missing_sku_is_flagged_for_review(self):
        ad = generate_from_csv(csv_of(
            "SKU,Product Name,Price",
            ",Yoga Mat,₹999",
        ))[0]
        self.assertEqual(ad["status"], "NEEDS_REVIEW")
        self.assertIn("sku", ad["review_notes"].lower())

    def test_missing_price_does_not_invent_a_price(self):
        ad = generate_from_csv(csv_of(
            "SKU,Product Name,Category,Price",
            "CF-202,Yoga Mat,Accessories,",
        ))[0]

        self.assertEqual(ad["sku"], "CF-202")
        text = ad_text(ad)
        self.assertNotIn("₹", text)
        self.assertNotIn("rs", re.findall(r"\brs\b", text))
        self.assertIsNone(re.search(r"\d", text), f"a number appeared: {text}")
        self.assertNotIn("price", text)

    def test_missing_price_column_does_not_invent_a_price(self):
        ad = generate_from_csv(csv_of(
            "SKU,Product Name",
            "CF-203,Yoga Mat",
        ))[0]
        self.assertEqual(ad["status"], "READY")
        self.assertIsNone(re.search(r"\d|₹", ad_text(ad)))

    def test_zero_price_is_flagged_rather_than_advertised(self):
        ad = generate_from_csv(csv_of(
            "Code,Name,Price",
            "CS172,massager,₹0",
        ))[0]
        self.assertEqual(ad["status"], "NEEDS_REVIEW")
        self.assertIn("price", ad["review_notes"].lower())
        self.assertNotIn("₹0", ad_text(ad))

    def test_unreadable_price_is_flagged_rather_than_guessed(self):
        ad = generate_from_csv(csv_of(
            "Code,Name,Price",
            "X1,Mat,call us",
        ))[0]
        self.assertEqual(ad["status"], "NEEDS_REVIEW")
        self.assertIn("price", ad["review_notes"].lower())

    def test_row_with_extra_cells_is_flagged_not_misread(self):
        # An unquoted comma in "1,299" splits the price across two cells.
        ad = generate_from_csv(csv_of(
            "Code,Name,Price",
            "A3,Mat,Rs. 1,299",
        ))[0]
        self.assertEqual(ad["status"], "NEEDS_REVIEW")
        self.assertIn("column", ad["review_notes"].lower())
        self.assertNotIn("₹1", ad_text(ad))

    def test_blank_lines_are_ignored(self):
        ads = generate_from_csv(csv_of(
            "SKU,Product Name,Price",
            "CF-1,Mat,₹999",
            ",,",
            "",
            "CF-2,Tee,₹499",
        ))
        self.assertEqual([a["sku"] for a in ads], ["CF-1", "CF-2"])


class GroundingTest(unittest.TestCase):
    def test_unsupported_claims_are_not_added(self):
        ads = generate_from_csv(csv_of(
            "SKU,Product Name,Category,Price,Description",
            "CF-301,Cloud Runner,Footwear,₹2499,Mesh upper and rubber outsole.",
            "CF-302,Massage Gun,Recovery,₹5999,Four speed settings.",
            "CF-303,Yoga Mat,,,",
        ))

        for ad in ads:
            text = ad_text(ad)
            for claim in UNSUPPORTED_CLAIMS:
                self.assertIsNone(
                    re.search(r"(?<!\w)" + re.escape(claim) + r"(?!\w)", text),
                    f"{ad['sku']} added unsupported claim {claim!r}: {text}",
                )
            for phrase in PERSONAL_ATTRIBUTE_PHRASES:
                self.assertNotIn(phrase, text, f"{ad['sku']}: {text}")

    def test_every_number_in_the_copy_comes_from_the_row(self):
        ads = generate_from_csv(csv_of(
            "SKU,Product Name,Category,Price,Description",
            "CF-311,Cloud Runner,Footwear,₹2499,Mesh upper.",
            "CF-312,Yoga Mat,Accessories,,Six mm thick.",
        ))
        allowed = {"CF-311": {"2,499", "2499"}, "CF-312": set()}
        for ad in ads:
            for number in re.findall(r"\d[\d,]*", ad_text(ad)):
                self.assertIn(number, allowed[ad["sku"]], f"{ad['sku']}: {number}")

    def test_description_with_personal_health_wording_is_flagged(self):
        ad = generate_from_csv(csv_of(
            "SKU,Product Name,Description",
            "CF-321,Massage Gun,Struggling with back pain? Try this.",
        ))[0]
        self.assertEqual(ad["status"], "NEEDS_REVIEW")
        self.assertNotIn("struggling", ad_text(ad))

    def test_facts_do_not_leak_between_rows(self):
        ads = generate_from_csv(csv_of(
            "SKU,Product Name,Brand,Category,Price,Description",
            "CF-401,Cloud Runner,Curefit,Footwear,₹2499,Breathable mesh upper.",
            "CF-402,Recovery Roller,Nike,Recovery,₹1199,Textured foam surface.",
        ))
        by_sku = {ad["sku"]: ad_text(ad) for ad in ads}

        facts = {
            "CF-401": ["cloud runner", "curefit", "footwear", "2,499", "mesh"],
            "CF-402": ["recovery roller", "nike", "1,199", "foam"],
        }
        for sku, own_facts in facts.items():
            for other_sku, other_text in by_sku.items():
                if other_sku == sku:
                    continue
                for fact in own_facts:
                    self.assertNotIn(fact, other_text,
                                     f"{sku}'s {fact!r} leaked into {other_sku}")


class DuplicateSkuTest(unittest.TestCase):
    def test_duplicate_skus_are_flagged_for_review(self):
        ads = generate_from_csv(csv_of(
            "Code,Name,Brand,Price",
            "CS177,Apparel,Curefit,₹1299",
            "S178,footwear,Curefit,rs1599",
            "CS177,footwear,nike,₹ 5000",
        ))

        self.assertEqual([a["sku"] for a in ads], ["CS177", "S178", "CS177"])
        dupes = [a for a in ads if a["sku"] == "CS177"]
        for ad in dupes:
            self.assertEqual(ad["status"], "NEEDS_REVIEW")
            self.assertIn("duplicate", ad["review_notes"].lower())
        self.assertEqual(ads[1]["status"], "READY")

    def test_duplicate_check_ignores_case_and_spaces(self):
        ads = generate_from_csv(csv_of(
            "SKU,Product Name",
            "cf-1,Mat",
            " CF-1 ,Tee",
        ))
        self.assertTrue(all(a["status"] == "NEEDS_REVIEW" for a in ads))

    def test_duplicate_check_ignores_spaces_inside_the_sku(self):
        # The CureFit sheet has "CS 178"; a later "CS178" is the same code.
        ads = generate_from_csv(csv_of(
            "Code,Name,Brand,Price",
            "CS 178,footwear,Curefit,₹1599",
            "CS178,footwear,Curefit,₹1599",
        ))
        self.assertEqual([a["sku"] for a in ads], ["CS 178", "CS178"])
        for ad in ads:
            self.assertEqual(ad["status"], "NEEDS_REVIEW")
            self.assertIn("duplicate", ad["review_notes"].lower())


if __name__ == "__main__":
    unittest.main()
