# Accounting System Backup and Recovery

## Current status

Since 2026-10-04 Firebase project `crm---acounting-sg` (Firestore `(default)`, location
`nam5`) has managed recovery enabled:

| Protection | Setting |
| --- | --- |
| Point-in-Time Recovery (PITR) | Enabled: any minute of the last 7 days |
| Daily scheduled backup | Retained 14 days |
| Weekly scheduled backup (Friday) | Retained 14 weeks |

Not covered by these backups:

- Firebase Authentication accounts: export separately with
  `firebase auth:export users.json --project crm---acounting-sg`.
- Source code and the website: in GitHub; redeploy with the Actions workflow.

The manual ZIP backup on the Exports page (below) still works and is useful
before risky changes.

## Create a manual backup

1. Sign in with an administrator account.
2. Open the Exports page (`/exports`).
3. Choose the full system backup action.
4. Store `SG_FULL_PACKUP_<date>_<time>.zip` in an encrypted location outside
   the computer running the system.

The package contains `SYSTEM_RESTORE_DATA_DO_NOT_EDIT.json`, collection
reports, and a contacts export. It includes personal and operational data and
may include subscription account credentials, so treat it as a secret.

## Restore a manual backup

1. Create a fresh backup of the current state first.
2. From the Exports page, choose Restore and select the ZIP.
3. Confirm only after verifying the ZIP project is `crm---acounting-sg`.
4. Wait for the success message and reload.
5. Verify users, bookings, payments, installments, forms, and subscriptions.

Restore replaces every collection included in that backup. Do not edit the
JSON inside the ZIP.

## Firebase managed recovery

Run these in Cloud Shell as a project owner.

### Check backups

```bash
gcloud firestore backups schedules list --database='(default)' --project=crm---acounting-sg
gcloud firestore backups list --project=crm---acounting-sg
```

### Restore a scheduled backup

A backup is restored into a **new** database; the live `(default)` database is
not touched.

```bash
gcloud firestore databases restore \
  --source-backup=projects/crm---acounting-sg/locations/nam5/backups/BACKUP_ID \
  --destination-database=restored-YYYYMMDD \
  --project=crm---acounting-sg
```

### Recover data from a point in time (last 7 days)

Clone the database as it was at a given minute into a new database:

```bash
gcloud firestore databases clone \
  --source-database='projects/crm---acounting-sg/databases/(default)' \
  --snapshot-time='2026-10-04T18:00:00Z' \
  --destination-database=pitr-YYYYMMDD \
  --project=crm---acounting-sg
```

### After restoring

1. Inspect the restored database in the Firebase Console and compare it with
   the live data.
2. Either copy back only the documents that were lost, or point the app at
   the restored database (a code change in `firebase.ts` and the Cloud
   Functions, then redeploy). Plan this cutover before doing it.
3. Delete the temporary database when done to avoid storage cost.

### Recommended extra protection

Delete protection is currently disabled. Enable it so the database cannot be
deleted by mistake:

```bash
gcloud firestore databases update --database='(default)' --delete-protection --project=crm---acounting-sg
```

Firebase Console path: `Firestore Database > Disaster recovery`

`https://console.firebase.google.com/project/crm---acounting-sg/firestore/databases/-default-/disasterrecovery`
