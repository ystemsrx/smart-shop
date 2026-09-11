import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("images", Path(__file__).with_name("ci-images.py"))
images = importlib.util.module_from_spec(spec)
spec.loader.exec_module(images)


class ChangedImages(unittest.TestCase):
    def test_dispatch_rebuilds_all(self):
        self.assertTrue(all(images.choose(None).values()))

    def test_docs_do_not_publish(self):
        self.assertFalse(any(images.choose(["README.md"]).values()))

    def test_workflow_change_rebuilds_all(self):
        self.assertTrue(all(images.choose([".github/workflows/publish.yml"]).values()))

    def test_backend_only(self):
        self.assertEqual(images.choose(["backend/app/deleted.py"]), {"backend": True, "frontend": False})

    def test_deleted_frontend_path(self):
        self.assertEqual(images.choose(["deleted-root-config.js"]), {"backend": False, "frontend": True})

    def test_frontend_dockerfile(self):
        self.assertEqual(images.choose(["docker/Dockerfile.frontend"]), {"backend": False, "frontend": True})

    def test_entrypoint(self):
        self.assertEqual(images.choose(["docker/backend-entrypoint.sh"]), {"backend": True, "frontend": False})


if __name__ == "__main__":
    unittest.main()
