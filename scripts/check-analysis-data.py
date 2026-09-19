#!/usr/bin/env python3
"""Verify the offline teaching downloads against the checked-in source files."""
from pathlib import Path
import csv
import hashlib
import io
import json
import zipfile

ROOT=Path(__file__).resolve().parents[1]
for folder,archive in [('gfp','gfp-analysis.zip'),('binders','binder-analysis.zip')]:
    source=ROOT/'data/analysis'/folder
    with zipfile.ZipFile(ROOT/'files'/archive) as z:
        assert z.testzip() is None, archive
        for line in (source/'SHA256SUMS.txt').read_text().splitlines():
            digest,name=line.split('  ',1)
            content=(source/name).read_bytes()
            assert hashlib.sha256(content).hexdigest()==digest, name
            assert z.read(folder+'/'+name)==content, name
        assert folder+'/README.md' in z.namelist()
meta=json.loads((ROOT/'data/analysis/gfp/source-metadata.json').read_text())[0]
confidence=list(csv.DictReader((ROOT/'data/analysis/gfp/residue-confidence.csv').open()))
assert len(confidence)==len(meta['sequence'])==238
assert all(0<=float(row['plddt'])<=100 for row in confidence)
pae=json.loads((ROOT/'data/analysis/gfp/pae.json').read_text())[0]['predicted_aligned_error']
assert len(pae)==238 and all(len(row)==238 for row in pae)
rows=list(csv.DictReader((ROOT/'data/analysis/binders/candidate-comparison.csv').open()))
assert len(rows)==3
for row in rows:
    assert row['PAE']==row['ipTM']=='not supplied'
    assert int(row['CA_pairs_below_6A'])<=int(row['CA_pairs_below_8A'])<=int(row['CA_pairs_below_10A'])
    assert (ROOT/'data/analysis/binders'/(row['candidate']+'.pdb')).is_file()
assert json.loads((ROOT/'data/analysis/binders/provenance.json').read_text())['archive_md5']=='66364e7ce957da7f9e8cb938d5bd7ca4'
print('Analysis downloads verified: archive integrity, source checksums, 238-residue GFP/PAE, and three attributed binder models.')
