#!/usr/bin/env python3
"""
HW3 Part 3: FASTA File Parsing
Implement functions to read and parse FASTA files.
"""

import sys


def read_fasta(filename):
    """
    Read a FASTA file and return a dictionary of sequences.

    FASTA format:
        >header1
        SEQUENCE1
        >header2
        SEQUENCE2

    Args:
        filename (str): Path to FASTA file

    Returns:
        dict: Dictionary mapping headers (without '>') to sequences

    Example:
        For a file containing:
            >protein1
            ACDEFG
            >protein2
            HIKLMN

        Returns: {'protein1': 'ACDEFG', 'protein2': 'HIKLMN'}
    """
    sequences = {}

    # TODO: Implement this function
    # Hints:
    # 1. Open the file and read it line by line
    # 2. Lines starting with '>' are headers
    # 3. Other lines are sequence data (might be split across multiple lines)
    # 4. Use .strip() to remove whitespace/newlines
    # 5. Store sequences in the dictionary with header as key

    try:
        # TODO: Open and parse the file
        pass
    except FileNotFoundError:
        print(f"Error: File '{filename}' not found!")
        return {}
    except Exception as e:
        print(f"Error reading file: {e}")
        return {}


def print_fasta_stats(sequences):
    """
    Print statistics about the sequences in a FASTA file.

    Args:
        sequences (dict): Dictionary of header -> sequence from read_fasta()
    """
    # TODO: Implement this function
    # Print:
    # - Total number of sequences
    # - For each sequence: header, length, first 50 amino acids
    pass


# Test your functions
if __name__ == "__main__":
    print("Testing FASTA Parser")
    print("=" * 50)

    # Check if a filename was provided
    if len(sys.argv) < 2:
        print("Usage: python read_fasta.py <fasta_file>")
        print("Example: python read_fasta.py sample.fasta")
        sys.exit(1)

    filename = sys.argv[1]

    print(f"\nReading FASTA file: {filename}")
    print("-" * 50)

    # Read the FASTA file
    sequences = read_fasta(filename)

    if sequences:
        print(f"\nSuccessfully read {len(sequences)} sequence(s)\n")
        print_fasta_stats(sequences)
    else:
        print("\nNo sequences found or error reading file.")

    print("\n" + "=" * 50)
