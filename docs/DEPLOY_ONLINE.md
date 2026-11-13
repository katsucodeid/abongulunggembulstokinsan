# Deploy Abon Gulung Gembul Stok Insan Online

This repository can run as one online Node.js service on Render. The service serves both the web/PWA frontend and the JSON API from the same HTTPS origin. The Android WebView app loads that same URL.

## Architecture and important data note

- Render web service: Node.js/Express app.
- Persistent disk: mounted at `/var/data`; database file is `/var/data/data.json`.
- Invite-only accounts: there is no public signup route. An Admin creates each Staff/Admin account from the existing user-management screen.
- One service instance is intentional. The current JSON-file database is designed for a single Node.js process, not multiple replicas.
- The persistent disk requires a paid Render service plan. Do not change the service to a free plan or remove its disk; ephemeral files can be lost on redeploy/restart.

## Deploy

1. Push/merge the online deployment changes to the repository's `main` branch.
2. In Render, choose **New > Blueprint** and connect `katsucodeid/abongulunggembulstokinsan`.
3. Render reads `render.yaml`. Before creating the service, set the secret `ADMIN_PASSWORD` to a strong unique password (at least 10 characters). Keep `ADMIN_USERNAME` as `insanadmin` or change it.
4. Create the service and wait for the first deploy. The health endpoint should return JSON with `ok: true`:
   `https://gembul-stok-online.onrender.com/api/health`
5. Open `https://gembul-stok-online.onrender.com` and sign in with the admin credentials configured in Render.
6. Create Staff accounts from the app's user-management area. Do not share the Admin password.

## Existing local database migration

Do not overwrite a live database or reset stock to defaults.

1. On the old Termux installation, sign in as Admin and create a backup using the app's backup feature.
2. Download the `.insanbackup` file and keep an extra copy somewhere safe.
3. Deploy and initialize the online service, then sign in as its initial Admin.
4. Use the Admin restore feature to restore the backup. The restore operation creates a pre-restore safety backup on the persistent disk.
5. Verify stock quantities, transaction history, and user accounts before inviting other users.

If you need to migrate the old database's existing Admin account, the restored backup includes its users. The Render bootstrap Admin is only created when its username is not already present. Keep the original credentials securely.

## Android application

The Android WebView is configured to open the same HTTPS service URL. Rebuild the APK after merging the change using the repository's GitHub Actions workflow. Users can also open the website in a browser and install the PWA from the browser menu.

## Operations and security

- Keep `ADMIN_PASSWORD` and `JWT_SECRET` private. Never commit `.env`, database backups, or credentials.
- Create regular backups from the Admin screen and store copies outside the hosting provider.
- Do not enable multiple service instances while the app uses JSON file storage.
- If the service URL changes, update the Android `APP_URL` in `MainActivity.java` and rebuild the APK.
- The service is public on the internet, but application data and API routes require authentication. Admin-only routes remain restricted to Admin users.
