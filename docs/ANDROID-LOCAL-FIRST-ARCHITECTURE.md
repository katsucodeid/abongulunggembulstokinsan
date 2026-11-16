# Android Local-First Migration Architecture

Status: implementation plan; no production data or Termux installation has been changed.

## Product requirements

- The Android app launches from its icon and does not require Termux.
- The phone is the authoritative primary store. Stock, transactions, users, settings, and audit history remain available without an internet connection.
- Synchronization is opt-in. A device must never silently replace newer local data with a remote snapshot.
- Support both synchronization paths: direct connection over the same Wi-Fi/LAN and synchronization across different locations over the internet.
- New devices are enrolled by scanning a QR code and must be explicitly approved by an authorized admin. Scanning a QR code alone never grants access.
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

## Device pairing and synchronization

### Enrollment and admin approval

1. The new phone generates its own device identity/key pair locally. The private key stays protected by Android Keystore and is never placed in the QR code or sent to another device.
2. An already-authorized admin opens **Add device** and creates a short-lived, single-use pairing invitation. The invitation is shown as a QR code and contains only the minimum bootstrap data: pairing/session identifier, connection method/endpoint, expiry, and a cryptographic challenge or public-key fingerprint. It contains no permanent password, API key, or reusable access token.
3. The new phone scans the QR code, proves possession of its generated key, and sends an enrollment request. The request remains **pending** and cannot read or modify business data.
4. An authorized admin reviews the device name, fingerprint, requested role, and pairing context, then explicitly approves or rejects it. Approval is recorded in the audit log.
5. After approval, the devices establish their own scoped credentials. Invitations expire, are single-use, and can be cancelled. Admins can revoke a device at any time; revocation blocks future sync and requires a fresh approval to re-enroll.

### Same Wi-Fi / LAN

- Prefer a direct device-to-device connection on the same trusted local network, discovered by QR-provided endpoint or a local discovery mechanism.
- Authenticate both device identities and protect transport with TLS or an equivalently authenticated encrypted channel. Do not trust a device merely because it is on the same Wi-Fi.
- If the local network blocks peer-to-peer traffic, report that clearly and offer internet sync only if the user has enabled and configured it.

### Different locations / internet

- Use an authenticated TLS sync service as a relay/coordinator; do not expose a phone's local database or listening port directly to the public internet.
- Encrypt sync payloads end-to-end between approved devices where feasible. The relay should receive only the minimum routing and delivery metadata and encrypted operation envelopes, not reusable device secrets.
- Use short-lived access credentials, per-device scopes, rate limits, replay protection, and auditable acknowledgements. No anonymous public sync endpoint.
- Internet sync is separately opt-in and can be disabled without affecting local use or LAN sync.

### Sync correctness and recovery

- Sync only versioned, idempotent operations with stable operation IDs; never upload or download a whole database snapshot as an automatic replacement.
- Record per-device cursors/acknowledgements. Resume safely after app termination, network loss, or partial transfer.
- Detect concurrent edits and stock-ledger conflicts; show them for review rather than silently choosing the newest timestamp.
- Keep a local audit trail for pairing, approval, sync, conflict resolution, and revocation. Provide a way to inspect connected devices and remove/revoke them.
- Do not sync secrets, local authentication credentials, or private keys. Define explicit rules for which user/role records may be shared.

## Security requirements

- Store the database in app-private internal storage. Use Android Keystore-backed encryption for sensitive local secrets; do not put signing keys, API secrets, or passwords in the repository.
- Keep WebView navigation on the bundled app origin. Disable file access and arbitrary external navigation; open external links with the system browser.
- Do not expose a broad JavaScript interface to arbitrary web content.
- Request notification permission only when notifications are first enabled/needed. Use MediaStore for report exports; do not request broad all-files storage access.
- Request exact-alarm special access only if the user enables an exact alarm feature.
- Optional sync must use authenticated encryption in transit, device identity verification, explicit admin approval, per-device authorization, replay protection, revocation, and auditable acknowledgements. QR codes are temporary enrollment invitations, never permanent credentials.
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
- Implement QR invitations, pending enrollment, admin approval/rejection, device listing, and revocation.
- Implement direct LAN sync and separately opt-in internet relay sync.
- Add incremental, idempotent operation sync and conflict review.
- Test offline edits, reconnect, duplicate delivery, interrupted sync, expired/reused QR invitations, unauthorized enrollment, device revocation, and restore.

### Phase 4 — Release hardening
- Restrict permissions, run dependency/security checks, test supported Android versions and device architectures, verify APK signatures, and provide a migration guide.

## Acceptance criteria

- Fresh install launches and completes core stock workflows in airplane mode.
- Restarting/upgrading the app preserves local records.
- Import tests prove stock, transactions, users, settings, processed operation IDs, and audit records are preserved.
- Replaying the same operation cannot change stock twice.
- A failed database transaction leaves both stock and audit history unchanged.
- Sync disabled means no remote data exchange. LAN sync works without an internet connection when devices share a reachable local network.
- Internet sync works between different networks only after the user enables it and configures/uses the approved sync service.
- A scanned QR invitation leaves the new device pending until an authorized admin approves it; expired, reused, or revoked invitations cannot enroll a device.
- Revoking a device prevents future sync; local records remain available on that phone.
- Concurrent stock changes are detected and never silently overwritten.
- Existing Termux data is untouched unless the user explicitly starts an export/import flow.


## Implementation progress — Phase 1 foundation

Initial code has been added on `feature/android-local-first`:

- `LocalDatabase`: SQLiteOpenHelper schema for stock, users, full transaction JSON, processed operation IDs, audit entries, settings, metadata, and import receipts. Stock rows have a non-negative database constraint; transactions are indexed by date; WAL is enabled.
- `LegacyBackupImporter`: reads the existing `INSAN-STOCK-BACKUP` version 1 envelope, validates required collections, stock quantities, unique record IDs, and SHA-256 checksum, then imports in one SQLite transaction.
- The importer stores complete JSON for users, transactions, and audit rows so fields not yet modeled natively are not discarded. It also retains other root-level legacy fields and settings.
- Import is permitted only into an empty local database. A populated local database is never cleared or overwritten. A failed validation or failed SQL insert rolls back the entire import.
- Instrumentation tests cover a successful import, checksum rejection, and refusal to overwrite existing local data. CI compiles the Android instrumentation-test APK; execution on an emulator is a separate validation step. The first CI compile caught an incorrect SQLite insert overload, which has been corrected in the branch; the corrected commit is awaiting a fresh build.

**Not yet complete:** the launcher still uses the existing Termux-backed WebView. The importer is a foundation API and is not yet connected to a user-facing file picker/import screen. Do not install this branch as a standalone replacement or stop the existing Termux service until later phases implement native startup, local business logic, and full feature parity.

- A local-first launcher now offers two explicit paths: **Database Lokal (fondasi offline)** and **Mode Lama (Termux)**. The old Termux-backed WebView remains available as a migration fallback.
- The local database screen provides a system file picker for `.insanbackup`, imports on a background thread, and displays stock plus imported record counts. It clearly labels missing native business features rather than pretending feature parity.
- The importer now accepts and stores additional stock keys beyond the current five, rejects duplicate processed-operation IDs, caps input while streaming at 50 MB, and retains a complete legacy database JSON snapshot as a forward-compatibility safety net.
- The fixture test includes an extra future stock key to verify unknown stock fields are not silently discarded.
- CI has been expanded to run the instrumentation suite on an Android 35 emulator, in addition to building and verifying the APK.

- Android preview version is now `2.2.0-local-preview` (versionCode 6) so it is distinguishable from the current Termux-dependent release. This remains a development preview, not a production replacement.

- The importer numeric validator uses APIs compatible with the declared minimum Android API level 23; no reliance on `Double.isFinite` is required.
