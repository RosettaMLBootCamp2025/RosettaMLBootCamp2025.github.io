# GFP analysis dataset
1. Open plddt.png and pae.png. Mark one confident region and one uncertainty.
2. Open gfp.pdb in PyMOL; the B-factor column contains pLDDT. Use `load gfp.pdb, af2_gfp`.
3. Compare to experimental 1GFL using the lesson commands if you have a viewer and internet. If unavailable, state that RMSD is not measured; complete the confidence task offline.
4. Fill evidence-template.csv and write a three-sentence trust statement. Compare with completed-example.md afterward.

Source: https://alphafold.ebi.ac.uk/entry/P42212
Retrieved 2026-09-19 using https://alphafold.ebi.ac.uk/api/prediction/P42212
Provider: Google DeepMind / EMBL-EBI AlphaFold DB; CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/).
The unchanged upstream structure, confidence, PAE and API metadata are included. The course generated residue-confidence.csv, plddt.png and the example interpretation from these files. SHA256SUMS.txt identifies every bundled file.
The supplied model uses the same amino-acid sequence as the lesson. It is not a new local/hosted run. Missing run-specific values are N/A, not zero.
