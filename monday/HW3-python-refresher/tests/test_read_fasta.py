"""
Tests for read_fasta.py
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from read_fasta import read_fasta


def test_read_fasta():
    """Test read_fasta function with sample.fasta"""
    sequences = read_fasta("sample.fasta")

    # Check that we read all 4 sequences
    assert len(sequences) == 4

    # Check that all expected headers are present
    assert "hemoglobin_alpha_human" in sequences
    assert "insulin_human" in sequences
    assert "lysozyme_human" in sequences
    assert "ubiquitin" in sequences

    # Check that sequences are not empty
    for header, sequence in sequences.items():
        assert len(sequence) > 0
        assert isinstance(sequence, str)

    # Check specific sequence lengths (approximately)
    assert len(sequences["ubiquitin"]) > 50  # Ubiquitin is around 76 aa
    assert len(sequences["hemoglobin_alpha_human"]) > 100  # Hemoglobin alpha is around 141 aa
