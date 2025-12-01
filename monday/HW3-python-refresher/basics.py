#!/usr/bin/env python3
"""
HW3 Part 1: Python Basics Warmup
Complete the exercises below to refresh your Python fundamentals.
"""

# Exercise 1: String Reversal
# TODO: Write a function that takes a string and returns it reversed
# Hint: You can use slicing with [::-1] or a loop
def reverse_string(s):
    """
    Reverse a string.

    Args:
        s (str): Input string

    Returns:
        str: Reversed string

    Example:
        >>> reverse_string("ACDEF")
        'FEDCA'
    """
    # TODO: Implement this function
    pass


# Exercise 2: Character Counter
# TODO: Write a function that counts how many times each character appears in a string
# Use a for loop and a dictionary
def count_characters(s):
    """
    Count occurrences of each character in a string.

    Args:
        s (str): Input string

    Returns:
        dict: Dictionary mapping each character to its count

    Example:
        >>> count_characters("AACDE")
        {'A': 2, 'C': 1, 'D': 1, 'E': 1}
    """
    # TODO: Implement this function using a for loop
    pass


# Exercise 3: Amino Acid Composition
# TODO: Write a function that calculates the percentage composition of each amino acid in a protein sequence
# Return frequencies as percentages
def amino_acid_composition(protein_seq):
    """
    Calculate the percentage composition of each amino acid in a protein sequence.

    Args:
        protein_seq (str): Protein sequence (single letter amino acid codes)

    Returns:
        dict: Dictionary with amino acid percentages

    Example:
        >>> amino_acid_composition("AACCDDEE")
        {'A': 25.0, 'C': 25.0, 'D': 25.0, 'E': 25.0}
    """
    # TODO: Implement this function
    # Hint: Use count_characters() and calculate percentages
    pass


# Exercise 4: List Comprehension
# TODO: Write a function that filters sequences by minimum length using a list comprehension
def filter_sequences_by_length(sequences, min_length):
    """
    Filter a list of sequences to only include those with length >= min_length.
    Use a list comprehension!

    Args:
        sequences (list): List of protein sequence strings
        min_length (int): Minimum sequence length

    Returns:
        list: Filtered list of sequences

    Example:
        >>> filter_sequences_by_length(["AC", "ACDE", "A"], 2)
        ['AC', 'ACDE']
    """
    # TODO: Implement this using a list comprehension
    pass


# Test your functions
if __name__ == "__main__":
    print("Testing Python Basics Exercises")
    print("=" * 50)

    # Test Exercise 1
    print("\nExercise 1: String Reversal")
    test_string = "ACDEFGHIKLMNPQRSTVWY"
    print(f"Original: {test_string}")
    print(f"Reversed: {reverse_string(test_string)}")

    # Test Exercise 2
    print("\nExercise 2: Character Counter")
    test_string = "AACCDDEE"
    print(f"String: {test_string}")
    print(f"Counts: {count_characters(test_string)}")

    # Test Exercise 3
    print("\nExercise 3: Amino Acid Composition")
    protein = "MVHLTPEEKSAVTALWGKVNVDEVGGEALGRLLVVYPWTQRFFESFGDLSTPDAVMGNPKVKAHGKKVLGAFSDGLAHLDNLKGTFATLSELHCDKLHVDPENFRLLGNVLVCVLAHHFGKEFTPPVQAAYQKVVAGVANALAHKYH"
    print(f"Protein Sequence (first 50 aa): {protein[:50]}...")
    composition = amino_acid_composition(protein)
    print(f"Top 5 amino acids by frequency:")
    if composition:
        sorted_aa = sorted(composition.items(), key=lambda x: x[1], reverse=True)[:5]
        for aa, freq in sorted_aa:
            print(f"  {aa}: {freq:.2f}%")

    # Test Exercise 4
    print("\nExercise 4: Filter Sequences")
    sequences = ["AC", "ACDEFGHIKLM", "A", "DEFGHI", "GH"]
    min_len = 4
    print(f"Original sequences: {sequences}")
    print(f"Sequences with length >= {min_len}: {filter_sequences_by_length(sequences, min_len)}")

    print("\n" + "=" * 50)
    print("If you see results above, your functions are working!")
