# HW3: Python Refresher

## Overview

This assignment is designed as a Python refresher for biologists and bioinformaticians who may be a bit rusty. You'll complete a series of small exercises that build up to creating a simple sequence analysis tool. This assignment should take approximately 30-45 minutes to complete.

**IMPORTANT:** Each Python file contains function templates with `TODO` comments. Your job is to fill in the missing code where you see `# TODO:` comments. The scripts won't work until you complete the TODO sections!

You will:
1. Practice basic Python fundamentals
2. Write functions for biological sequence analysis
3. Read and parse FASTA files
4. Combine everything into a sequence analysis tool

## Prerequisites

- HW1 completed (Python environment set up)

## About Autograding

**Note:** This assignment has automated tests that run when you push your code. You'll see a score out of 100 points. **These points are just for feedback** - they help you know if your functions are working correctly. This is a bootcamp focused on learning, not grades!

## How to Complete This Assignment

Each Python file is a template with incomplete functions. Look for `# TODO:` comments - these mark where you need to write code. Read the docstrings and hints carefully, then implement the missing functionality.

**The scripts will not work until you complete the TODO sections!**

### Part 1: Python Basics Warmup (basics.py)

Open `basics.py` and **fill in the TODO sections** for these exercises:
- `reverse_string()` - Write a function to reverse a string
- `count_characters()` - Use a for loop to count characters in a string
- `amino_acid_composition()` - Create a dictionary to calculate amino acid percentages
- `filter_sequences_by_length()` - Use a list comprehension to filter sequences

**To test your work:**
```bash
conda activate bootcamp2025_HW1
python basics.py
```

If you see `None` or errors, you haven't completed all the TODOs yet!

### Part 2: Sequence Utilities (sequence_utils.py)

Open `sequence_utils.py` and **implement the TODO sections** for these bioinformatics functions:
- `molecular_weight()` - Calculate the molecular weight of a protein
- `count_hydrophobic()` - Count hydrophobic amino acids
- `find_motif()` - Find all positions of a motif in a sequence
- `count_charged_residues()` - Count positive and negative charges

**To test your work:**
```bash
python sequence_utils.py
```

The test cases at the bottom will only work once you've filled in all the TODOs!

### Part 3: FASTA File Parsing (read_fasta.py)

Open `read_fasta.py` and **complete the TODO sections** to:
- `read_fasta()` - Read and parse a FASTA file, storing sequences in a dictionary (header → sequence)
- `print_fasta_stats()` - Print basic statistics about the sequences

**To test your work:**
```bash
python read_fasta.py sample.fasta
```

You should see information about each protein sequence. If not, check your TODOs!

### Part 4: Sequence Analysis Tool (analyze_sequence.py)

Open `analyze_sequence.py` and **fill in the TODO sections** to create a complete analysis script:
- `analyze_sequences()` - Use your sequence_utils functions to analyze each protein
- `write_results()` - Write the analysis results to a file

This part brings together everything from Parts 1-3!

**To run your completed analysis:**
```bash
python analyze_sequence.py sample.fasta
```

This should create an `analysis_results.txt` file with your results. If it doesn't work, you're missing some TODOs!

## Submission

Once you've completed all exercises and generated the output file, commit your work:

```bash
# Add all your completed Python files and the output
git add basics.py sequence_utils.py read_fasta.py analyze_sequence.py analysis_results.txt

# Commit your work
git commit -m "Complete Python refresher exercises"

# Push to GitHub
git push
```

## Tips

- **Test frequently**: Run your code after each function to catch errors early
- **Use print statements**: Debug by printing intermediate values
- **Read the TODO comments carefully**: They contain hints and requirements
- **Don't worry about edge cases**: Focus on getting the basic functionality working
- **Ask for help**: If you're stuck, reach out!

## Expected Output

When you run `analyze_sequence.py`, you should see output similar to:

```
Analyzing sequences from sample.fasta...

Sequence: gene_example_1
  Length: 120 bp
  GC Content: 45.83%
  Reverse Complement: CGATCG...

Results written to analysis_results.txt
```

## Questions and Getting Help

We strongly encourage you to use our Slack workspace for questions and collaboration! One of the best ways to learn is by discussing problems with your peers and seeing how others approach challenges.

**Join the Bootcamp Slack channel**: https://rosettacommons.slack.com/archives/C09MXL9NBFB

In the Slack channel, you can:
- Ask questions and get help from fellow students
- Share tips and solutions you've discovered
- Learn from others' questions and answers
- Collaborate on troubleshooting issues

The TAs and I will be active in the Slack channel to help guide discussions and answer questions. Don't hesitate to jump in - chances are if you're stuck on something, others are too!

Of course, you're also welcome to email me directly at **icanderson@ucdavis.edu** if needed.
