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
Run `git status` and `git diff --stat` to show all changes.

### 2. Run critical tests
```bash
pytest backend/tests/test_services.py backend/tests/test_seller_web.py backend/tests/test_buyers.py backend/tests/test_admin.py -v --tb=short
```
If tests fail — **STOP**. Do not deploy. Show failures and ask user to fix.

### 3. Confirm with user
Show a summary:
- Files changed
- Test results (passed/failed count)
- Commit message: `$ARGUMENTS`

Ask the user to confirm before proceeding.

### 4. Deploy
```bash
./deploy.sh "$ARGUMENTS"
```

The deploy script will:
1. Commit with the provided message
2. Push to remote
3. SSH to server, pull, rebuild containers
4. Run Alembic migrations
5. Health-check all endpoints

### 5. Verify
After deploy completes, report the health check results from deploy.sh output.

## Commit Message Convention

Must follow conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`

Examples:
- `feat: добавить фильтр по районам`
- `fix: исправить расчёт комиссии`
- `refactor: вынести cart logic в сервис`

## Important

- **Never skip tests** before deploy
- If `$ARGUMENTS` is empty, ask the user for a commit message
- The deploy script handles everything — don't run individual docker/ssh commands
- Reference: `deploy.sh`, `startup.sh`
