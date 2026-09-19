# Published PD-L1 binder analysis
Source: Pacesa, Nickel & Correia, Structural models of BindCraft designed binders, Zenodo v1, https://doi.org/10.5281/zenodo.14249738 (2024). CC BY 4.0. Retrieved 2026-09-19.
This teaching subset includes unchanged PD-L1_b8, b9 and b10 PDB files from DesignModels.zip. It is NOT a full campaign or a new generation run. Chain A is the cropped target and chain B is the binder. Residue numbering is local to these files: do not copy hotspots from 4ZQK without mapping sequences.

## What is included
- Three published complex models, a CA-trace gallery and extracted binder sequences.
- A reproducible geometry comparison at 6, 8 and 10 Å CA-distance thresholds, produced by scripts/build-analysis-data.py in the course repository.
- provenance.json and SHA256SUMS.txt.
- analysis-workbook.md with all seven stage prompts.

## Missing evidence
Raw generation trajectories, rejected candidates, parent-backbone linkage, original seeds/configuration, PAE and ipTM are NOT in this source archive. Do not fabricate them or claim they have been reproduced. These gaps are part of the analysis, and the analysis-mode rubric explicitly accepts an evidence-gap audit and a concrete next test. Geometry alone cannot establish affinity or successful binding.

Open candidate-gallery.png and candidate-comparison.csv first. These summaries can be read without Python, a GPU or a molecular viewer. Unchanged PDB files support deeper inspection. Preserve provenance and distinguish course-derived geometry from published outputs.
