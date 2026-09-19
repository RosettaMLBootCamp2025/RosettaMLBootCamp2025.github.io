#!/usr/bin/env python3
"""Compare current validation/probe costs with a Git baseline (default: HEAD).

Run after `quarto render`. Filesystem measurements use the same current site for
both implementations. Preflight timing simulates six 50 ms commands; it does not
measure installed tools or contact the network. Timings are local medians.
"""

import argparse
import gzip
import json
import statistics
import subprocess
import sys
import time
import types
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]


def load_script(name, filename, baseline=None):
    path = ROOT / "scripts" / filename
    source = subprocess.check_output(
        ["git", "show", f"{baseline}:scripts/{filename}"], cwd=ROOT, text=True
    ) if baseline else path.read_text()
    module = types.ModuleType(name)
    module.__file__ = str(path)
    sys.modules[name] = module
    exec(compile(source, str(path), "exec"), module.__dict__)
    return module


def median_seconds(operation, repeats):
    times = []
    for _ in range(repeats):
        start = time.perf_counter()
        operation()
        times.append(time.perf_counter() - start)
    return statistics.median(times)


def measure(baseline=None):
    name = "baseline" if baseline else "current"
    checker = load_script(f"checker_{name}", "check_rendered_site.py", baseline)
    counts = {"resolve": 0, "exists": 0, "is_dir": 0}
    originals = {key: getattr(Path, key) for key in counts}

    def counted(key):
        def call(path, *args, **kwargs):
            counts[key] += 1
            return originals[key](path, *args, **kwargs)
        return call

    with patch.object(Path, "resolve", counted("resolve")), patch.object(Path, "exists", counted("exists")), patch.object(Path, "is_dir", counted("is_dir")):
        issues = checker.check_site(ROOT / "_site")
    if issues:
        raise RuntimeError("Rendered site must pass validation before benchmarking: " + "; ".join(issues))
    result = {
        "filesystem_calls": counts,
        "validation_median_seconds": median_seconds(lambda: checker.check_site(ROOT / "_site"), 7),
    }
    preflight = load_script(f"preflight_{name}", "preflight.py", baseline)

    def simulated_version(command, *args):
        time.sleep(0.05)
        return command + " version"

    with patch.object(preflight, "command_version", simulated_version), patch.object(preflight.shutil, "which", lambda name: name):
        result["simulated_preflight_median_seconds"] = median_seconds(lambda: preflight.run_checks(None, False), 5)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline", default="HEAD", help="Git ref containing the original implementations")
    args = parser.parse_args()
    results = {"baseline_ref": args.baseline, "before": measure(args.baseline), "after": measure()}
    paths = sorted((ROOT / "_site").rglob("*.html"))
    results["html_pages"] = len(paths)
    for variant in ("before", "after"):
        documents = [
            subprocess.check_output(["git", "show", f"{args.baseline}:{path.relative_to(ROOT).as_posix()}"], cwd=ROOT)
            if variant == "before" else path.read_bytes()
            for path in paths
        ]
        results[variant]["html_bytes"] = sum(map(len, documents))
        results[variant]["html_gzip_bytes"] = sum(len(gzip.compress(document)) for document in documents)
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
