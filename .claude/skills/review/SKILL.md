---
name: review
description: Review code changes against Flurai project conventions and common gotchas
disable-model-invocation: true
argument-hint: [file-or-branch]
allowed-tools: Bash(git *), Read, Grep, Glob
---

# Code Review — Flurai Conventions

Review code changes for project-specific issues that linters can't catch.

## What to Review

If `$ARGUMENTS` is provided:
- File path → review that specific file
- Branch name → `git diff main...$ARGUMENTS`

If no arguments:
- Review staged + unstaged changes: `git diff` and `git diff --cached`

## Checklist

Go through each item. Report violations with file path and line number.

### 1. Language
- [ ] All user-facing strings are in **Russian** (error messages, labels, notifications)
- [ ] Comments can be Russian or English

### 2. Photo ID vs File ID
- [ ] `photo_id` / `photo_ids` fields contain paths (`/static/uploads/products/...`), NOT Telegram file_id
- [ ] Mini App won't display Telegram file_id — this is a critical bug if wrong

### 3. Financial Precision
- [ ] Prices use `Decimal` type, not `float`
- [ ] Rounding: `ROUND_HALF_UP`
- [ ] Display: `_fmt_price(value)` → `"5 500 ₽"`

### 4. Authentication
- [ ] `seller_web` endpoints use `require_seller_token` (at router level, NOT per-endpoint)
- [ ] `admin` endpoints use `require_admin_token`
- [ ] `public` endpoints use `get_current_user()` or `get_current_user_optional()`
- [ ] No auth secrets hardcoded

### 5. Error Handling
- [ ] `logger.exception()` in except blocks (NOT `logger.error()` — need stack trace)
- [ ] `await session.commit()` after all mutations
- [ ] `await session.rollback()` in except blocks after mutations
- [ ] HTTPException with proper status codes

### 6. Notifications
- [ ] Uses `resolve_notification_chat_id()` (NOT sending to `seller_id` directly)
- [ ] Uses `_escape()` for user input in HTML messages
- [ ] Uses `_fmt_price()` for prices
- [ ] Seller notifications use `ADMIN_BOT_TOKEN`, buyer notifications use `BOT_TOKEN`

### 7. Security
- [ ] No hardcoded URLs, tokens, or secrets
- [ ] No SQL injection (use SQLAlchemy ORM, not raw strings)
- [ ] User input is validated/escaped
- [ ] File uploads validate extensions and size

### 8. Tests
- [ ] New endpoints have corresponding tests
- [ ] Tests use `@pytest.mark.asyncio`
- [ ] Tests use proper auth headers (`seller_headers()`, `get_auth_header_for_user()`)

### 9. Conventions
- [ ] Conventional commit message (`feat:`, `fix:`, `refactor:`, etc.)
- [ ] Python files: `snake_case.py`
- [ ] TypeScript files: `PascalCase.tsx` for components, `camelCase.ts` for utilities
- [ ] Imports: absolute from `backend.app.*`

### 10. Common Gotchas
- [ ] `VITE_API_URL` passed during frontend builds
- [ ] No `adminpanel/src/` usage (legacy directory)
- [ ] Seller token backward compat: old tokens may lack `owner` or `is_primary` fields

## Output Format

For each issue found:
```
[SEVERITY] file_path:line — Description
  Suggestion: how to fix
```

Severity levels: `[CRITICAL]`, `[WARNING]`, `[INFO]`

End with a summary: `✓ N checks passed, ✗ M issues found`
