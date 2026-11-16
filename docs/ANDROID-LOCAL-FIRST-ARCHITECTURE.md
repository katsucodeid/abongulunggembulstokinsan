# Android Local-First Migration Architecture

Status: implementation plan; no production data or Termux installation has been changed.

## Product requirements

- The Android app launches from its icon and does not require Termux.
- The phone is the authoritative primary store. Stock, transactions, users, settings, and audit history remain available without an internet connection.
- Synchronization is opt-in. A device must never silently replace newer local data with a remote snapshot.
- Existing Termux and hosted workflows remain available during migration.
- Daily TXT reports continue to be written to `Download/Abon Gulung Gembul/Laporan/` through Android MediaStore on Android 10+.

## Proposed architecture

1. **Native Android application** owns lifecycle, notifications, alarms, secure storage, backup/restore, and permission prompts.
2. **Local database** uses SQLite (Room) in the app-private data directory. Database writes are transactional; stock changes and their audit records commit together.
3. **Business rules** are enforced by the local data layer, not only by JavaScript UI controls. This includes non-negative stock, role authorization, transaction idempotency, corrections, and audit history.
4. **Bundled UI** is packaged inside the APK and loaded from Android's local asset origin. No Termux process, public website, or internet connection is required to open the app or use core stock features.
5. **Optional sync adapter** is isolated from normal local operations. It exchanges versioned operations, not blind database replacements. Every operation has a stable ID, origin device ID, timestamp, and payload hash. Server/device acknowledgements are recorded locally.
6. **Conflict policy**: independent operations merge; edits/deletes against changed records are surfaced for review; stock is recomputed from accepted ledger operations inside a transaction. No last-write-wins overwrite for stock balances.
7. **Migration/import**: the existing JSON database format is imported once into SQLite with schema validation and a transaction. The original JSON is retained as a backup until the user confirms the imported counts and balances.

## Security requirements

- Store the database in app-private internal storage. Use Android Keystore-backed encryption for sensitive local secrets; do not put signing keys, API secrets, or passwords in the repository.
- Keep WebView navigation on the bundled app origin. Disable file access and arbitrary external navigation; open external links with the system browser.
- Do not expose a broad JavaScript interface to arbitrary web content.
- Request notification permission only when notifications are first enabled/needed. Use MediaStore for report exports; do not request broad all-files storage access.
- Request exact-alarm special access only if the user enables an exact alarm feature.
- Optional remote sync must use TLS, device pairing/revocation, least-privilege credentials, replay protection, and auditable acknowledgements.
- Play Protect and Play Store review outcomes cannot be guaranteed. Build reproducibly, verify dependencies, sign release APKs with a user-controlled release key, and publish privacy/data-safety disclosures where applicable.

## Delivery phases

### Phase 1 — Native offline foundation
- Add native SQLite schema, repository, transaction tests, and an importer for the current JSON data format.
- Bundle the frontend and replace the Termux-only startup dependency.
- Keep a read-only migration/backup path to the existing Termux data; never delete or overwrite it automatically.

### Phase 2 — Feature parity
- Port every existing API capability and authorization rule to the local data layer.
- Verify stock operations, corrections/rollback, reports, users/roles, settings, analytics, audit history, backup/restore, and alarms against fixtures and regression tests.

### Phase 3 — Optional synchronization
- Add explicit opt-in pairing and device management.
- Add incremental, idempotent operation sync and conflict review.
- Test offline edits, reconnect, duplicate delivery, interrupted sync, device revocation, and restore.

### Phase 4 — Release hardening
- Restrict permissions, run dependency/security checks, test supported Android versions and device architectures, verify APK signatures, and provide a migration guide.

## Acceptance criteria

- Fresh install launches and completes core stock workflows in airplane mode.
- Restarting/upgrading the app preserves local records.
- Import tests prove stock, transactions, users, settings, processed operation IDs, and audit records are preserved.
- Replaying the same operation cannot change stock twice.
- A failed database transaction leaves both stock and audit history unchanged.
- Sync disabled means no remote data exchange. Sync enabled never silently discards local operations.
- Existing Termux data is untouched unless the user explicitly starts an export/import flow.
