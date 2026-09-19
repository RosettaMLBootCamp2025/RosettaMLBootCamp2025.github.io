#!/usr/bin/env python3
"""Rebuild teaching summaries and ZIPs from checked-in, attributed source data.

Requires numpy and matplotlib. No model inference or network requests are made.
The PDB files and AlphaFold confidence/PAE data are kept unchanged.
"""
from pathlib import Path
import csv
import hashlib
import json
import zipfile
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data/analysis'
AA = dict(zip('ALA ARG ASN ASP CYS GLN GLU GLY HIS ILE LEU LYS MET PHE PRO SER THR TRP TYR VAL'.split(), 'ARNDCQEGHILKMFPSTWYV'))

def residues(path):
    return [dict(chain=l[21], number=int(l[22:26]), aa=AA.get(l[17:20], 'X'), xyz=[float(l[i:i+8]) for i in [30,38,46]], b=float(l[60:66])) for l in path.read_text().splitlines() if l.startswith('ATOM  ') and l[12:16].strip() == 'CA']

def write_csv(path, rows):
    with path.open('w', newline='') as f:
        w=csv.DictWriter(f, fieldnames=list(rows[0])); w.writeheader(); w.writerows(rows)

def package(folder, output):
    files=sorted(p for p in folder.iterdir() if p.is_file() and p.name != 'SHA256SUMS.txt')
    (folder/'SHA256SUMS.txt').write_text(''.join(f'{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.name}\n' for p in files))
    with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as z:
        for p in sorted(folder.iterdir()):
            if p.is_file():
                info=zipfile.ZipInfo(folder.name+'/'+p.name, (2026,9,19,0,0,0)); info.compress_type=zipfile.ZIP_DEFLATED
                z.writestr(info,p.read_bytes())

gfp=DATA/'gfp'; meta=json.loads((gfp/'source-metadata.json').read_text())[0]
r=residues(gfp/'gfp.pdb'); assert ''.join(x['aa'] for x in r)==meta['sequence']
pae=np.asarray(json.loads((gfp/'pae.json').read_text())[0]['predicted_aligned_error'])
assert pae.shape==(len(r),len(r)) and np.isfinite(pae).all()
write_csv(gfp/'residue-confidence.csv',[dict(residue=x['number'],amino_acid=x['aa'],plddt=x['b']) for x in r])
fig,ax=plt.subplots(figsize=(8,3)); ax.plot([x['number'] for x in r],[x['b'] for x in r],color='#125a91',lw=1.5)
ax.axhline(70,color='#a84023',ls='--',label='pLDDT 70');ax.set(xlabel='Residue (UniProt P42212)',ylabel='pLDDT',ylim=(0,103),title='GFP: local confidence in the supplied AlphaFold DB model');ax.legend();fig.tight_layout();fig.savefig(gfp/'plddt.png',dpi=160);plt.close(fig)
low=[x['number'] for x in r if x['b']<70]
(gfp/'completed-example.md').write_text(f'''# Example interpretation — GFP
Source: AlphaFold DB {meta['modelEntityId']}, version {meta['latestVersion']}. This is a database prediction, not a fresh ColabFold run.

- Sequence: {len(r)} residues, identical to the course GFP FASTA.
- Mean CA pLDDT: {np.mean([x['b'] for x in r]):.2f}. Residues below 70: {', '.join(map(str,low))}.
- Mean pairwise PAE: {pae.mean():.2f} Å; this is a descriptive mean, not pTM.
- pTM, runtime, MSA depth and exact original run commands: not supplied; record N/A.
- RMSD to 1GFL: measure after your own alignment; do not infer it from confidence.

Trust statement: Most local geometry in this model has high predicted confidence. The lower-confidence residues deserve separate inspection, and local confidence does not establish the chromophore state, folding stability or fluorescence. I would compare the model to experimental GFP and inspect the alignment before using a local contact to plan an experiment.

Your answer may differ if it identifies specific evidence and its limits. Do not replace missing values with zero.
''')
(gfp/'README.md').write_text('''# GFP analysis dataset
1. Open plddt.png and pae.png. Mark one confident region and one uncertainty.
2. Open gfp.pdb in PyMOL; the B-factor column contains pLDDT. Use `load gfp.pdb, af2_gfp`.
3. Compare to experimental 1GFL using the lesson commands if you have a viewer and internet. If unavailable, state that RMSD is not measured; complete the confidence task offline.
4. Fill evidence-template.csv and write a three-sentence trust statement. Compare with completed-example.md afterward.

Source: https://alphafold.ebi.ac.uk/entry/P42212
Retrieved 2026-09-19 using https://alphafold.ebi.ac.uk/api/prediction/P42212
Provider: Google DeepMind / EMBL-EBI AlphaFold DB; CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/).
The unchanged upstream structure, confidence, PAE and API metadata are included. The course generated residue-confidence.csv, plddt.png and the example interpretation from these files. SHA256SUMS.txt identifies every bundled file.
The supplied model uses the same amino-acid sequence as the lesson. It is not a new local/hosted run. Missing run-specific values are N/A, not zero.
''')
write_csv(gfp/'evidence-template.csv',[dict(evidence=x,result='',interpretation='') for x in ['Mean pLDDT','Residues below 70','PAE pattern','pTM (N/A if unavailable)','RMSD to 1GFL (N/A unless measured)','Runtime (N/A for database model)','Trust statement']])

bind=DATA/'binders'; rows=[]; fasta=[]
fig,axes=plt.subplots(1,3,figsize=(11,3.4))
for ax,p in zip(axes, sorted(bind.glob('*.pdb'))):
    rs=residues(p); a=[x for x in rs if x['chain']=='A']; b=[x for x in rs if x['chain']=='B'];assert a and b
    ac=np.asarray([x['xyz'] for x in a]);bc=np.asarray([x['xyz'] for x in b]);dist=np.linalg.norm(ac[:,None,:]-bc[None,:,:],axis=2)
    row=dict(candidate=p.stem,target_chain='A',binder_chain='B',target_residues=len(a),binder_residues=len(b))
    for cutoff in [6,8,10]:row[f'CA_pairs_below_{cutoff}A']=int((dist<cutoff).sum())
    row['target_residues_with_CA_contact_8A']=';'.join(str(a[i]['number']) for i in np.where((dist<8).any(axis=1))[0])
    row['PAE']='not supplied';row['ipTM']='not supplied';rows.append(row)
    fasta.append('>'+p.stem+'|chain_B|extracted_from_published_model\n'+''.join(x['aa'] for x in b)+'\n')
    # Center and project together; a schematic, not an alignment across models.
    coords=np.vstack([ac,bc]);coords-=coords.mean(axis=0);_,_,vt=np.linalg.svd(coords,full_matrices=False);xy=coords@vt[:2].T
    ax.plot(xy[:len(a),0],xy[:len(a),1],color='#607b93',lw=1,label='Target A');ax.plot(xy[len(a):,0],xy[len(a):,1],color='#bd531f',lw=1.5,label='Binder B')
    ax.set_title(p.stem);ax.set_aspect('equal');ax.axis('off')
axes[0].legend(loc='lower left',fontsize=8);fig.suptitle('Published PD-L1 complexes · CA traces, independently projected');fig.tight_layout();fig.savefig(bind/'candidate-gallery.png',dpi=160);plt.close(fig)
write_csv(bind/'candidate-comparison.csv',rows);(bind/'binder-sequences.fasta').write_text(''.join(fasta))
(bind/'README.md').write_text('''# Published PD-L1 binder analysis
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
''')
(bind/'analysis-workbook.md').write_text('''# Seven-stage analysis workbook
Mode: re-analysis of published BindCraft PD-L1 models; no new designs generated.

1. Target brief: inspect chain A and chain B in the gallery or PDBs. List target residues contacting the binder from the CSV; explain why CA proximity is only a screening proxy. State that mapping to native PD-L1 numbering and the intended biological epitope remains unverified. Propose how to map it before selecting hotspots.
2. Reproducibility audit: cite the DOI, unchanged filenames and checksums. Distinguish the reproducible course geometry calculation from the original design run. List each missing setting and the inference it prevents.
3. Backbone evidence: compare all three models, record geometry and diversity, and rank them under a rule you specify first. Report that the original campaign's rejected models and attrition cannot be reconstructed.
4. Sequence evidence: compare the extracted chain-B FASTAs, lengths and composition. Record parent-backbone mapping as unavailable; these files are final complexes, not the original MPNN library.
5. Validation: compare at least two candidates using the CA-contact table and structural inspection. PAE/ipTM are unavailable. Explain why interface geometry cannot substitute for interface confidence; propose an independent complex prediction or experiment.
6. Failure analysis: test the claim that the candidate with the most contacts is best. Compare the ranking at 6, 8 and 10 Å and normalize by binder length. Record whether the ranking changes. State what changed in your interpretation and what evidence is still needed. This is a sensitivity analysis, not a new model run.
7. Selection memo: choose a provisional next candidate for additional validation, or defer all candidates. Cite trade-offs and unknowns. Name a specific next test and a result that would change your decision. Do not infer experimental success from these models.

Completion: seven sections filled with observed evidence, explicit unknowns and a defensible next test. Use the course analysis-mode rubric. Missing upstream data is acceptable only when its consequences and recovery plan are explicit.
''')
(ROOT/'files').mkdir(exist_ok=True)
package(gfp,ROOT/'files/gfp-analysis.zip');package(bind,ROOT/'files/binder-analysis.zip')
with zipfile.ZipFile(ROOT/'files/portfolio-starter.zip','w',zipfile.ZIP_DEFLATED) as z:
    for name,text in {'README.md':'# Bootcamp portfolio\nRoute:\nCompute:\nCurrent question:\n','readiness.md':'# Readiness\nRoute:\nCompute/account access:\nStorage:\nFallback:\n','decision-log.md':'# Decision log\nQuestion:\nMethod and provenance:\nEvidence:\nInterpretation and uncertainty:\nNext decision:\n'}.items(): z.writestr('bootcamp-portfolio/'+name,text)
    for name in ['environments','inputs','configs','outputs','figures']: z.writestr('bootcamp-portfolio/'+name+'/.keep','')
print('Built GFP and binder analysis packages with verified sequences, PAE dimensions, checksums, and derived comparisons.')
