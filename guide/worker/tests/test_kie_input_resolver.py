import unittest

from worker.kie_input_resolver import is_public_http_url


class KieInputResolverTests(unittest.TestCase):
    def test_public_url_detection(self):
        self.assertTrue(is_public_http_url("https://cdn.example.com/a.png"))
        self.assertFalse(is_public_http_url("http://127.0.0.1:8000/uploads/a.png"))
        self.assertFalse(is_public_http_url("/uploads/a.png"))


if __name__ == "__main__":
    unittest.main()