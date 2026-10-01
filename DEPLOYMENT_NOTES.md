# Deployment Notes

This project is automatically deployed to Hostinger using GitHub Actions.

Do not delete or modify:

.github/workflows/deploy.yml

The workflow runs automatically on every push to the main branch.

Deployment process:

1. Install dependencies:
   npm install

2. Build the project:
   npm run build

3. Upload the contents of the dist folder to Hostinger using FTP.

Credentials are stored in GitHub Actions Secrets:

- FTP_SERVER
- FTP_USERNAME
- FTP_PASSWORD

FTP configuration:

- FTP_SERVER = ftp.sabergroupacademy.com
- FTP_USERNAME = u570689065.acc
- FTP_PASSWORD = stored securely in GitHub Secrets only

Never hard-code FTP credentials in the project files.

## Cloud Functions (admin password reset)

The "Reset PW" button on the Users page calls the `adminResetPassword` Cloud
Function (`functions/index.js`). It is NOT deployed by the Hostinger workflow;
deploy it manually once (and again whenever `functions/` changes):

1. The Firebase project `crm---acounting-sg` must be on the Blaze plan.
2. `npm install -g firebase-tools` then `firebase login`
3. From the repo root: `cd functions && npm install && cd .. && firebase deploy --only functions`

What it does: an admin resets a user's password to `123456`, the user's
sessions are revoked, and `users/{uid}.mustChangePassword` is set to true.
On next login the app shows the Change Password screen until the user picks a
new password.
