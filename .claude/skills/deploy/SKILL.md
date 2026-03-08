---
name: deploy
description: Deploy Flurai to production server. Runs pre-checks, tests, and deploy.sh.
disable-model-invocation: true
argument-hint: [commit-message]
---

# Deploy to Production

Deploy the application using the project's `deploy.sh` script.

## Steps

### 1. Show what will be deployed
Run `git status` and `git diff --stat` to show all changes (uncommitted + unpushed commits).

### 2. Run backend tests (only if backend changed)
Only run tests if there are **uncommitted** changes in `backend/`:
```bash
pytest backend/tests/test_admin.py backend/tests/test_buyers.py backend/tests/test_seller_web.py backend/tests/test_services.py backend/tests/test_payments.py backend/tests/test_categories.py -v --tb=short
```
If tests fail — **STOP**. Do not deploy. Show failures and ask user to fix.

If no backend changes — skip tests (deploy.sh also skips them).

### 3. Confirm with user
Show a summary:
- Files changed
- Test results (passed/failed count), or "skipped — no backend changes"
- Commit message: `$ARGUMENTS`

Ask the user to confirm before proceeding.

### 4. Deploy
```bash
./deploy.sh "$ARGUMENTS"
```

The deploy script handles:
1. Running backend tests (if backend changed)
2. Commit with the provided message (if uncommitted changes exist)
3. Push to remote (with auto `pull --rebase` on conflict)
4. SSH to server: pull, rebuild containers, restart
5. Run Alembic migrations
6. Health-check all endpoints

### 5. Verify
After deploy completes, report the health check results from deploy.sh output.

## Commit Message Convention

Must follow conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`

Examples:
- `feat: добавить фильтр по районам`
- `fix: исправить расчёт комиссии`
- `refactor: вынести cart logic в сервис`

## Important

- **Do not duplicate tests** — deploy.sh runs them itself for backend changes
- If `$ARGUMENTS` is empty, ask the user for a commit message
- deploy.sh handles push conflicts automatically (pull --rebase + retry)
- If deploy.sh fails mid-way, it's safe to re-run — it detects unpushed commits and continues from where it left off
