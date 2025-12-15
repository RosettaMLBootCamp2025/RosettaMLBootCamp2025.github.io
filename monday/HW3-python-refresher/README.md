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

## Verify Your Code

Since this is a self-guided activity, you can check your own work by running the provided tests.

To run the tests, execute the following command in your terminal:

```bash
pytest
```

If all tests pass (green), your code is correct! If any fail (red), read the error message to debug your solution.

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
