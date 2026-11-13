"""Read the supplied UAE workbook without changing it; retain source IDs and links."""
from __future__ import annotations

import argparse
import json
import posixpath
import re
from pathlib import Path
import xml.etree.ElementTree as ET
import zipfile

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
REL = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"


def extract(path: Path) -> dict:
    with zipfile.ZipFile(path) as archive:
        shared = []
        if "xl/sharedStrings.xml" in archive.namelist():
            shared = ["".join(node.itertext()) for node in ET.fromstring(archive.read("xl/sharedStrings.xml")).findall("m:si", NS)]
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        relationships = {r.attrib["Id"]: r.attrib["Target"] for r in ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))}
        sheet = next(s for s in workbook.find("m:sheets", NS) if s.attrib["name"] == "Directory")
        target = relationships[sheet.attrib[REL]]
        target = target.lstrip("/") if target.startswith("/") else posixpath.normpath("xl/" + target)
        root = ET.fromstring(archive.read(target))
        relpath = posixpath.dirname(target) + "/_rels/" + posixpath.basename(target) + ".rels"
        sheet_rels = {r.attrib["Id"]: r.attrib["Target"] for r in ET.fromstring(archive.read(relpath))} if relpath in archive.namelist() else {}
        hyperlinks = {h.attrib["ref"]: sheet_rels.get(h.attrib.get(REL), "") for h in root.findall("m:hyperlinks/m:hyperlink", NS)}
        rows = {}
        for row in root.findall("m:sheetData/m:row", NS):
            values = {}
            for cell in row.findall("m:c", NS):
                value_node = cell.find("m:v", NS)
                value = value_node.text or "" if value_node is not None else ""
                if cell.attrib.get("t") == "s":
                    value = shared[int(value)]
                elif cell.attrib.get("t") == "inlineStr":
                    value = "".join(cell.find("m:is", NS).itertext())
                values[re.sub(r"\d", "", cell.attrib["r"])] = value
            rows[int(row.attrib["r"])] = values

        headers = rows[5]
        records = []
        for number, values in rows.items():
            if number <= 5 or not values.get("A", "").strip():
                continue
            source_fields = {header: values.get(col, "") for col, header in headers.items() if header}
            source_links = {headers[col]: hyperlinks[f"{col}{number}"] for col in headers if hyperlinks.get(f"{col}{number}")}
            source_fields["Source hyperlinks"] = source_links

            def link(col: str) -> str:
                raw = hyperlinks.get(f"{col}{number}", "") or values.get(col, "")
                return raw.strip() if raw.strip().startswith(("https://", "http://")) else ""

            records.append({
                "id": values.get("S", ""),
                "name": values.get("A", ""),
                "arabicName": values.get("T", ""),
                "sector": values.get("Q", ""),
                "location": values.get("D", ""),
                "type": values.get("B", ""),
                "sourceRole": values.get("J", ""),
                "website": link("G"),
                "careersUrl": link("H"),
                "applyUrl": link("I"),
                "linkedinUrl": link("F"),
                "email": "",
                "routeStatus": values.get("N", ""),
                "checkedAt": values.get("R", ""),
                "sourceFields": source_fields,
            })
        ids = [r["id"] for r in records]
        if len(records) != 772 or len(set(ids)) != 772 or not all(ids):
            raise ValueError("Expected the supplied snapshot to contain 772 unique source IDs")
        return {
            "source": {"filename": path.name, "sheet": "Directory", "headerRow": 5, "recordCount": len(records), "snapshotDate": "2026-11-10"},
            "records": records,
        }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    data = extract(args.input)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"records": len(data["records"]), "output": str(args.output)}))
