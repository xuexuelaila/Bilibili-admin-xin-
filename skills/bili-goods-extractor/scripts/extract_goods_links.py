#!/usr/bin/env python3
"""Extract Bilibili goods links from copied HTML and export CSV/XLSX."""

from __future__ import annotations

import argparse
import csv
import html
import io
import sys
import zipfile
from dataclasses import dataclass
from html.parser import HTMLParser
from pathlib import Path
from typing import List
from xml.sax.saxutils import escape as xml_escape

HEADERS = ["href是长链接", "data-raw-url是短链接", "商品名是商品名", "平台"]


@dataclass
class GoodsRow:
    href: str
    raw_url: str
    name: str
    platform: str


class GoodsAnchorParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.rows: List[GoodsRow] = []
        self._in_anchor = False
        self._href = ""
        self._raw_url = ""
        self._text_parts: List[str] = []

    def handle_starttag(self, tag: str, attrs) -> None:
        if tag.lower() != "a":
            return

        attr_map = {k.lower(): (v or "") for k, v in attrs}
        href = attr_map.get("href", "").strip()
        raw_url = attr_map.get("data-raw-url", "").strip()

        # We only keep product anchors that carry both long and short links.
        if not href or not raw_url:
            return

        self._in_anchor = True
        self._href = html.unescape(href)
        self._raw_url = html.unescape(raw_url)
        self._text_parts = []

    def handle_data(self, data: str) -> None:
        if self._in_anchor:
            self._text_parts.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() != "a" or not self._in_anchor:
            return

        name = "".join(self._text_parts).strip()
        if name:
            platform = "京东平台" if "union-click.jd.com" in self._href else "淘宝平台"
            self.rows.append(
                GoodsRow(
                    href=self._href,
                    raw_url=self._raw_url,
                    name=name,
                    platform=platform,
                )
            )

        self._in_anchor = False
        self._href = ""
        self._raw_url = ""
        self._text_parts = []


def parse_goods_rows(html_text: str) -> List[GoodsRow]:
    parser = GoodsAnchorParser()
    parser.feed(html_text)
    parser.close()

    deduped: List[GoodsRow] = []
    seen = set()
    for row in parser.rows:
        key = (row.href, row.raw_url, row.name)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(row)
    return deduped


def write_csv(path: Path, rows: List[GoodsRow]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(HEADERS)
        for row in rows:
            writer.writerow([row.href, row.raw_url, row.name, row.platform])


def _xlsx_col_name(n: int) -> str:
    result = ""
    while n:
        n, rem = divmod(n - 1, 26)
        result = chr(65 + rem) + result
    return result


def write_xlsx(path: Path, rows: List[GoodsRow]) -> None:
    matrix = [HEADERS] + [[r.href, r.raw_url, r.name, r.platform] for r in rows]
    xml_rows = []
    for r_idx, row in enumerate(matrix, start=1):
        cells = []
        for c_idx, value in enumerate(row, start=1):
            ref = f"{_xlsx_col_name(c_idx)}{r_idx}"
            text = xml_escape(str(value))
            cells.append(f'<c r="{ref}" t="inlineStr"><is><t>{text}</t></is></c>')
        xml_rows.append(f'<row r="{r_idx}">' + "".join(cells) + "</row>")

    sheet_xml = (
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>"
        "<worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\">"
        "<sheetData>"
        + "".join(xml_rows)
        + "</sheetData></worksheet>"
    )

    content_types = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>"""

    rels = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>"""

    workbook = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="商品链接" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>"""

    workbook_rels = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>"""

    core = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <dc:title>B站商品链接提取结果</dc:title>
  <dc:creator>Codex Skill</dc:creator>
</cp:coreProperties>"""

    app = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Microsoft Excel</Application>
</Properties>"""

    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", content_types)
        zf.writestr("_rels/.rels", rels)
        zf.writestr("xl/workbook.xml", workbook)
        zf.writestr("xl/_rels/workbook.xml.rels", workbook_rels)
        zf.writestr("xl/worksheets/sheet1.xml", sheet_xml)
        zf.writestr("docProps/core.xml", core)
        zf.writestr("docProps/app.xml", app)


def read_input(args: argparse.Namespace) -> str:
    if args.input:
        return Path(args.input).read_text(encoding="utf-8")

    if args.stdin:
        data = sys.stdin.read()
        if data.strip():
            return data

    raise ValueError("请使用 --input 指定HTML文件，或通过 --stdin 从标准输入传入内容")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="从B站评论HTML中提取商品链接，并导出CSV/XLSX"
    )
    parser.add_argument("--input", help="包含评论HTML片段的文本文件路径")
    parser.add_argument("--stdin", action="store_true", help="从标准输入读取HTML")
    parser.add_argument(
        "--output-dir",
        default=".",
        help="输出目录，默认当前目录",
    )
    parser.add_argument(
        "--name",
        default="商品链接提取结果",
        help="输出文件名前缀（不带扩展名）",
    )
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    try:
        html_text = read_input(args)
    except Exception as exc:
        print(f"输入读取失败: {exc}", file=sys.stderr)
        return 2

    rows = parse_goods_rows(html_text)
    if not rows:
        print("未识别到商品链接（a标签需包含 href + data-raw-url）", file=sys.stderr)
        return 1

    out_dir = Path(args.output_dir).expanduser().resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    csv_path = out_dir / f"{args.name}.csv"
    xlsx_path = out_dir / f"{args.name}.xlsx"

    write_csv(csv_path, rows)
    write_xlsx(xlsx_path, rows)

    print(f"提取完成: {len(rows)} 条")
    print(f"CSV:  {csv_path}")
    print(f"XLSX: {xlsx_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
