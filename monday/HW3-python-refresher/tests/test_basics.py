"""
Tests for basics.py
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from basics import reverse_string, count_characters, amino_acid_composition, filter_sequences_by_length


def test_reverse_string():
    """Test reverse_string function"""
    assert reverse_string("ACDEF") == "FEDCA"
    assert reverse_string("A") == "A"
    assert reverse_string("") == ""


def test_count_characters():
    """Test count_characters function"""
    result = count_characters("AACDE")
    assert result['A'] == 2
    assert result['C'] == 1
    assert result['D'] == 1
    assert result['E'] == 1
    assert len(result) == 4


def test_amino_acid_composition():
    """Test amino_acid_composition function"""
    result = amino_acid_composition("AACCDDEE")
    assert result['A'] == 25.0
    assert result['C'] == 25.0
    assert result['D'] == 25.0
    assert result['E'] == 25.0
    assert len(result) == 4


def test_filter_sequences_by_length():
    """Test filter_sequences_by_length function"""
    sequences = ["AC", "ACDE", "A", "DEFGHI"]
    result = filter_sequences_by_length(sequences, 2)
    assert "AC" in result
    assert "ACDE" in result
    assert "DEFGHI" in result
    assert "A" not in result
    assert len(result) == 3
