import json
import os
import shutil
import tempfile
import unittest

from worker.brand_fonts import prepare_brand_fonts, resolve_brand_font_path


class TestBrandFonts(unittest.TestCase):
    def test_prepare_brand_fonts_copies_uploads(self):
        with tempfile.TemporaryDirectory() as tmp:
            uploads = os.path.join(tmp, "uploads", "fonts")
            os.makedirs(uploads, exist_ok=True)
            src = os.path.join(uploads, "brand-BiaoXiaoZhiBiaoTiHei.ttf")
            with open(src, "wb") as f:
                f.write(b"\x00\x01\x02\x03")

            work = os.path.join(tmp, "work")
            os.makedirs(work, exist_ok=True)

            import worker.config as cfg

            old = cfg.UPLOADS_DIR
            cfg.UPLOADS_DIR = os.path.join(tmp, "uploads")
            try:
                global_config = {
                    "default_font_family": "BiaoXiaoZhiBiaoTiHei",
                    "brand_pack": {
                        "tokens": {
                            "typography": {
                                "fonts": [
                                    {
                                        "name": "标小智",
                                        "family": "BiaoXiaoZhiBiaoTiHei",
                                        "url": "/uploads/fonts/brand-BiaoXiaoZhiBiaoTiHei.ttf",
                                    }
                                ]
                            }
                        }
                    },
                }
                manifest = prepare_brand_fonts(global_config, work)
                self.assertIn("BiaoXiaoZhiBiaoTiHei", manifest["family_paths"])
                path = resolve_brand_font_path(work, "BiaoXiaoZhiBiaoTiHei")
                self.assertTrue(os.path.exists(path))
                with open(os.path.join(work, "fonts", "manifest.json"), encoding="utf-8") as f:
                    saved = json.load(f)
                self.assertEqual(saved["default_family"], "BiaoXiaoZhiBiaoTiHei")
            finally:
                cfg.UPLOADS_DIR = old


if __name__ == "__main__":
    unittest.main()