---
name: Palata Supabase-to-Postgres migration pattern
description: How partial (customer-only) Supabase-to-Postgres migrations were scoped in the palata artifact, for consistency in future migrations of the remaining expert/auth flows.
---

The palata artifact is being migrated table-by-table from Supabase to a PostgreSQL/Selectel DB (`PALATA_DATABASE_URL`, `pg.Pool` in `artifacts/palata/server.js`), not all at once.

**Decision:** when a migration request is scoped to one role/flow (e.g. "customer registration only"), but the underlying operation (email-existence check, `palata_users` insert, role lookup by id) is shared code used by both customer and expert flows, it's safe and expected to migrate the shared operation too — the query/table doesn't change, only the data source moves from Supabase to Postgres. Only genuinely role-exclusive writes (e.g. `palata_customer_profiles` vs `palata_expert_profiles`) must be kept strictly separated.

**Why:** Register.tsx and AuthCallback.tsx interleave shared pre-role-branch logic (dedupe check, base user row, role fetch) with role-specific branches (customer profile vs expert profile/certs/directions/regions). Treating "customer registration" as "only the customer branch" would leave the shared logic on Supabase, contradicting the explicit endpoint list requested (check-email, insert user, upsert profile, get role) and requiring a second later change for the same lines when expert migration lands.

**How to apply:** When scoping a partial migration, migrate shared plumbing operations that are already role-agnostic (same SQL regardless of role) if they're on the requested endpoint list, but never touch role-exclusive tables/branches outside scope (e.g. `palata_expert_profiles`, `palata_expert_directions`, `palata_expert_certificates`, `palata_expert_regions`, `palata_expertise_directions` select stay on Supabase until expert migration is explicitly requested). New backend endpoints for unauthenticated registration flows (pre-login) don't need `requireAdmin()`-style gating.
