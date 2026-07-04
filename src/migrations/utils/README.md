# Migration table-name safety

If you're writing a migration that loops over a **list of table names** (e.g. to add/backfill
a column across many child tables), use `assertTableExists(queryRunner, tableName)` from
`safe-table-ops.ts` before the DDL, instead of wrapping the DDL in a bare `try {} catch {}`.

A bare catch silently no-ops if the table name has a typo (wrong singular/plural, misspelling)
— the migration reports success, but that one table never gets migrated, and nothing tells you.
This has already happened four times in this codebase's history (see
`1847000000000-FixInstituteHouseMemberInstituteIdType.ts` for one example that was found and
patched after the fact). `assertTableExists` turns that same mistake into an immediate, loud
migration failure at the exact table that has the wrong name, instead of a silent gap discovered
weeks or months later.
