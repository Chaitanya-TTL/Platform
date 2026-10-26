# Copilot Usage Ledger

Azure chat attempts append to `.lattice-data/copilot-usage.csv` by default. The CSV opens in Excel. Set `LATTICE_COPILOT_USAGE_LOG_PATH` to use another local path.

Each provider attempt gets a row, including retries, with UTC time, request ID, deployment, API version, attempt number, HTTP outcome, latency, Azure-reported token counts when present, and estimated USD cost when rates are configured. Rows for retries share the request ID and have different attempt numbers.

Cost estimates require both `AZURE_OPENAI_INPUT_COST_PER_1M_USD` and `AZURE_OPENAI_OUTPUT_COST_PER_1M_USD`. These are intentionally unset by default; use your company's approved rates. The estimate is calculated as `(prompt tokens * input rate + completion tokens * output rate) / 1,000,000`.

The ledger does not store prompts, model responses, or API keys. Protect the CSV according to your organization's data-handling policies. If the ledger cannot be written after a provider response, the client returns a `usage-ledger-error` and advises against automatic retry so a billed call is not silently treated as a normal success.