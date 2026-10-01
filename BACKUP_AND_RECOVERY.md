# Accounting System Backup and Recovery

## Current status

As checked on 2026-10-01, Firestore Point-in-Time Recovery and scheduled
backups are not enabled for Firebase project `crm---acounting-sg`.

The application provides a manual full backup from the Exports page. This is
not uploaded automatically: the ZIP only exists in the browser's Downloads
folder (or the folder selected by the browser).

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

Firebase Console path:

`Firestore Database > Disaster recovery`

Direct project page:

`https://console.firebase.google.com/project/crm---acounting-sg/firestore/databases/-default-/disasterrecovery`

Recommended production policy:

- Enable Point-in-Time Recovery for short-window recovery.
- Add a daily scheduled backup with suitable retention.
- Add a longer-retention weekly backup.

These features add Firebase storage cost. A managed backup is restored into a
new Firestore database, so recovery must include validation and an application
cutover plan.
