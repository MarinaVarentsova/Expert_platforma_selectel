# Migration 0003 — Drop palata_expert_documents

## Status

**PENDING** — migration has not yet been applied to the production Selectel PostgreSQL database.  
The Selectel managed DB is on a private network (192.168.0.216:5432) not reachable from the Replit development environment.

## How to apply

Run from a machine that has network access to the Selectel cluster (e.g. from the Selectel console, a bastion host, or your local machine connected via Selectel network):

```bash
# Option A — use the Node.js runner (checks row count before dropping)
PALATA_DATABASE_URL="<connection string>" \
  node artifacts/palata/migrations/run_0003_drop_expert_documents.js

# Option B — use psql directly (manually verify COUNT first)
psql "$PALATA_DATABASE_URL" -c "SELECT COUNT(*) FROM public.palata_expert_documents;"
# If count = 0:
psql "$PALATA_DATABASE_URL" -f artifacts/palata/migrations/0003_drop_expert_documents.sql
```

## Record of execution

| Field          | Value |
|----------------|-------|
| Applied by     | — |
| Applied at     | — |
| Row count seen | — |
| Method used    | — |
| Outcome        | — |

<!-- Fill in this table after the migration runs successfully. -->
