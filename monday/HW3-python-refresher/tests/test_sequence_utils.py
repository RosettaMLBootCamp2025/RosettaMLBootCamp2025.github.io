"""
Tests for sequence_utils.py
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sequence_utils import molecular_weight, count_hydrophobic, find_motif, count_charged_residues


def test_molecular_weight():
    """Test molecular_weight function"""
    # Test with Alanine tripeptide (AAA)
    # 3 * 89.09 - 2 * 18.01 (water loss for 2 peptide bonds) = 231.25
    result = molecular_weight("AAA")
    assert abs(result - 231.25) < 1.0  # Allow small floating point difference


def test_count_hydrophobic():
    """Test count_hydrophobic function"""
    # AVILMFWP are hydrophobic
    assert count_hydrophobic("AVILMFWP") == 8
    assert count_hydrophobic("KRHDE") == 0  # No hydrophobic
    assert count_hydrophobic("AAKDE") == 2  # 2 A's


def test_find_motif():
    """Test find_motif function"""
    result = find_motif("ACDEFACGH", "AC")
    assert result == [0, 5]

    result = find_motif("AAAA", "AA")
    assert 0 in result
    assert 1 in result
    assert 2 in result

    result = find_motif("ACDEF", "XY")
    assert result == []


def test_count_charged_residues():
    """Test count_charged_residues function"""
    # KRH are positive, DE are negative
    pos, neg = count_charged_residues("KRHDE")
    assert pos == 3
    assert neg == 2

    pos, neg = count_charged_residues("AAA")
    assert pos == 0
    assert neg == 0
