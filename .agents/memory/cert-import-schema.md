---
name: Cert import schema
description: Supabase table structure and ETL function for the certificate registry importer
---

## Key tables (Supabase, not local Replit DB)

- `palata_certificates_import` — raw import staging table (certificate_number, expert_full_name, expertise_area, valid_to, certificate_status, load_status)
- `palata_certificates` — main registry (certificate_number, expert_full_name, specialty_code, valid_to, is_active)
- `palata_specialty_codes` — code → expertise_direction_id (table name: _specialty_, NOT _speciality_)
- `palata_expert_certificates` — expert_id, certificate_number, cert_valid_to, cert_direction_ids[], status ('verified'/'expired')
- `palata_expert_directions` — expert_id, expertise_direction_id (UNIQUE)
- `palata_certificate_import_logs` — per-import log
- `palata_expertise_directions` — reference: id, name, slug, is_active

## ETL RPCs (must be run in Supabase SQL Editor)

SQL migration: `supabase/cert_import_migration.sql`

- `truncate_certificates_import()` — clears staging
- `etl_process_certificate_import(p_file_name, p_created_by)` → jsonb — full ETL
- `get_cert_import_stats()` → jsonb — current registry counts

## Important

- executeSql (Replit tool) connects to LOCAL Replit PostgreSQL, NOT Supabase cloud
- All Supabase tables must be created via SQL Editor in Supabase dashboard
- Expert matching: normalize full_name (trim + lower + collapse spaces) in palata_users WHERE role='expert'
- Matching (matching.ts) uses: status='verified' AND cert_valid_to >= today AND cert_direction_ids ∋ direction_id

**Why:** The project uses Supabase (cloud) for the frontend and a local Replit PostgreSQL for the api-server/Drizzle. They are separate databases.
