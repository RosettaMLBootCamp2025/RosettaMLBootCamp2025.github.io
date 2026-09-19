#!/usr/bin/env python3
"""Regression checks for validation caching and bounded preflight probes."""

import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch

import check_rendered_site
import preflight


class RenderedSiteTests(unittest.TestCase):
    def test_cached_references_preserve_diagnostics_and_refresh_between_runs(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            (root / "folder").mkdir()
            (root / "folder" / "index.html").write_text('<h1 id="heading">Title</h1>')
            (root / "other page.html").write_text('<h1 id="with space">Title</h1>')
            (root / "index.html").write_text('''
                <h1 id="home">Home</h1>
                <a href="#home">Same page</a>
                <a href="folder/?q=1#heading">Directory</a>
                <a href="other%20page.html#with%20space">Encoded</a>
                <a href="folder/index.html#missing">Bad fragment</a>
                <a href="absent.html">Missing</a>
                <a href="absent.html">Missing twice</a>
                <a href="../outside.html">Outside</a>
            ''')
            original = Path.exists
            calls = []

            def counted(path):
                calls.append(path)
                return original(path)

            with patch.object(Path, "exists", counted):
                issues = check_rendered_site.check_site(root)
            self.assertEqual(len(issues), 4, issues)
            self.assertEqual(sum("missing fragment" in issue for issue in issues), 1)
            self.assertEqual(sum("missing local" in issue for issue in issues), 2)
            self.assertEqual(sum("escapes" in issue for issue in issues), 1)
            self.assertEqual(calls.count(root / "absent.html"), 1)
            (root / "absent.html").write_text("Now present")
            self.assertEqual(len(check_rendered_site.check_site(root)), 2)

    def test_symlink_cannot_escape_site(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            root = base / "site"
            root.mkdir()
            (base / "outside.txt").write_text("outside")
            (root / "alias.txt").symlink_to(base / "outside.txt")
            (root / "index.html").write_text('<a href="alias.txt">Outside</a>')
            self.assertIn("escapes", check_rendered_site.check_site(root)[0])


class PreflightTests(unittest.TestCase):
    def test_probes_overlap_with_bounded_fanout_and_stable_report(self):
        lock = threading.Lock()
        active = 0
        peak = 0
        commands = []

        def version(command, *args):
            nonlocal active, peak
            with lock:
                active += 1
                peak = max(peak, active)
                commands.append(command)
            try:
                time.sleep(0.02)
                return command + " version"
            finally:
                with lock:
                    active -= 1

        with patch.object(preflight, "command_version", version), patch.object(preflight.shutil, "which", lambda name: name):
            checks = preflight.run_checks(None, False)
        self.assertGreater(peak, 1)
        self.assertLessEqual(peak, 4)
        self.assertEqual(active, 0)
        self.assertCountEqual(commands, ["git", "mamba", "curl", "nvidia-smi", "nvcc", "apptainer"])
        self.assertEqual([check.name for check in checks], [
            "Python", "Git", "Environment manager", "Downloader", "NVIDIA GPU",
            "CUDA toolkit", "Container runtime", "Free disk",
        ])
        self.assertEqual(checks[2].detail, "mamba: mamba version")
        self.assertEqual(checks[3].detail, "curl: curl version")
        self.assertEqual(checks[6].detail, "apptainer: apptainer version")


if __name__ == "__main__":
    unittest.main()
