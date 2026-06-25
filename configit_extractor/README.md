Configit extractor

Usage:

1. Create and activate the virtual environment:

   cd "c:\Users\mcr932046\Downloads\Platform\configit_extractor"
   & ".\.venv\Scripts\Activate.ps1"

2. Install dependencies:

   pip install -r requirements.txt

3. Run the extractor:

   python extractor.py

4. Provide the work item id and product model code when prompted. You may either provide comma-separated family codes or leave that input blank to auto-discover families from the product model.

Notes:
- The default Configit base URL, API key, and SSL verification setting are already embedded in `config.py`.
- If you need to change them, edit `configit_extractor\config.py` directly.

Output:
- Writes `configit_extraction_<productModel>.json` with families and features.
