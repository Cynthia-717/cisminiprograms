import tempfile
import unittest
from pathlib import Path

from openpyxl import Workbook

from scripts.import_pdfs import extract_courses_from_excel, infer_domain


class ExcelImportTests(unittest.TestCase):
    def test_extract_courses_from_excel_second_sheet(self):
        wb = Workbook()
        ws1 = wb.active
        ws1.title = "第一張工作表"
        ws1["A1"] = "ignore"

        ws2 = wb.create_sheet("課程規劃表")
        ws2.append(["類別", "科目名稱", "學分"])
        ws2.append(["基礎", "資料結構", 2])
        ws2.append(["核心", "機器學習", 3])
        ws2.append(["應用", "AI 專題", 2])

        tmp_dir = Path(tempfile.gettempdir()) / "microprogram-test"
        tmp_dir.mkdir(exist_ok=True)
        path = tmp_dir / "人工智慧微學程 1142.xlsx"
        wb.save(path)

        courses = extract_courses_from_excel(path)

        self.assertEqual(
            [course["name"] for course in courses],
            ["資料結構", "機器學習", "AI專題"],
        )
        self.assertEqual(
            [course["category"] for course in courses],
            ["基礎", "核心", "應用"],
        )

    def test_infer_domain_from_microprogram_folder_name(self):
        self.assertEqual(
            infer_domain(Path("excels/微學程清單/自主學習微學程/自主學習微學程1151.xls")),
            "未分類",
        )
        self.assertEqual(
            infer_domain(Path("excels/微學程清單/人工智慧微學程/人工智慧微學程1151.xls")),
            "人工智慧領域",
        )
        self.assertEqual(
            infer_domain(Path("excels/微學程清單/氣候變遷、綠能永續與健康微學程/氣候變遷、綠能永續與健康微學程1151.xls")),
            "永續發展領域",
        )


if __name__ == "__main__":
    unittest.main()
