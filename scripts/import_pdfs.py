"""Build the website course index from all planning-book PDFs in ../pdfs.

Run from the repository root with:
    python3 scripts/import_pdfs.py

The source PDFs remain local; only the extracted structured course index is
written to data.json and data.js for GitHub Pages to use.
"""

import argparse
import json
import re
from pathlib import Path

import pdfplumber

REPO_ROOT = Path(__file__).resolve().parents[1]
PDF_ROOT = REPO_ROOT / "pdfs"
JSON_OUTPUT = REPO_ROOT / "data.json"
JS_OUTPUT = REPO_ROOT / "data.js"
CATEGORIES = ("基礎", "核心", "應用")
COURSE_CODE = re.compile(r"(?:\b\d{8}\b|\b[A-Z]{1,3}\d{5,8}\b)")


def is_course_title_candidate(cell: str):
    if not cell:
        return False
    text = cell.strip()
    if not text or text in {"", "課程", "類別", "必", "選", "必/選", "上", "下", "上下", "一般通識組", "全英語", "備註"}:
        return False
    if normalize_category_label(text) is not None:
        return False
    if re.fullmatch(r"\d+(?:\.\d+)?", text):
        return False
    if "學分" in text or "開課單位" in text or "科目名稱" in text or "課號" in text:
        return False
    return True


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
    banned = ("課程屬性", "科目名稱", "課號", "開課單位", "選別", "學分", "備註", "課程規劃表")
    return "" if not value or any(word in value for word in banned) else value


def normalize_digital_course_name(course_name: str, cells) -> str:
    text = (course_name or "").strip()
    if not text or "數位自學" not in text:
        return text

    if text in {"數位自學", "跨領域數位自學", "通識數位自學"}:
        for cell in cells:
            cleaned = clean_course_name(cell)
            if not cleaned or cleaned in {"數位自學", "跨領域數位自學", "通識數位自學"}:
                continue
            if re.fullmatch(r"[A-Z][A-Za-z0-9 .-]+", cleaned):
                continue
            if any(part in cleaned for part in ["大學", "University", "College", "Institute", "校", "中心", "學院"]):
                continue
            return f"數位自學-{cleaned}"
        return text

    return text.replace("跨領域數位自學", "數位自學").replace("通識數位自學", "數位自學")


def normalize_category_label(cell: str):
    if not cell:
        return None
    text = cell.replace("\n", " ").strip()
    if not text:
        return None
    normalized = text.replace("課程", "").strip()
    if normalized in CATEGORIES:
        return normalized
    for category in CATEGORIES:
        if category in text:
            return category
    return None


def extract_courses(path: Path):
    """Read PDF table cells and keep only valid course rows."""
    courses = []
    seen = set()
    in_course_table = False
    current_category = None
    header_index = None

    def add_course(category_name, course_name, credit_value):
        course_name = normalize_digital_course_name(clean_course_name(course_name), cells)
        if not course_name or category_name not in CATEGORIES:
            return
        if course_name in {"上下", "上", "下", "課程", "類別", "必", "選", "必/選", "一般通識組", "全英語", "備註"}:
            return
        key = (category_name, course_name)
        if key in seen:
            return
        seen.add(key)
        record = {"category": category_name, "name": course_name}
        if credit_value is not None:
            record["credit"] = credit_value
        courses.append(record)

    try:
        with pdfplumber.open(path) as pdf:
            for page in pdf.pages:
                for table in page.extract_tables():
                    for row in table:
                        cells = [re.sub(r"\s+", " ", (cell or "").replace("\n", " ").strip()) for cell in row]
                        if not any(cell for cell in cells):
                            continue

                        if any("科目名稱" in cell or "課程屬性" in cell or "課號" in cell for cell in cells):
                            in_course_table = True
                            current_category = None
                            header_index = next((i for i, cell in enumerate(cells) if "科目名稱" in (cell or "")), None)
                            continue

                        if not in_course_table:
                            continue

                        row_category = next((normalize_category_label(cell) for cell in cells if normalize_category_label(cell)), None)
                        if row_category:
                            current_category = row_category

                        if current_category is None:
                            continue

                        if header_index is not None and header_index < len(cells):
                            course_name = cells[header_index]
                        else:
                            code_positions = [
                                i for i, cell in enumerate(cells)
                                if re.search(r"\b(?:[A-Z]{1,3}\d{5,8}|\d{8})\b", cell)
                                or COURSE_CODE.fullmatch(cell or "")
                            ]
                            digital_positions = [i for i, cell in enumerate(cells) if "數位自學" in (cell or "")]
                            title_positions = [i for i, cell in enumerate(cells) if is_course_title_candidate(cell)]

                            if not code_positions and not digital_positions and not title_positions:
                                continue

                            earliest_index = min(code_positions + digital_positions + title_positions)
                            course_name = None

                            if any("數位自學" in (cell or "") for cell in cells):
                                title_candidates = []
                                for i, cell in enumerate(cells):
                                    cleaned = clean_course_name(cell)
                                    if is_course_title_candidate(cleaned) and cleaned not in {"數位自學", "跨領域數位自學", "通識數位自學"}:
                                        title_candidates.append(cleaned)
                                if title_candidates:
                                    course_name = f"數位自學-{title_candidates[0]}"
                                else:
                                    for i in range(earliest_index - 1, -1, -1):
                                        cell = cells[i]
                                        if is_course_title_candidate(cell):
                                            course_name = cell
                                            break
                                    if course_name is None:
                                        for i in range(earliest_index + 1, min(len(cells), earliest_index + 5)):
                                            cell = cells[i]
                                            if is_course_title_candidate(cell):
                                                course_name = f"數位自學-{cell}"
                                                break
                                    if course_name is None:
                                        for i, cell in enumerate(cells):
                                            if "數位自學" in (cell or ""):
                                                candidate = cell.strip()
                                                if candidate and candidate != "數位自學":
                                                    course_name = candidate
                                                    break

                            if course_name is None:
                                for i in range(earliest_index - 1, -1, -1):
                                    cell = cells[i]
                                    if is_course_title_candidate(cell):
                                        course_name = cell
                                        break

                            if course_name is None:
                                for i, cell in enumerate(cells):
                                    if is_course_title_candidate(cell):
                                        course_name = cell
                                        break

                            if course_name is None:
                                continue

                        if not is_course_title_candidate(course_name):
                            for cell in cells:
                                if is_course_title_candidate(cell):
                                    course_name = cell
                                    break

                        if not is_course_title_candidate(course_name):
                            continue

                        credit_value = None
                        credit_index = None
                        for i, cell in enumerate(cells):
                            if "學分" in (cell or ""):
                                credit_index = i
                                break
                        if credit_index is not None:
                            for i in range(credit_index + 1, len(cells)):
                                cell = cells[i]
                                if re.fullmatch(r"\d+(?:\.\d+)?", cell):
                                    credit_value = int(float(cell)) if float(cell).is_integer() else float(cell)
                                    break

                        if credit_value is None:
                            for cell in cells:
                                if re.fullmatch(r"\d+(?:\.\d+)?", cell):
                                    credit_value = int(float(cell)) if float(cell).is_integer() else float(cell)
                                    break

                        add_course(current_category, course_name, credit_value)
    except Exception as error:
        print(f"Could not read {path}: {error}")

    return courses


def extract_requirement_text(path: Path) -> dict:
    try:
        with pdfplumber.open(path) as pdf:
            text = "\n".join((page.extract_text() or "") for page in pdf.pages)
    except Exception:
        return {
            "totalCredits": None,
            "minCoursesPerCategory": {"基礎": 1, "核心": 1, "應用": 1},
            "perCategoryCredits": {"基礎": None, "核心": None, "應用": None},
            "note": "無法讀取 PDF 內容",
        }

    total_credits = None
    for pattern in [
        r"本(?:學程|微學程)[^\d]{0,30}?需修習\s*(\d+)\s*學分",
        r"至少應修畢學分數\s*[:：]?\s*(\d+)\s*學分",
        r"修滿\s*(\d+)\s*學分",
    ]:
        match = re.search(pattern, text)
        if match:
            total_credits = int(match.group(1))
            break

    min_courses = {category: 1 for category in CATEGORIES}
    for category in CATEGORIES:
        patterns = [
            rf"{category}[^\n]{{0,120}}(?:至少|各至少|各需至少|各需|至少選修|至少修習|各需選修)[^\d\n]*(\d+)\s*門",
            rf"{category}[^\n]{{0,120}}(?:至少|各至少|各需至少|各需|至少選修|至少修習|各需選修)[^\d\n]*(\d+)\s*學分",
        ]
        for pattern in patterns:
            match = re.search(pattern, text)
            if match:
                min_courses[category] = int(match.group(1))
                break

    per_category_credits = {category: None for category in CATEGORIES}
    shared_credit_patterns = [
        r"(?:基礎、核心、應用|基礎與核心及應用)[^\n]{0,120}(?:至少各修習|至少必修|各需修習|各至少修習|至少修習|至少選修)[^\d\n]*(\d+)\s*學分",
        r"(?:核心、應用|應用、核心)[^\n]{0,120}(?:各需修習|各至少修習|至少修習|至少選修)[^\d\n]*(\d+)\s*學分",
    ]
    for pattern in shared_credit_patterns:
        match = re.search(pattern, text)
        if match:
            value = int(match.group(1))
            for category in CATEGORIES:
                per_category_credits[category] = value
            break

    for category in CATEGORIES:
        if per_category_credits[category] is not None:
            continue
        patterns = [
            rf"{category}[^\n]{{0,120}}(?:至少各修習|至少必修|各需修習|至少修習|各至少修習|至少選修|各需選修|必修)[^\d\n]*(\d+)\s*學分",
            rf"{category}[^\n]{{0,120}}(?:至少|各至少|各需至少|各需|至少選修|至少修習|各需選修)[^\d\n]*(\d+)\s*門",
        ]
        for pattern in patterns:
            match = re.search(pattern, text)
            if match:
                per_category_credits[category] = int(match.group(1))
                break

    note = None
    for pattern in [
        r"本(?:學程|微學程)[^\n]{0,80}需修習\s*\d+\s*學分.*",
        r"至少應修畢學分數\s*[:：]?\s*\d+\s*學分.*",
    ]:
        match = re.search(pattern, text)
        if match:
            note = match.group(0).strip()
            break

    return {
        "totalCredits": total_credits,
        "minCoursesPerCategory": min_courses,
        "perCategoryCredits": per_category_credits,
        "note": note,
    }


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
            "requirements": extract_requirement_text(path),
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
