#!/usr/bin/env python3
"""
RosettaML Bootcamp 2025 - HW1: Environment Setup Verification
This script verifies that all required packages are installed correctly
and generates a verification file to be committed to your HW1 repository.
"""

import sys
import json
from datetime import datetime
import platform

def check_import(module_name, package_name=None):
    """
    Try to import a module and return success status with version info.

    Args:
        module_name: Name of the module to import
        package_name: Display name (if different from module_name)

    Returns:
        tuple: (success: bool, version: str, error_msg: str)
    """
    if package_name is None:
        package_name = module_name

    try:
        module = __import__(module_name)
        version = getattr(module, '__version__', 'unknown')
        return True, version, None
    except ImportError as e:
        return False, None, str(e)
    except Exception as e:
        return False, None, f"Unexpected error: {str(e)}"

def main():
    print("=" * 70)
    print("RosettaML Bootcamp 2025 - Environment Setup Verification")
    print("=" * 70)
    print()

    # List of required packages to check
    packages_to_check = [
        ('numpy', 'NumPy'),
        ('pandas', 'Pandas'),
        ('matplotlib', 'Matplotlib'),
        ('seaborn', 'Seaborn'),
        ('scipy', 'SciPy'),
        ('sklearn', 'scikit-learn'),
        ('Bio', 'Biopython'),
        ('pyrosetta', 'PyRosetta'),
    ]

    results = {}
    all_passed = True

    print(f"Python Version: {sys.version}")
    print(f"Platform: {platform.platform()}")
    print()
    print("Checking package installations...")
    print("-" * 70)

    for module_name, display_name in packages_to_check:
        success, version, error = check_import(module_name, display_name)
        results[display_name] = {
            'installed': success,
            'version': version,
            'error': error
        }

        status = "✓ PASS" if success else "✗ FAIL"
        version_str = f"(v{version})" if version else ""

        print(f"{status:8} {display_name:20} {version_str}")

        if not success:
            print(f"         Error: {error}")
            all_passed = False

    print("-" * 70)
    print()

    # Generate verification file
    verification_data = {
        'student_name': 'REPLACE_WITH_YOUR_NAME',
        'timestamp': datetime.now().isoformat(),
        'python_version': sys.version,
        'platform': platform.platform(),
        'packages': results,
        'verification_passed': all_passed
    }

    output_file = 'verification_result.json'

    try:
        with open(output_file, 'w') as f:
            json.dump(verification_data, f, indent=2)

        print(f"✓ Verification file created: {output_file}")
        print()

        if all_passed:
            print("🎉 SUCCESS! All packages are installed correctly!")
            print()
            print("Next steps:")
            print("1. Open 'verification_result.json' and replace 'REPLACE_WITH_YOUR_NAME' with your actual name")
            print("2. Create a new repository on GitHub named 'HW1'")
            print("3. Commit this verification file to your HW1 repository:")
            print("   git add verification_result.json")
            print("   git commit -m 'Add environment verification'")
            print("   git push")
            print()
            return 0
        else:
            print("❌ FAILED! Some packages are missing or not installed correctly.")
            print()
            print("Please check the errors above and ensure:")
            print("1. You have installed Anaconda correctly")
            print("2. You have created the conda environment: conda env create -f environment.yml")
            print("3. You have activated the environment: conda activate bootcamp2025_HW1")
            print("4. If PyRosetta failed, make sure the RosettaCommons channel is configured")
            print()
            return 1

    except Exception as e:
        print(f"❌ Error creating verification file: {e}")
        return 1

if __name__ == "__main__":
    sys.exit(main())
