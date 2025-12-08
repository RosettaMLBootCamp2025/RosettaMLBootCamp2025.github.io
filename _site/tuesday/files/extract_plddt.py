#!/usr/bin/env python3
"""
Extract pLDDT confidence scores from PDB files.

Works with both ESMFold and AlphaFold2 predictions.
Both store pLDDT scores in the B-factor column (columns 61-66).

Usage:
    python extract_plddt.py <pdb_file>

Example:
    python extract_plddt.py esmfold_gfp.pdb
    python extract_plddt.py af2_prediction.pdb
"""

def extract_plddt_from_pdb(pdb_file):
    """
    Extract pLDDT scores from PDB file.

    Both ESMFold and AlphaFold2 store pLDDT confidence scores
    in the B-factor column of PDB files.

    Args:
        pdb_file: Path to PDB file

    Returns:
        List of (residue_number, pLDDT) tuples
    """
    plddt_scores = []

    with open(pdb_file, 'r') as f:
        for line in f:
            if line.startswith('ATOM'):
                # Parse the fixed-width PDB format
                atom_name = line[12:16].strip()
                residue_num = int(line[22:26].strip())
                b_factor = float(line[60:66].strip())

                # Only use CA (alpha carbon) atoms to avoid counting each residue multiple times
                if atom_name == 'CA':
                    plddt_scores.append((residue_num, b_factor))

    return plddt_scores


def calculate_statistics(plddt_scores):
    """
    Calculate summary statistics for pLDDT scores.

    Args:
        plddt_scores: List of (residue_number, pLDDT) tuples

    Returns:
        Dictionary with statistics
    """
    if not plddt_scores:
        return None

    plddt_values = [score for _, score in plddt_scores]

    stats = {
        'average': sum(plddt_values) / len(plddt_values),
        'min': min(plddt_values),
        'max': max(plddt_values),
        'high_confidence': sum(1 for v in plddt_values if v > 90),
        'medium_confidence': sum(1 for v in plddt_values if 70 <= v <= 90),
        'low_confidence': sum(1 for v in plddt_values if v < 70),
        'total_residues': len(plddt_values)
    }

    return stats


def print_statistics(stats, pdb_file):
    """
    Print formatted statistics.

    Args:
        stats: Dictionary with statistics
        pdb_file: Name of PDB file (for display)
    """
    if not stats:
        print("No pLDDT scores found in file.")
        return

    print(f"\n{'='*60}")
    print(f"pLDDT Statistics for: {pdb_file}")
    print(f"{'='*60}")
    print(f"\nOverall Confidence:")
    print(f"  Average pLDDT: {stats['average']:.2f}")
    print(f"  Min pLDDT:     {stats['min']:.2f}")
    print(f"  Max pLDDT:     {stats['max']:.2f}")

    print(f"\nResidues by Confidence Level:")
    print(f"  High confidence (>90):     {stats['high_confidence']:4d} residues ({stats['high_confidence']/stats['total_residues']*100:.1f}%)")
    print(f"  Medium confidence (70-90): {stats['medium_confidence']:4d} residues ({stats['medium_confidence']/stats['total_residues']*100:.1f}%)")
    print(f"  Low confidence (<70):      {stats['low_confidence']:4d} residues ({stats['low_confidence']/stats['total_residues']*100:.1f}%)")

    print(f"\nTotal residues: {stats['total_residues']}")
    print(f"{'='*60}\n")


if __name__ == '__main__':
    import sys

    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(1)

    pdb_file = sys.argv[1]

    # Check if file exists
    try:
        with open(pdb_file, 'r') as f:
            pass
    except FileNotFoundError:
        print(f"Error: File '{pdb_file}' not found.")
        sys.exit(1)

    # Extract and analyze
    scores = extract_plddt_from_pdb(pdb_file)
    stats = calculate_statistics(scores)
    print_statistics(stats, pdb_file)

    # Interpretation guide
    print("Interpretation Guide:")
    print("  >90:  Very high confidence - well-structured region")
    print("  70-90: Good confidence - likely accurate")
    print("  <70:  Low confidence - may be flexible/disordered or uncertain")
    print()
