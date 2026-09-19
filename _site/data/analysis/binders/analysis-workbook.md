# Seven-stage analysis workbook
Mode: re-analysis of published BindCraft PD-L1 models; no new designs generated.

1. Target brief: inspect chain A and chain B in the gallery or PDBs. List target residues contacting the binder from the CSV; explain why CA proximity is only a screening proxy. State that mapping to native PD-L1 numbering and the intended biological epitope remains unverified. Propose how to map it before selecting hotspots.
2. Reproducibility audit: cite the DOI, unchanged filenames and checksums. Distinguish the reproducible course geometry calculation from the original design run. List each missing setting and the inference it prevents.
3. Backbone evidence: compare all three models, record geometry and diversity, and rank them under a rule you specify first. Report that the original campaign's rejected models and attrition cannot be reconstructed.
4. Sequence evidence: compare the extracted chain-B FASTAs, lengths and composition. Record parent-backbone mapping as unavailable; these files are final complexes, not the original MPNN library.
5. Validation: compare at least two candidates using the CA-contact table and structural inspection. PAE/ipTM are unavailable. Explain why interface geometry cannot substitute for interface confidence; propose an independent complex prediction or experiment.
6. Failure analysis: test the claim that the candidate with the most contacts is best. Compare the ranking at 6, 8 and 10 Å and normalize by binder length. Record whether the ranking changes. State what changed in your interpretation and what evidence is still needed. This is a sensitivity analysis, not a new model run.
7. Selection memo: choose a provisional next candidate for additional validation, or defer all candidates. Cite trade-offs and unknowns. Name a specific next test and a result that would change your decision. Do not infer experimental success from these models.

Completion: seven sections filled with observed evidence, explicit unknowns and a defensible next test. Use the course analysis-mode rubric. Missing upstream data is acceptable only when its consequences and recovery plan are explicit.
