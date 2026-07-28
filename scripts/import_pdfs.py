"""Build the website course index from all planning-book PDFs in ../pdfs.

Run from the repository root with:
    python3 scripts/import_pdfs.py

The source PDFs remain local; only the extracted structured course index is
written to data.json and data.js for GitHub Pages to use.
"""

import json
import re
import argparse
from pathlib import Path

import pdfplumber

REPO_ROOT = Path(__file__).resolve().parents[1]
PDF_ROOT = REPO_ROOT / "pdfs"
JSON_OUTPUT = REPO_ROOT / "data.json"
JS_OUTPUT = REPO_ROOT / "data.js"
CATEGORIES = ("基礎", "核心", "應用")
COURSE_CODE = re.compile(r"(?:\b\d{8}\b|\b[A-Z]{1,3}\d{5,8}\b|數位自學)")


def infer_domain(path: Path) -> str:
    mapping = {
        "人工智慧": "人工智慧領域", "人工智慧領域": "人工智慧領域",
        "創新創業": "創新創業領域", "創新創業領域": "創新創業領域",
        "新媒體": "新媒體領域", "新媒體領域": "新媒體領域",
        "永續發展": "永續發展領域", "永續發展領域": "永續發展領域",
    }
    return next((mapping[part] for part in path.parts if part in mapping), "未分類")


def infer_type(path: Path) -> str:
    return "學分學程" if "學分學程" in path.parts else "微學程"


def infer_year(path: Path):
    match = re.search(r"(?<!\d)(\d{3})(?:[12](?!\d))?", path.name)
    return int(match.group(1)) if match else None


def infer_semester(path: Path) -> str:
    match = re.search(r"(?<!\d)\d{3}([12])(?!\d)", path.name)
    return {"1": "第一學期", "2": "第二學期"}.get(match.group(1), "未指定") if match else "未指定"


def infer_program_name(path: Path) -> str:
    name = path.stem.replace("「", "").replace("」", "")
    name = re.sub(r"[-_－].*$", "", name)
    return name.strip()


def clean_course_name(value: str) -> str:
    value = re.sub(r"\s+", "", value)
    value = re.sub(r"^(?:基礎|核心|應用)", "", value)
    value = value.strip("-－–—：:、。 ")
    # These are table headings or administrative text, not course names.
    banned = ("課程屬性", "科目名稱", "課號", "開課單位", "選別", "學分", "備註", "課程規劃表")
    return "" if not value or any(word in value for word in banned) else value


def extract_courses(path: Path):
    """Read PDF table cells, preserving the course-name column boundaries."""
    courses, seen, category, pending = [], set(), None, None

    def save_pending():
        nonlocal pending
        if not pending:
            return
        category_name, course_name = pending
        course_name = clean_course_name(course_name)
        if len(course_name) >= 2 and (category_name, course_name) not in seen:
            seen.add((category_name, course_name))
            courses.append({"category": category_name, "name": course_name})
        pending = None

    try:
        with pdfplumber.open(path) as pdf:
            for page in pdf.pages:
                for table in page.extract_tables():
                    for row in table:
                        cells = [(cell or "").replace("\n", "").strip() for cell in row]
                        category_cell = next((cell for cell in cells if cell in CATEGORIES), None)
                        if category_cell:
                            category = category_cell
                        code_index = next((i for i, cell in enumerate(cells) if COURSE_CODE.fullmatch(cell)), None)
                        if category not in CATEGORIES or code_index is None or code_index == 0:
                            continue
                        save_pending()
                        prefix = cells[code_index] if cells[code_index] == "數位自學" else ""
                        name = (prefix + " " + cells[code_index - 1]).strip()
                        pending = (category, name)
    except Exception as error:
        print(f"Could not read {path}: {error}")

    save_pending()
    return courses


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--start", type=int, default=0)
    parser.add_argument("--end", type=int)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if not PDF_ROOT.is_dir():
        raise SystemExit(f"PDF folder not found: {PDF_ROOT}")

    paths = [path for path in sorted(PDF_ROOT.rglob("*.pdf")) if not path.name.startswith("._")]
    records = []
    for path in paths[args.start:args.end]:
        records.append({
            "programName": infer_program_name(path),
            "domain": infer_domain(path),
            "year": infer_year(path),
            "semester": infer_semester(path),
            "type": infer_type(path),
            "sourcePath": str(path.relative_to(REPO_ROOT)),
            "courses": extract_courses(path),
        })

    output = args.output or JSON_OUTPUT
    output.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")
    if not args.output:
        JS_OUTPUT.write_text(
            "window.microProgramsDataSeed = " + json.dumps(records, ensure_ascii=False) + ";\n",
            encoding="utf-8",
        )
    total_courses = sum(len(record["courses"]) for record in records)
    print(f"Exported {len(records)} PDFs and {total_courses} extracted course rows to {output}.")


if __name__ == "__main__":
    main()
