#!/usr/bin/env python3
"""Check every rendered HTML href/src and local fragment with the stdlib only."""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parents[1]


@dataclass(frozen=True)
class Reference:
    tag: str
    attribute: str
    value: str
    line: int


class PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.ids: set[str] = set()
        self.references: list[Reference] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        line, _ = self.getpos()
        for name, value in attrs:
            if value is None:
                continue
            if name in {"id", "name"}:
                self.ids.add(value)
            if name in {"href", "src"}:
                self.references.append(Reference(tag, name, value, line))


def parse_page(path: Path) -> PageParser:
    parser = PageParser()
    parser.feed(path.read_text(encoding="utf-8", errors="replace"))
    return parser


def is_external(value: str) -> bool:
    lowered = value.strip().lower()
    return (
        lowered.startswith(("http://", "https://", "//", "mailto:", "tel:", "data:", "javascript:", "blob:"))
        or not lowered
    )


def resolve_local(site_dir: Path, source: Path, url_path: str) -> Path:
    decoded = unquote(url_path)
    if decoded.startswith("/"):
        target = site_dir / decoded.lstrip("/")
    elif decoded:
        target = source.parent / decoded
    else:
        target = source
    if decoded.endswith("/") or target.is_dir():
        target = target / "index.html"
    return target.resolve()


def check_site(site_dir: Path) -> list[str]:
    issues: list[str] = []
    site_dir = site_dir.resolve()
    html_files = sorted(site_dir.rglob("*.html"))
    if not html_files:
        return [f"No rendered HTML files found under {site_dir}"]
    parsed_pages = {path.resolve(): parse_page(path) for path in html_files}

    for source, page in parsed_pages.items():
        source_label = source.relative_to(site_dir)
        for ref in page.references:
            value = ref.value.strip()
            if is_external(value):
                continue
            split = urlsplit(value)
            if split.scheme or split.netloc:
                continue
            if split.path.lower().endswith(".qmd"):
                issues.append(f"{source_label}:{ref.line} {ref.attribute} still points to source QMD: {value}")
                continue
            target = resolve_local(site_dir, source, split.path)
            try:
                target.relative_to(site_dir)
            except ValueError:
                issues.append(f"{source_label}:{ref.line} {ref.attribute} escapes the rendered site: {value}")
                continue
            if not target.exists():
                issues.append(f"{source_label}:{ref.line} missing local {ref.attribute}: {value}")
                continue
            if split.fragment:
                if target.suffix.lower() not in {".html", ".htm"}:
                    issues.append(f"{source_label}:{ref.line} fragment points to a non-HTML file: {value}")
                    continue
                target_page = parsed_pages.get(target)
                if target_page is None:
                    target_page = parse_page(target)
                    parsed_pages[target] = target_page
                fragment = unquote(split.fragment)
                if fragment not in target_page.ids:
                    issues.append(f"{source_label}:{ref.line} missing fragment #{fragment} in {target.relative_to(site_dir)}")
    return issues


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("site_dir", nargs="?", type=Path, default=ROOT / "_site", help="rendered site directory (default: _site)")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    site_dir = args.site_dir if args.site_dir.is_absolute() else (Path.cwd() / args.site_dir)
    issues = check_site(site_dir)
    if issues:
        print(f"Rendered-site validation failed with {len(issues)} issue(s):", file=sys.stderr)
        for issue in issues:
            print(f"  - {issue}", file=sys.stderr)
        return 1
    page_count = len(list(site_dir.rglob("*.html")))
    print(f"Rendered-site validation passed for {page_count} HTML pages.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
