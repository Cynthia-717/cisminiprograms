import os
import re
import json
from pathlib import Path
from collections import defaultdict

ROOT = Path(r"C:\Users\user\Downloads\系統")
OUTPUT = Path(r"C:\Users\user\Desktop\微學程查詢系統\data.json")


def normalize(text: str) -> str:
    return re.sub(r"\s+", "", text).lower()


def infer_type(path: Path) -> str:
    parts = [p.lower() for p in path.parts]
    if "學分學程" in parts:
        return "學分學程"
    if "微學程" in parts:
        return "微學程"
    return "微學程"


def infer_domain(path: Path) -> str:
    parts = [p.lower() for p in path.parts]
    mapping = {
        "人工智慧": "人工智慧領域",
        "創新創業": "創新創業領域",
        "新媒體": "新媒體領域",
        "永續發展": "永續發展領域",
        "人工智慧領域": "人工智慧領域",
        "創新創業領域": "創新創業領域",
        "新媒體領域": "新媒體領域",
        "永續發展領域": "永續發展領域",
    }
    for part in parts:
        if part in mapping:
            return mapping[part]
    return "未分類"


def infer_year(path: Path):
    text = path.name + " " + str(path.parent)
    matches = re.findall(r"(\d{3})", text)
    if matches:
        return int(matches[0])
    return None


def infer_semester(path: Path) -> str:
    name = path.name
    if "第1學期" in name or "1111" in name or "1121" in name or "1131" in name or "1141" in name:
        return "第一學期"
    if "第2學期" in name or "1112" in name or "1122" in name or "1132" in name or "1142" in name:
        return "第二學期"
    if "1141" in name and "1142" not in name:
        return "第一學期"
    return "未指定"


def infer_program_name(path: Path) -> str:
    name = path.name
    # Remove file extension and common suffixes
    name = name.replace('.pdf', '')
    name = name.replace('「', '').replace('」', '')
    name = name.replace('（', '(').replace('）', ')')
    name = re.sub(r'[-–—].*$', '', name)
    name = re.sub(r'\s*\(.*\)$', '', name)
    return name.strip()


def collect_pdfs(root: Path):
    return [p for p in root.rglob('*.pdf') if p.is_file() and not p.name.startswith('.') and '._' not in p.name]


pdfs = collect_pdfs(ROOT)
records = []

for path in pdfs:
    program_name = infer_program_name(path)
    domain = infer_domain(path)
    year = infer_year(path)
    semester = infer_semester(path)
    ptype = infer_type(path)
    records.append({
        "programName": program_name,
        "domain": domain,
        "year": year,
        "semester": semester,
        "type": ptype,
        "sourcePath": str(path),
        "courses": []
    })

# Deduplicate by programName + year + domain
seen = set()
unique = []
for r in records:
    key = (r["programName"], r["domain"], r["year"], r["semester"])
    if key in seen:
        continue
    seen.add(key)
    unique.append(r)

OUTPUT.write_text(json.dumps(unique, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'exported {len(unique)} records to {OUTPUT}')
