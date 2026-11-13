# Invite-only user access

There is no public account registration endpoint in this application. New accounts are created by an authenticated Admin using the existing user-management screen, which calls `POST /api/users`.

- Choose a unique username.
- Use a strong password of at least 10 characters and share it with that user through a private channel.
- Assign `staff` for ordinary inventory and transaction work.
- Assign `admin` only when the person must manage users, restore backups, or change administrative settings.
- Never share the initial Admin password with Staff.
- Remove access by changing the user's password or using the account-management controls where available. Review the Admin audit log regularly.

Anyone can download the APK or open the website, but only invited accounts can sign in and access protected stock data.
