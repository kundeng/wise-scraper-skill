#!/usr/bin/env python
import csv
import subprocess
import sys
from urllib.parse import urljoin, urlparse, parse_qs

from bs4 import BeautifulSoup
import yaml


def run_agent_browser(args):
    result = subprocess.run(
        ["agent-browser", *args],
        check=True,
        text=True,
        capture_output=True,
    )
    return result.stdout


def browser_open(url):
    run_agent_browser(["open", url])
    run_agent_browser(["wait", "--load", "networkidle"])


def browser_get_html(selector):
    return run_agent_browser(["get", "html", selector])


def root_url(url):
    parsed = urlparse(url)
    return f"{parsed.scheme}://{parsed.netloc}/"


def select_first_href(soup, css_selector):
    el = soup.select_one(css_selector)
    if not el:
        return None
    href = el.get("href")
    return href


def normalize_text(text):
    if text is None:
        return ""
    return " ".join(text.split()).strip()


def parse_page_number(url):
    parsed = urlparse(url)
    qs = parse_qs(parsed.query)
    p = qs.get("p", [None])[0]
    try:
        return int(p)
    except (TypeError, ValueError):
        return None


def build_page_list(current_url, soup, pagination_selector, page_limit):
    urls = [current_url]
    base = root_url(current_url)
    for a in soup.select(pagination_selector):
        href = a.get("href")
        if not href:
            continue
        urls.append(urljoin(base, href))

    # De-duplicate while preserving first occurrence
    seen = set()
    unique = []
    for u in urls:
        if u in seen:
            continue
        seen.add(u)
        unique.append(u)

    # Prefer ordering by page number when available
    with_pages = [(parse_page_number(u), u) for u in unique]
    with_pages.sort(key=lambda x: (x[0] is None, x[0] if x[0] is not None else 0))
    ordered = [u for _, u in with_pages]

    # Ensure page 1 (current) is first
    if current_url in ordered:
        ordered.remove(current_url)
    ordered = [current_url] + ordered

    return ordered[:page_limit]


def extract_rows(html, row_selector, columns):
    if "<table" not in html:
        html = f"<table>{html}</table>"
    soup = BeautifulSoup(html, "html.parser")
    rows = []
    for row in soup.select(row_selector):
        item = {}
        for col in columns:
            name = col["name"]
            sel = col["selector"]
            cell = row.select_one(sel)
            item[name] = normalize_text(cell.get_text(" ", strip=True)) if cell else ""
        rows.append(item)
    return rows


def main():
    if len(sys.argv) < 2:
        print("Usage: run_revspin_durable.py <config.yaml>")
        sys.exit(1)

    config_path = sys.argv[1]
    with open(config_path, "r", encoding="utf-8") as f:
        config = yaml.safe_load(f)

    resource = config["resources"][0]
    selectors = {s["name"]: s for s in resource["selectors"]}
    root = selectors[resource["entry"]["root"]]

    # Entry page
    entry_url = resource["entry"]["url"]
    browser_open(entry_url)
    html = browser_get_html("body")
    final_url = entry_url
    soup = BeautifulSoup(html, "html.parser")

    # Interaction: click Durable header (navigate to durability-desc)
    interaction = root.get("interaction", [])
    for step in interaction:
        if step.get("type") != "click":
            continue
        css = step.get("target", {}).get("css")
        if not css:
            continue
        href = select_first_href(soup, css)
        if not href:
            raise RuntimeError(f"Interaction click target not found: {css}")
        # Some links are site-root relative without leading slash (e.g., top-rubber/...)
        # Use the site root to avoid double path segments.
        next_url = urljoin(root_url(final_url), href)
        browser_open(next_url)
        html = browser_get_html("body")
        final_url = next_url
        soup = BeautifulSoup(html, "html.parser")

    # Pagination selector
    pagination = None
    for s in resource["selectors"]:
        if s.get("type") == "pagination":
            pagination = s
            break
    if not pagination:
        raise RuntimeError("Pagination selector not found in config.")

    page_limit = pagination.get("pagination", {}).get("page_limit", 2)
    pagination_selector = pagination.get("pagination", {}).get("selector")

    page_urls = build_page_list(final_url, soup, pagination_selector, page_limit)

    # Row extractor
    row_selector = selectors["rows"]["selector"]
    columns = selectors["rows"]["extract"]

    all_rows = []
    for url in page_urls:
        browser_open(url)
        page_html = browser_get_html("table")
        page_rows = extract_rows(page_html, row_selector, columns)
        all_rows.extend(page_rows)

    # Output CSV
    output_path = "revspin_durable_top2pages.csv"
    fieldnames = [c["name"] for c in columns]

    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in all_rows:
            writer.writerow(row)

    print(f"Wrote {len(all_rows)} rows to {output_path}")


if __name__ == "__main__":
    main()
