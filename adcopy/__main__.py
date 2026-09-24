import argparse
import sys

from .core import NEEDS_REVIEW, generate_file


def main(argv=None):
    parser = argparse.ArgumentParser(
        prog="python -m adcopy",
        description="Write Meta ad copy for each product row in a CSV.")
    parser.add_argument("input", help="product CSV (e.g. Google Sheets > File > Download > CSV)")
    parser.add_argument("-o", "--output", default="ad_copy.csv", help="where to write the ads")
    args = parser.parse_args(argv)

    ads = generate_file(args.input, args.output)
    review = sum(ad["status"] == NEEDS_REVIEW for ad in ads)
    print(f"Wrote {len(ads)} rows to {args.output}: "
          f"{len(ads) - review} ready, {review} need review.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
