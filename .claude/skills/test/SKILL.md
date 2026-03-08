---
name: test
description: Run backend pytest tests — all, specific file, or critical subset
disable-model-invocation: true
argument-hint: [file-or-pattern | --critical]
allowed-tools: Bash(pytest *), Bash(cd *), Bash(python *)
---

# Run Backend Tests

Run pytest tests for the Flurai backend.

## Usage

Based on `$ARGUMENTS`:

### No arguments → run all tests
```bash
pytest backend/tests/ -v --tb=short
```

### File name → run specific test file
If `$ARGUMENTS` is a file name (e.g., `seller_web`, `orders`, `admin`):
```bash
pytest backend/tests/test_$ARGUMENTS.py -v --tb=short
```
If full path provided, use it directly.

### `--critical` → run the 4 critical test files (same as pre-commit hook)
```bash
pytest backend/tests/test_services.py backend/tests/test_seller_web.py backend/tests/test_buyers.py backend/tests/test_admin.py -v --tb=short
```

### `-k pattern` → run tests matching pattern
```bash
pytest backend/tests/ -v --tb=short -k "$ARGUMENTS"
```

## Available Test Files

- `test_services.py` — Business logic (53 tests)
- `test_seller_web.py` — Seller panel API (33 tests)
- `test_buyers.py` — Buyer API (31 tests)
- `test_admin.py` — Admin API (33 tests)
- `test_auth.py` — Authentication
- `test_orders.py` — Orders API
- `test_payments.py` — Payment processing
- `test_sellers.py` — Seller management
- `test_public.py` — Public catalog
- `test_categories.py` — Categories
- `test_integration.py` — End-to-end
- `test_load.py` — Performance
- `test_working_hours.py` — Working hours
- `test_multi_branch.py` — Multi-branch

## Notes

- Tests use in-memory SQLite — no external dependencies needed
- Run from project root directory
- If tests fail, show the full error output for debugging
