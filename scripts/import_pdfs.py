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
from openpyxl import load_workbook
import xlrd

REPO_ROOT = Path(__file__).resolve().parents[1]
PDF_ROOT = REPO_ROOT / "excels"
JSON_OUTPUT = REPO_ROOT / "data.json"
JS_OUTPUT = REPO_ROOT / "data.js"
CATEGORIES = ("基礎", "核心", "應用")
COURSE_CODE = re.compile(r"(?:\b\d{8}\b|\b[A-Z]{1,3}\d{5,8}\b)")


def is_course_title_candidate(cell: str):
    if not cell:
        return False
    text = cell.strip()
    if not text or text in {"", "課程", "類別", "必", "選", "必/選", "上", "下", "上下", "一般通識組", "全英語", "備註", "屬性", "學", "分", "開課", "學期"}:
        return False
    if normalize_category_label(text) is not None:
        return False
    if re.fullmatch(r"\d+(?:\.\d+)?", text):
        return False
    if COURSE_CODE.fullmatch(text) or re.search(r"\b(?:[A-Z]{1,3}\d{5,8}|\d{8})\b", text):
        return False
    if text.endswith("領域") or text.endswith("中心") or text.endswith("學院") or text.endswith("大學") or text.endswith("校") or text.endswith("單位") or text.endswith("課程"):
        return False
    if re.match(r"^\d{3,4}(?:前|新|既有|開|變更|後).*", text):
        return False
    if any(keyword in text for keyword in ["開課單位", "開課學期", "科目名稱", "課號", "學分", "備註", "屬性", "既有", "新開", "變更", "前既有", "後既有"]):
        return False
    return True


def infer_domain(path: Path) -> str:
    text = str(path).replace("/", " ")
    if "自主學習" in text:
        return "未分類"

    mapping = {
        "人工智慧": "人工智慧領域",
        "大數據": "人工智慧領域",
        "健康照護物聯網": "人工智慧領域",
        "健康物聯網": "人工智慧領域",
        "程式設計": "人工智慧領域",
        "智慧跨域": "人工智慧領域",
        "智慧生醫": "人工智慧領域",
        "MSD": "人工智慧領域",
        "創業實踐": "創新創業領域",
        "設計思考": "創新創業領域",
        "創新醫療設計": "創新創業領域",
        "智慧新藥": "創新創業領域",
        "精準健康產業": "創新創業領域",
        "精準醫療與用藥": "創新創業領域",
        "解決問題促進健康": "創新創業領域",
        "輔助科技": "創新創業領域",
        "永續健康產業與管理": "永續發展領域",
        "永續科研": "永續發展領域",
        "氣候變遷": "永續發展領域",
        "綠色飲食": "永續發展領域",
        "智齡設計": "永續發展領域",
        "社會處方箋": "永續發展領域",
        "健康產業": "永續發展領域",
        "沉浸科技": "新媒體領域",
        "敘事創作": "新媒體領域",
        "國際影響力": "新媒體領域",
        "數位學習科技": "新媒體領域",
        "資訊傳播": "新媒體領域",
        "資訊安全": "新媒體領域",
        "大健康元宇宙": "新媒體領域",
        "元宇宙": "新媒體領域",
    }
    for keyword, domain in mapping.items():
        if keyword in text:
            return domain
    return "未分類"


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
    name = re.sub(r"\s*(?:[-_－—]\s*)?(?:\d{3,4}[12]|\d{3,4}[12].*?)\s*$", "", name)
    name = re.sub(r"(?:規劃書|微學程規劃書|學分學程規劃書|教務會議.*)$", "", name)
    name = name.strip(" -_－—")
    if not name:
        name = path.stem
    return name.strip()


def clean_course_name(value: str, strip_category: bool = True) -> str:
    value = re.sub(r"\s+", "", value)
    if strip_category:
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


def get_excel_sheet(workbook):
    for sheet in workbook.worksheets:
        if sheet.title.strip() == "課程規劃表":
            return sheet
    if len(workbook.worksheets) > 1:
        return workbook.worksheets[1]
    if workbook.worksheets:
        return workbook.worksheets[0]
    return None


def extract_courses_from_excel(path: Path):
    """Read the second sheet in an Excel workbook and extract course rows."""
    try:
        if path.suffix.lower() in {".xlsx", ".xlsm"}:
            workbook = load_workbook(path, read_only=True, data_only=True)
            sheet = get_excel_sheet(workbook)
            rows = list(sheet.iter_rows(values_only=True)) if sheet else []
        elif path.suffix.lower() == ".xls":
            workbook = xlrd.open_workbook(str(path))
            sheet = workbook.sheet_by_name("課程規劃表") if "課程規劃表" in workbook.sheet_names() else workbook.sheets()[1] if len(workbook.sheets()) > 1 else workbook.sheet_by_index(0)
            rows = [[sheet.cell_value(r, c) for c in range(sheet.ncols)] for r in range(sheet.nrows)]
        else:
            return []
    except Exception as error:
        print(f"Could not read Excel workbook {path}: {error}")
        return []

    if not rows:
        return []

    header_index = None
    for index, row in enumerate(rows):
        values = ["" if value is None else str(value).strip() for value in row]
        normalized = "|".join(values)
        if any(keyword in normalized for keyword in ["科目名稱", "課程名稱", "課程名", "課號", "學分", "類別", "領域名稱", "學程課程"]):
            header_index = index
            break

    if header_index is None:
        return []

    header_cells = ["" if value is None else re.sub(r"\s+", "", str(value)) for value in rows[header_index]]

    def find_column(labels):
        for label in labels:
            for index, cell in enumerate(header_cells):
                if cell == label:
                    return index
        return None

    course_name_index = find_column(("學程課程", "科目名稱", "課程名稱", "課程名"))
    category_index = find_column(("領域名稱", "類別", "課程屬性", "課程類別"))
    credit_index = find_column(("科目學分", "學分"))

    courses = []
    seen = set()
    current_category = None

    for row in rows[header_index + 1:]:
        cells = ["" if value is None else str(value).strip() for value in row]
        if not any(cells):
            continue

        category = None
        if category_index is not None and category_index < len(cells):
            category = normalize_category_label(cells[category_index])
            if category:
                current_category = category
            else:
                category = current_category
        else:
            for cell in cells:
                normalized = normalize_category_label(cell)
                if normalized:
                    category = normalized
                    current_category = normalized
                    break
            if category is None:
                category = current_category

        if category not in CATEGORIES:
            continue

        course_name = None
        numeric_candidates = []
        for index, cell in enumerate(cells):
            if not cell:
                continue
            if re.fullmatch(r"\d+(?:\.\d+)?", cell):
                numeric_candidates.append((index, float(cell)))
        if course_name_index is not None:
            if course_name_index < len(cells):
                course_name = cells[course_name_index]
        else:
            for cell in cells:
                if not cell or any(keyword in cell for keyword in ["類別", "科目名稱", "課程名稱", "課程名", "課號", "學分", "備註", "開課單位", "開課學期", "屬性", "性質", "選別", "領域名稱", "領域應修學分數", "領域備註", "學程課程"]):
                    continue
                if normalize_category_label(cell) is not None or re.fullmatch(r"[A-Z]{1,3}\d{5,8}|\d{8}", cell):
                    continue
                if not re.fullmatch(r"\d+(?:\.\d+)?", cell):
                    course_name = cell
                    break

        if course_name:
            course_name = clean_course_name(course_name, strip_category=course_name_index is None)

        if not course_name:
            continue

        credit_value = None
        if credit_index is not None and credit_index < len(cells):
            credit_text = cells[credit_index]
            if re.fullmatch(r"\d+(?:\.\d+)?", credit_text):
                value = float(credit_text)
                if value <= 10:
                    credit_value = int(value) if value.is_integer() else value
        elif numeric_candidates:
            for _, value in reversed(numeric_candidates):
                if value <= 10:
                    credit_value = int(value) if value.is_integer() else value
                    break

        course_name = normalize_digital_course_name(course_name, cells)
        if not course_name:
            continue

        key = (category, course_name)
        if key in seen:
            continue
        seen.add(key)
        record = {"category": category, "name": course_name}
        if credit_value is not None:
            record["credit"] = credit_value
        courses.append(record)

    return courses


def extract_courses(path: Path):
    """Read PDF table cells and keep only valid course rows."""
    courses = []
    seen = set()
    in_course_table = False
    current_category = None
    subject_index = None
    credit_index = None
    code_index = None

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
                    subject_index = None
                    credit_index = None
                    code_index = None
                    in_course_table = False
                    current_category = None
                    for row in table:
                        cells = [re.sub(r"\s+", " ", (cell or "").replace("\n", " ").strip()) for cell in row]
                        if not any(cell for cell in cells):
                            continue

                        header_hit = any("科目名稱" in (cell or "") or "課程屬性" in (cell or "") or "課號" in (cell or "") or "學分" in (cell or "") for cell in cells)
                        if header_hit:
                            in_course_table = True
                            current_category = None
                            subject_index = next((i for i, cell in enumerate(cells) if "科目名稱" in (cell or "")), None)
                            credit_index = next((i for i, cell in enumerate(cells) if "學分" in (cell or "")), None)
                            code_index = next((i for i, cell in enumerate(cells) if "課號" in (cell or "")), None)
                            continue

                        if not in_course_table:
                            continue

                        row_category = next((normalize_category_label(cell) for cell in cells if normalize_category_label(cell)), None)
                        if row_category:
                            current_category = row_category

                        if current_category is None:
                            continue

                        if subject_index is not None:
                            if subject_index >= len(cells):
                                course_name = None
                            else:
                                course_name = cells[subject_index]
                        else:
                            course_name = None

                        if not course_name or not is_course_title_candidate(course_name):
                            fallback_candidates = []
                            for cell in cells:
                                if cell and is_course_title_candidate(cell):
                                    fallback_candidates.append(cell)
                            if fallback_candidates:
                                course_name = fallback_candidates[0]
                            else:
                                continue

                        if course_name is None:
                            continue

                        credit_value = None
                        if credit_index is not None and credit_index < len(cells):
                            value = cells[credit_index + 1] if credit_index + 1 < len(cells) else cells[credit_index]
                            if re.fullmatch(r"\d+(?:\.\d+)?", value):
                                number = float(value)
                                if number <= 10:
                                    credit_value = int(number) if number.is_integer() else number
                        if credit_value is None:
                            for cell in cells:
                                if re.fullmatch(r"\d+(?:\.\d+)?", cell):
                                    number = float(cell)
                                    if number <= 10:
                                        credit_value = int(number) if number.is_integer() else number
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

    excel_paths = [path for path in sorted(PDF_ROOT.rglob("*.*")) if path.suffix.lower() in {".xlsx", ".xlsm", ".xls"} and not path.name.startswith("._")]
    paths = sorted(excel_paths, key=lambda p: str(p))
    records = []
    for path in paths[args.start:args.end]:
        domain = infer_domain(path)
        if domain == "未分類" and "自主學習" in str(path):
            continue
        courses = extract_courses_from_excel(path)
        requirements = {
            "totalCredits": None,
            "minCoursesPerCategory": {"基礎": 1, "核心": 1, "應用": 1},
            "perCategoryCredits": {"基礎": None, "核心": None, "應用": None},
            "note": "由 Excel 課程規劃表匯入",
        }
        record = {
            "programName": infer_program_name(path),
            "domain": domain,
            "year": infer_year(path),
            "semester": infer_semester(path),
            "type": infer_type(path),
            "sourcePath": str(path.relative_to(REPO_ROOT)),
            "courses": courses,
            "requirements": requirements,
        }
        records.append(record)

    output = args.output or JSON_OUTPUT
    output.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")
    if not args.output:
        JS_OUTPUT.write_text(
            "window.microProgramsDataSeed = " + json.dumps(records, ensure_ascii=False) + ";\n",
            encoding="utf-8",
        )
    total_courses = sum(len(record["courses"]) for record in records)
    print(f"Exported {len(records)} source files and {total_courses} extracted course rows to {output}.")


if __name__ == "__main__":
    main()
