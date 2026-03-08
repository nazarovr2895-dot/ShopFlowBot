---
name: logs
description: View Docker container logs for Flurai production services
disable-model-invocation: true
argument-hint: [backend | bot | worker | nginx | miniapp | admin | seller] [--lines N]
allowed-tools: Bash(docker *), Bash(ssh *)
---

# View Production Logs

Show Docker container logs for Flurai services.

## Usage

Parse `$ARGUMENTS` to determine service and line count.

### Service names:
| Argument | Container |
|----------|-----------|
| `backend` (default) | `backend` |
| `bot` | `bot` |
| `worker` | `worker` |
| `nginx` | `nginx` |
| `miniapp` | `miniapp` |
| `admin` | `admin` |
| `seller` | `seller` |
| `admin_bot` | `admin_bot` |
| `db` | `db` |
| `redis` | `redis` |

### Line count:
- Default: 100 lines
- `--lines N` or `-n N` → show N lines

## Command

```bash
docker compose -f docker-compose.prod.yml logs --tail=100 <service>
```

Or with custom line count:
```bash
docker compose -f docker-compose.prod.yml logs --tail=<N> <service>
```

### Follow mode (if requested):
```bash
docker compose -f docker-compose.prod.yml logs -f --tail=50 <service>
```

## Multiple Services

If user asks for all logs or multiple services:
```bash
docker compose -f docker-compose.prod.yml logs --tail=50 backend bot worker
```

## Container Status

If logs show issues, also run:
```bash
docker compose -f docker-compose.prod.yml ps
```

## Common Debugging

- **Backend errors**: Look for `ERROR` or `exception` in backend logs
- **502 errors**: Check nginx → backend connectivity, restart backend if needed
- **Bot issues**: Check bot logs for aiogram errors
- **DB issues**: Check db logs for connection/lock errors
