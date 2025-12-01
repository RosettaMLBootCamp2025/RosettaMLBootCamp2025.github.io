#!/usr/bin/env python3
"""
HW3 Part 4: Sequence Analysis Tool
Bring it all together! Use the functions you wrote to analyze protein sequences.
"""

import sys
from read_fasta import read_fasta
import sequence_utils


def analyze_sequences(sequences):
    """
    Analyze protein sequences and return a dictionary of results.

    Args:
        sequences (dict): Dictionary of header -> sequence

    Returns:
        dict: Dictionary mapping headers to analysis results
    """
    results = {}

    # TODO: For each sequence in the dictionary, calculate:
    # - Length
    # - Molecular weight
    # - Number of hydrophobic residues
    # - Charged residue counts (positive and negative)
    # - Any motifs of interest (optional)

    # Hint: Use the functions from sequence_utils module
    # Hint: Store results in a nested dictionary structure like:
    # results[header] = {
    #     'length': ...,
    #     'molecular_weight': ...,
    #     'hydrophobic_count': ...,
    #     'positive_charge': ...,
    #     'negative_charge': ...
    # }

    for header, sequence in sequences.items():
        # TODO: Implement analysis for each sequence
        pass

    return results


def write_results(results, output_file="analysis_results.txt"):
    """
    Write analysis results to a file.

    Args:
        results (dict): Results dictionary from analyze_sequences()
        output_file (str): Output filename
    """
    # TODO: Write results to a file
    # Format the output nicely so it's easy to read
    # Include all the analysis metrics

    try:
        with open(output_file, 'w') as f:
            f.write("Protein Sequence Analysis Results\n")
            f.write("=" * 70 + "\n\n")

            # TODO: Write each sequence's results
            # Example format:
            # Sequence: protein_name
            #   Length: 150 aa
            #   Molecular Weight: 16543.21 Da
            #   Hydrophobic residues: 45
            #   Positive charges: 12
            #   Negative charges: 15
            #   Net charge: -3
            #
            pass

        print(f"\nResults written to {output_file}")

    except Exception as e:
        print(f"Error writing results: {e}")


# Main program
if __name__ == "__main__":
    print("Protein Sequence Analysis Tool")
    print("=" * 70)

    # Check if a filename was provided
    if len(sys.argv) < 2:
        print("\nUsage: python analyze_sequence.py <fasta_file>")
        print("Example: python analyze_sequence.py sample.fasta")
        sys.exit(1)

    filename = sys.argv[1]
    print(f"\nAnalyzing sequences from {filename}...")
    print("-" * 70)

    # Step 1: Read the FASTA file
    sequences = read_fasta(filename)

    if not sequences:
        print("Error: No sequences found or could not read file.")
        sys.exit(1)

    print(f"Successfully loaded {len(sequences)} sequence(s)\n")

    # Step 2: Analyze the sequences
    results = analyze_sequences(sequences)

    # Step 3: Print summary to console
    print("Analysis Summary:")
    print("-" * 70)
    for header in results:
        print(f"\nSequence: {header}")
        if results[header]:
            for key, value in results[header].items():
                print(f"  {key}: {value}")

    # Step 4: Write results to file
    print("\n" + "-" * 70)
    write_results(results)

    print("\n" + "=" * 70)
    print("Analysis complete!")
