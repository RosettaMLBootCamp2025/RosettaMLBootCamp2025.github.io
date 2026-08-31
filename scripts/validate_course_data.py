#!/usr/bin/env python3
"""Validate course manifests and regenerate their checked-in derivatives.

The ``.yml`` files in ``data/`` deliberately use JSON-compatible YAML so this
validator has no third-party dependencies. JSON is a valid subset of YAML 1.2.
"""

from __future__ import annotations

import argparse
import ast
import io
import json
import re
import sys
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
COURSE_FILE = DATA_DIR / "course-manifest.yml"
TARGETS_FILE = DATA_DIR / "targets.yml"
TOOLS_FILE = DATA_DIR / "tools.yml"
COURSE_INCLUDE = ROOT / "_includes" / "course-data.html"
TARGET_TABLE = DATA_DIR / "generated" / "wednesday-target-table.md"
REFRESHER_DIR = ROOT / "monday" / "HW3-python-refresher"
REFRESHER_ZIP = ROOT / "monday" / "files" / "python-refresher.zip"
CPU_GPU_NOTEBOOK = ROOT / "thursday" / "files" / "activity-CPUvsGPU.ipynb"
CAPSTONE_TEMPLATE = ROOT / "capstone" / "files" / "capstone-evidence-template.md"
CAPSTONE_TEMPLATE_ZIP = ROOT / "capstone" / "files" / "capstone-evidence-template.zip"


class Validation:
    def __init__(self) -> None:
        self.errors: list[str] = []

    def require(self, condition: bool, message: str) -> None:
        if not condition:
            self.errors.append(message)


def load_manifest(path: Path, validation: Validation) -> dict:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        validation.errors.append(f"Missing manifest: {path.relative_to(ROOT)}")
        return {}
    except json.JSONDecodeError as exc:
        validation.errors.append(
            f"Invalid JSON-compatible YAML in {path.relative_to(ROOT)}: {exc}"
        )
        return {}
    validation.require(isinstance(data, dict), f"{path.name} must contain an object")
    return data if isinstance(data, dict) else {}


def qmd_title(path: Path) -> str | None:
    match = re.search(r'^title:\s*["\']?(.+?)["\']?\s*$', path.read_text(encoding="utf-8"), re.M)
    return match.group(1).strip() if match else None


def normalized_title(value: str) -> str:
    value = re.sub(r"^Pre-work\s+\d+:\s*", "", value, flags=re.I)
    value = re.sub(r"^\d+\.\s*", "", value)
    value = re.sub(r"\s*\(Optional\)\s*$", "", value, flags=re.I)
    return re.sub(r"\s+", " ", value).strip().casefold()


def validate_course(course: dict, validation: Validation) -> None:
    lessons = course.get("lessons")
    validation.require(course.get("schema_version") == 1, "course-manifest schema_version must be 1")
    validation.require(isinstance(lessons, list) and lessons, "course-manifest lessons must be a non-empty list")
    if not isinstance(lessons, list):
        return

    required = {
        "id", "day", "order", "title", "path", "route", "status",
        "duration_minutes", "compute", "artifact", "checkpoint_id", "checkpoint_label",
    }
    seen_ids: set[str] = set()
    seen_paths: set[str] = set()
    seen_checkpoints: set[str] = set()
    day_orders: set[tuple[str, int]] = set()

    for index, lesson in enumerate(lessons):
        label = lesson.get("id", f"lesson #{index + 1}") if isinstance(lesson, dict) else f"lesson #{index + 1}"
        validation.require(isinstance(lesson, dict), f"{label} must be an object")
        if not isinstance(lesson, dict):
            continue
        missing = sorted(required - lesson.keys())
        validation.require(not missing, f"{label} missing fields: {', '.join(missing)}")
        if missing:
            continue

        validation.require(lesson["id"] not in seen_ids, f"Duplicate lesson id: {lesson['id']}")
        validation.require(lesson["path"] not in seen_paths, f"Duplicate lesson path: {lesson['path']}")
        validation.require(lesson["checkpoint_id"] not in seen_checkpoints, f"Duplicate checkpoint id: {lesson['checkpoint_id']}")
        day_order = (lesson["day"], lesson["order"])
        validation.require(day_order not in day_orders, f"Duplicate lesson order: {day_order}")
        seen_ids.add(lesson["id"])
        seen_paths.add(lesson["path"])
        seen_checkpoints.add(lesson["checkpoint_id"])
        day_orders.add(day_order)

        validation.require(lesson["route"] in {"core", "full", "reference"}, f"{label} has invalid route")
        validation.require(lesson["status"] in {"required", "optional"}, f"{label} has invalid status")
        validation.require(isinstance(lesson["duration_minutes"], int) and lesson["duration_minutes"] > 0, f"{label} duration must be a positive integer")
        source_path = ROOT / lesson["path"]
        validation.require(source_path.is_file(), f"{label} path does not exist: {lesson['path']}")
        if source_path.is_file():
            source_title = qmd_title(source_path)
            validation.require(source_title is not None, f"{label} source has no title")
            if source_title:
                validation.require(
                    normalized_title(source_title) == normalized_title(lesson["title"]),
                    f"{label} title differs from {lesson['path']}: {lesson['title']!r} vs {source_title!r}",
                )

    milestones = course.get("milestones")
    validation.require(isinstance(milestones, list) and milestones, "course-manifest milestones must be a non-empty list")
    if not isinstance(milestones, list):
        return
    required_milestone_fields = {"id", "day", "title", "path", "route", "artifact", "checkpoint_label"}
    seen_milestones: set[str] = set()
    for milestone in milestones:
        milestone_id = milestone.get("id", "unknown") if isinstance(milestone, dict) else "unknown"
        validation.require(isinstance(milestone, dict), f"Milestone {milestone_id} must be an object")
        if not isinstance(milestone, dict):
            continue
        missing = sorted(required_milestone_fields - milestone.keys())
        validation.require(not missing, f"Milestone {milestone_id} missing fields: {', '.join(missing)}")
        validation.require(milestone_id not in seen_milestones, f"Duplicate milestone id: {milestone_id}")
        validation.require(
            milestone_id not in seen_checkpoints,
            f"Milestone id conflicts with a lesson checkpoint id: {milestone_id}",
        )
        seen_milestones.add(milestone_id)
        validation.require(milestone.get("route") == "core", f"Milestone {milestone_id} must use the core route")
        milestone_path = ROOT / milestone.get("path", "")
        validation.require(milestone_path.is_file(), f"Milestone {milestone_id} path does not exist")
        if milestone_path.is_file():
            marker = f'module-id="{milestone_id}"'
            validation.require(marker in milestone_path.read_text(encoding="utf-8"), f"Milestone {milestone_id} has no matching task marker")


def validate_targets(target_data: dict, validation: Validation) -> None:
    targets = target_data.get("targets")
    validation.require(target_data.get("schema_version") == 1, "targets schema_version must be 1")
    validation.require(isinstance(targets, list) and targets, "targets must be a non-empty list")
    if not isinstance(targets, list):
        return

    seen: set[str] = set()
    for target in targets:
        target_id = target.get("id", "unknown")
        validation.require(target_id not in seen, f"Duplicate target id: {target_id}")
        seen.add(target_id)
        for field in ("name", "pdb", "target_chain", "partner_chains", "hotspots", "preparation_notes", "page", "wednesday_assignment"):
            validation.require(field in target, f"Target {target_id} missing {field}")
        if not all(field in target for field in ("pdb", "target_chain", "hotspots", "page")):
            continue
        pdb = target["pdb"]
        chain = target["target_chain"]
        validation.require(bool(re.fullmatch(r"[0-9][A-Za-z0-9]{3}", pdb)), f"Target {target_id} has invalid PDB id: {pdb}")
        validation.require(bool(re.fullmatch(r"[A-Za-z0-9]", chain)), f"Target {target_id} has invalid chain: {chain}")
        partners = target.get("partner_chains", [])
        validation.require(isinstance(partners, list), f"Target {target_id} partner_chains must be a list")
        if isinstance(partners, list):
            validation.require(chain not in partners, f"Target {target_id} repeats its target chain as a partner")
            validation.require(len(partners) == len(set(partners)), f"Target {target_id} repeats a partner chain")
        validation.require(bool(str(target.get("preparation_notes", "")).strip()), f"Target {target_id} needs preparation notes")
        validation.require(isinstance(target["hotspots"], list) and target["hotspots"], f"Target {target_id} needs hotspots")
        for hotspot in target.get("hotspots", []):
            validation.require(bool(re.fullmatch(re.escape(chain) + r"-?\d+[A-Za-z]?", hotspot)), f"Target {target_id} hotspot {hotspot!r} does not match chain {chain}")

        page = ROOT / target["page"]
        validation.require(page.is_file(), f"Target {target_id} page missing: {target['page']}")
        if page.is_file():
            marker = (
                f"<!-- canonical-target: {target_id}; pdb={pdb}; chain={chain}; "
                f"hotspots={','.join(target['hotspots'])} -->"
            )
            validation.require(marker in page.read_text(encoding="utf-8"), f"Target {target_id} page lacks the canonical metadata marker")


def validate_tools(tool_data: dict, validation: Validation) -> None:
    tools = tool_data.get("tools")
    validation.require(tool_data.get("schema_version") == 1, "tools schema_version must be 1")
    validation.require(isinstance(tools, list) and tools, "tools must be a non-empty list")
    if not isinstance(tools, list):
        return
    seen: set[str] = set()
    for tool in tools:
        tool_id = tool.get("id", "unknown")
        validation.require(tool_id not in seen, f"Duplicate tool id: {tool_id}")
        seen.add(tool_id)
        for field in ("name", "lesson", "source", "pin_kind", "pin", "last_pin_review", "last_full_smoke_test"):
            validation.require(field in tool, f"Tool {tool_id} missing {field}")
        lesson = ROOT / tool.get("lesson", "")
        validation.require(lesson.is_file(), f"Tool {tool_id} lesson missing: {tool.get('lesson')}")
        if lesson.is_file():
            text = lesson.read_text(encoding="utf-8")
            marker = f"<!-- course-tool-pin: {tool_id} -->"
            validation.require(marker in text, f"Tool {tool_id} lesson lacks {marker}")
            if tool.get("pin_kind") == "git_commit":
                validation.require(tool.get("pin", "") in text, f"Tool {tool_id} commit pin is absent from its lesson")
            if tool.get("source_commit"):
                validation.require(tool["source_commit"] in text, f"Tool {tool_id} source commit is absent from its lesson")


def code_regions(text: str) -> list[tuple[int, str]]:
    """Return fenced-code lines and inline-code spans with source line numbers."""
    regions: list[tuple[int, str]] = []
    in_fence = False
    for line_number, line in enumerate(text.splitlines(), start=1):
        if re.match(r"^\s*```", line):
            in_fence = not in_fence
            continue
        if in_fence:
            regions.append((line_number, line))
        else:
            regions.extend((line_number, match.group(1)) for match in re.finditer(r"`([^`]+)`", line))
    return regions


def validate_code_quotes(validation: Validation) -> None:
    for folder in (ROOT / "monday", ROOT / "wednesday"):
        for path in folder.glob("*.qmd"):
            for line_number, region in code_regions(path.read_text(encoding="utf-8")):
                if re.search("[‘’“”]", region):
                    validation.errors.append(
                        f"Typographic quote in code at {path.relative_to(ROOT)}:{line_number}: {region.strip()}"
                    )


def validate_refresher(validation: Validation) -> None:
    sample = (REFRESHER_DIR / "sample.fasta").read_text(encoding="utf-8")
    for line_number, line in enumerate(sample.splitlines(), start=1):
        if line.startswith(">"):
            validation.require(not line.startswith(">>"), f"sample.fasta line {line_number} has more than one FASTA marker")
    for relative in ("monday/prework-3-python.qmd", "monday/HW3-python-refresher/README.md"):
        text = (ROOT / relative).read_text(encoding="utf-8")
        validation.require("GC Content" not in text and "Reverse Complement" not in text, f"{relative} still describes DNA output")

    validation.require(REFRESHER_ZIP.is_file(), "Missing monday/files/python-refresher.zip")
    if not REFRESHER_ZIP.is_file():
        return
    source_files = {
        path.relative_to(REFRESHER_DIR).as_posix(): path.read_bytes()
        for path in REFRESHER_DIR.rglob("*")
        if path.is_file()
        and "__pycache__" not in path.parts
        and ".pytest_cache" not in path.parts
        and ".github" not in path.parts
    }
    with zipfile.ZipFile(REFRESHER_ZIP) as archive:
        archive_files = {
            name.removeprefix("python-refresher/"): archive.read(name)
            for name in archive.namelist()
            if not name.endswith("/") and name.startswith("python-refresher/")
        }
    validation.require(set(source_files) == set(archive_files), "Python refresher ZIP file list differs from canonical source")
    for name in sorted(set(source_files) & set(archive_files)):
        validation.require(source_files[name] == archive_files[name], f"Python refresher ZIP has stale content: {name}")


def notebook_code(notebook: dict) -> list[str]:
    return [
        "".join(cell.get("source", []))
        for cell in notebook.get("cells", [])
        if cell.get("cell_type") == "code"
    ]


def validate_cpu_gpu_notebook(validation: Validation) -> dict:
    """Validate reproducible structure without requiring PyTorch or a GPU."""
    try:
        notebook = json.loads(CPU_GPU_NOTEBOOK.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError) as exc:
        validation.errors.append(f"Invalid CPU/GPU notebook: {exc}")
        return {}
    validation.require(notebook.get("nbformat") == 4, "CPU/GPU notebook must use nbformat 4")
    cells = notebook.get("cells")
    validation.require(isinstance(cells, list) and cells, "CPU/GPU notebook must contain cells")
    if not isinstance(cells, list):
        return notebook

    code_cells = [cell for cell in cells if cell.get("cell_type") == "code"]
    validation.require(bool(code_cells), "CPU/GPU notebook must contain code cells")
    for index, cell in enumerate(code_cells, start=1):
        validation.require(cell.get("execution_count") is None, f"CPU/GPU notebook code cell {index} has a stale execution count")
        validation.require(cell.get("outputs", []) == [], f"CPU/GPU notebook code cell {index} has stale output")
        source = "".join(cell.get("source", []))
        try:
            compile(source, f"{CPU_GPU_NOTEBOOK.name}:cell-{index}", "exec")
        except SyntaxError as exc:
            validation.errors.append(f"CPU/GPU notebook code cell {index} has invalid Python: {exc}")

    combined = "\n\n".join(notebook_code(notebook))
    required_snippets = (
        "def calculate_and_time",
        "def dot_product_for_loop",
        "def dot_product_vectorized",
        "def dot_product_torch",
        'torch.device("cpu")',
        'times["gpu"] = None',
        "N/A",
    )
    for snippet in required_snippets:
        validation.require(snippet in combined, f"CPU/GPU notebook is missing required CPU-fallback code: {snippet}")

    assignments: list[list[int]] = []
    try:
        tree = ast.parse(combined)
    except SyntaxError:
        return notebook
    for node in ast.walk(tree):
        if not isinstance(node, ast.Assign):
            continue
        if not any(isinstance(target, ast.Name) and target.id == "data_sizes" for target in node.targets):
            continue
        try:
            value = ast.literal_eval(node.value)
        except (ValueError, TypeError):
            validation.errors.append("CPU/GPU notebook data_sizes must be a literal list of integers")
            continue
        if isinstance(value, list):
            assignments.append(value)
    validation.require(len(assignments) == 1, "CPU/GPU notebook must define data_sizes exactly once")
    if len(assignments) == 1:
        sizes = assignments[0]
        validation.require(all(isinstance(size, int) and size > 0 for size in sizes), "CPU/GPU benchmark sizes must be positive integers")
        validation.require(len(sizes) == len(set(sizes)), "CPU/GPU benchmark sizes contain duplicates")
        validation.require(sizes == sorted(sizes), "CPU/GPU benchmark sizes must be increasing")
        validation.require(len(sizes) >= 6 and sizes[-1] >= 5000, "CPU/GPU benchmark needs a useful range of at least six sizes through 5000")
    return notebook


def smoke_cpu_gpu_notebook(notebook: dict, validation: Validation) -> None:
    """Run only CPU-safe definitions and tiny operations; never invoke a GPU."""
    try:
        import torch  # type: ignore
    except ImportError:
        validation.errors.append("--smoke-notebook requires PyTorch in the current Python environment")
        return
    namespace: dict = {"torch": torch}
    for source in notebook_code(notebook):
        if source.lstrip().startswith(("import ", "from ")) or source.lstrip().startswith("def "):
            exec(compile(source, CPU_GPU_NOTEBOOK.name, "exec"), namespace)
    for name in ("dot_product_for_loop", "dot_product_vectorized", "dot_product_torch"):
        function = namespace.get(name)
        validation.require(callable(function), f"CPU smoke test could not load {name}")
        if callable(function):
            result = function(10, torch.device("cpu"))
            validation.require(isinstance(result, torch.Tensor) and result.numel() == 1, f"CPU smoke test failed for {name}")


def render_course_include(course: dict) -> str:
    browser_course = dict(course)
    for collection in ("lessons", "milestones"):
        browser_course[collection] = []
        for item in course.get(collection, []):
            browser_item = dict(item)
            source = browser_item["path"]
            browser_item["source"] = source
            browser_item["path"] = re.sub(r"\.qmd$", ".html", source)
            browser_course[collection].append(browser_item)
    payload = json.dumps(browser_course, ensure_ascii=False, separators=(",", ":"))
    payload = payload.replace("<", "\\u003c")
    return (
        "<!-- Generated by scripts/validate_course_data.py --generate; do not edit. -->\n"
        "<script>\n"
        f"window.BOOTCAMP_COURSE = {payload};\n"
        "</script>\n"
    )


def render_target_table(target_data: dict) -> str:
    lines = [
        "<!-- Generated by scripts/validate_course_data.py --generate; do not edit. -->",
        "| Target | UniProt ID | PDB ID | Recommended steering hotspots |",
        "| --- | --- | --- | --- |",
    ]
    for target in target_data.get("targets", []):
        if not target.get("wednesday_assignment"):
            continue
        uniprot = target.get("uniprot")
        uniprot_cell = (
            f"[{uniprot}](https://www.uniprot.org/uniprotkb/{uniprot}/entry)" if uniprot else "—"
        )
        pdb = target["pdb"]
        lines.append(
            f"| {target['name']} | {uniprot_cell} | "
            f"[{pdb}](https://www.rcsb.org/structure/{pdb}) | "
            f"{', '.join(target['hotspots'])} |"
        )
    lines.extend(
        [
            "",
            "The exact PDB, chain, and hotspot records above come from `data/targets.yml`. "
            "Use the linked target deep-dive page to understand how each set was chosen.",
            "",
        ]
    )
    return "\n".join(lines)


def render_capstone_template_zip() -> bytes:
    """Return a byte-for-byte deterministic ZIP of the canonical template."""
    buffer = io.BytesIO()
    member = zipfile.ZipInfo("capstone-evidence-template.md", date_time=(1980, 1, 1, 0, 0, 0))
    member.compress_type = zipfile.ZIP_DEFLATED
    member.create_system = 3
    member.external_attr = 0o644 << 16
    with zipfile.ZipFile(buffer, mode="w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        archive.writestr(member, CAPSTONE_TEMPLATE.read_bytes())
    return buffer.getvalue()


def generated_outputs(course: dict, target_data: dict) -> dict[Path, str | bytes]:
    return {
        COURSE_INCLUDE: render_course_include(course),
        TARGET_TABLE: render_target_table(target_data),
        CAPSTONE_TEMPLATE_ZIP: render_capstone_template_zip(),
    }


def write_generated(outputs: dict[Path, str | bytes]) -> None:
    for path, content in outputs.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        if isinstance(content, bytes):
            path.write_bytes(content)
        else:
            path.write_text(content, encoding="utf-8")
        print(f"generated {path.relative_to(ROOT)}")


def check_generated(outputs: dict[Path, str | bytes], validation: Validation) -> None:
    for path, expected in outputs.items():
        validation.require(path.is_file(), f"Missing generated file: {path.relative_to(ROOT)}")
        if path.is_file():
            actual = path.read_bytes() if isinstance(expected, bytes) else path.read_text(encoding="utf-8")
            validation.require(actual == expected, f"Stale generated file: {path.relative_to(ROOT)} (run with --generate)")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--generate", action="store_true", help="regenerate checked-in course data derivatives")
    parser.add_argument("--smoke-notebook", action="store_true", help="also run tiny CPU-only notebook operations (requires PyTorch)")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    validation = Validation()
    course = load_manifest(COURSE_FILE, validation)
    targets = load_manifest(TARGETS_FILE, validation)
    tools = load_manifest(TOOLS_FILE, validation)
    validate_course(course, validation)
    validate_targets(targets, validation)
    validate_tools(tools, validation)
    validate_code_quotes(validation)
    validate_refresher(validation)
    cpu_gpu_notebook = validate_cpu_gpu_notebook(validation)
    if args.smoke_notebook and cpu_gpu_notebook:
        smoke_cpu_gpu_notebook(cpu_gpu_notebook, validation)

    outputs = generated_outputs(course, targets)
    if args.generate and not validation.errors:
        write_generated(outputs)
    else:
        check_generated(outputs, validation)

    if validation.errors:
        print(f"Course data validation failed with {len(validation.errors)} error(s):", file=sys.stderr)
        for error in validation.errors:
            print(f"  - {error}", file=sys.stderr)
        return 1
    print("Course data validation passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
