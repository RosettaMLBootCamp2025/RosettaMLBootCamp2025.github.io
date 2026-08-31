#!/usr/bin/env python3
"""Run a read-only readiness check for the bootcamp compute environment."""

from __future__ import annotations

import argparse
import json
import platform
import shutil
import subprocess
import sys
import urllib.request
from dataclasses import asdict, dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TOOLS_FILE = ROOT / "data" / "tools.yml"


@dataclass
class Check:
    name: str
    status: str
    detail: str
    action: str = ""


def command_version(command: str, *args: str) -> str | None:
    executable = shutil.which(command)
    if not executable:
        return None
    try:
        completed = subprocess.run(
            [executable, *args],
            capture_output=True,
            text=True,
            timeout=8,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return "present, but version check failed"
    output = (completed.stdout or completed.stderr).strip().splitlines()
    return output[0] if output else f"present at {executable}"


def tool_record(tool_id: str | None) -> dict | None:
    if not tool_id:
        return None
    data = json.loads(TOOLS_FILE.read_text(encoding="utf-8"))
    return next((tool for tool in data["tools"] if tool["id"] == tool_id), None)


def run_checks(tool: dict | None, check_network: bool) -> list[Check]:
    checks: list[Check] = []
    python_ok = sys.version_info >= (3, 9)
    checks.append(
        Check(
            "Python",
            "PASS" if python_ok else "WARN",
            f"{platform.python_implementation()} {platform.python_version()}",
            "Install Python 3.9+; use the lesson-specific version for each isolated environment." if not python_ok else "",
        )
    )

    git_version = command_version("git", "--version")
    checks.append(Check("Git", "PASS" if git_version else "WARN", git_version or "not found", "Install Git before cloning pinned tools." if not git_version else ""))

    manager = next(((name, command_version(name, "--version")) for name in ("mamba", "micromamba", "conda") if shutil.which(name)), None)
    checks.append(
        Check(
            "Environment manager",
            "PASS" if manager else "WARN",
            f"{manager[0]}: {manager[1]}" if manager else "mamba, micromamba, and conda not found",
            "Complete Pre-work 1 before installing model-specific environments." if not manager else "",
        )
    )

    downloader = next(((name, command_version(name, "--version")) for name in ("curl", "wget") if shutil.which(name)), None)
    checks.append(Check("Downloader", "PASS" if downloader else "WARN", f"{downloader[0]}: {downloader[1]}" if downloader else "curl and wget not found", "Install curl or wget for weights and example data." if not downloader else ""))

    gpu_version = command_version("nvidia-smi", "--query-gpu=name,driver_version,memory.total", "--format=csv,noheader")
    gpu_required = bool(tool and ("GPU" in tool.get("accelerator", "") or "CUDA" in tool.get("accelerator", "")))
    checks.append(
        Check(
            "NVIDIA GPU",
            "PASS" if gpu_version else ("WARN" if gpu_required else "INFO"),
            gpu_version or "not visible in this shell",
            "Request a GPU node, or use the lesson's provided-output pathway." if gpu_required and not gpu_version else "",
        )
    )

    nvcc_version = command_version("nvcc", "--version")
    checks.append(Check("CUDA toolkit", "PASS" if nvcc_version else "INFO", nvcc_version or "nvcc not visible; containerized tools may not need it on PATH"))

    container = next(((name, command_version(name, "--version")) for name in ("apptainer", "singularity", "docker") if shutil.which(name)), None)
    container_required = bool(tool and "Apptainer" in tool.get("accelerator", ""))
    checks.append(
        Check(
            "Container runtime",
            "PASS" if container else ("WARN" if container_required else "INFO"),
            f"{container[0]}: {container[1]}" if container else "Apptainer, Singularity, and Docker not found",
            "Ask the cluster administrator for Apptainer/Singularity, or use provided outputs." if container_required and not container else "",
        )
    )

    free_gib = shutil.disk_usage(Path.cwd()).free / (1024**3)
    disk_status = "PASS" if free_gib >= 20 else "WARN"
    checks.append(Check("Free disk", disk_status, f"{free_gib:.1f} GiB available at {Path.cwd()}", "Use scratch storage; several model weights require 10–20 GiB and OpenFold databases require much more." if disk_status == "WARN" else ""))

    if tool:
        checks.append(Check("Course pin", "INFO", f"{tool['name']}: {tool['pin']}", "Use the exact lesson command; do not substitute the upstream default branch."))
        smoke = tool.get("last_full_smoke_test")
        checks.append(
            Check(
                "Maintainer smoke test",
                "PASS" if smoke else "INFO",
                smoke or "not recorded for the complete GPU workflow",
                "Run the lesson smoke test before committing a long job and save the result with your environment export.",
            )
        )

    if check_network:
        url = tool["source"] if tool else "https://github.com/RosettaMLBootCamp2025/RosettaMLBootCamp2025.github.io"
        try:
            request = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "bootcamp-preflight/1"})
            with urllib.request.urlopen(request, timeout=8) as response:
                detail = f"HTTP {response.status}: {url}"
            checks.append(Check("Network", "PASS", detail))
        except Exception as exc:  # Network failures differ across Python/platform versions.
            checks.append(Check("Network", "WARN", f"Could not reach {url}: {exc}", "Download code and weights on a networked login node, then transfer them to compute storage."))
    return checks


def parse_args() -> argparse.Namespace:
    tool_ids: list[str] = []
    if TOOLS_FILE.is_file():
        tool_ids = [tool["id"] for tool in json.loads(TOOLS_FILE.read_text(encoding="utf-8"))["tools"]]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tool", choices=tool_ids, help="apply tool-specific GPU/container expectations")
    parser.add_argument("--check-network", action="store_true", help="perform one read-only network request")
    parser.add_argument("--json", action="store_true", help="emit machine-readable JSON")
    parser.add_argument("--output", type=Path, help="also save the report to this file")
    parser.add_argument("--strict", action="store_true", help="exit nonzero when any WARN is present")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    selected = tool_record(args.tool)
    checks = run_checks(selected, args.check_network)
    report = {
        "schema_version": 1,
        "platform": platform.platform(),
        "working_directory": str(Path.cwd()),
        "selected_tool": args.tool,
        "checks": [asdict(check) for check in checks],
    }
    if args.json:
        rendered = json.dumps(report, indent=2) + "\n"
    else:
        width = max(len(check.name) for check in checks)
        lines = ["Bootcamp environment preflight", "=" * 30]
        for check in checks:
            lines.append(f"[{check.status:<4}] {check.name:<{width}}  {check.detail}")
            if check.action:
                lines.append(f"       Action: {check.action}")
        lines.append("\nWARN means choose the documented fallback or resolve the issue before a long compute job.")
        rendered = "\n".join(lines) + "\n"
    print(rendered, end="")
    if args.output:
        args.output.write_text(rendered, encoding="utf-8")
    return 1 if args.strict and any(check.status == "WARN" for check in checks) else 0


if __name__ == "__main__":
    raise SystemExit(main())
