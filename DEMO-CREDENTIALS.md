# Acoustic Sense: demo login credentials (DEMO ONLY)

App URL: http://localhost:3000/login

All accounts use the same password: **`AcousticDemo#2026`**

| Name | Email | Role | Sites | Can sign in? |
|---|---|---|---|---|
| Hamza Ranjha | `hamza.ranjha@acousticsense.local` | Admin | All sites | Yes |
| Faaiz Khan | `faaiz.khan@acousticsense.local` | Maintenance Engineer | Wah Plant | Yes |
| Ayesha Tariq | `ayesha.tariq@acousticsense.local` | Maintenance Engineer | Wah Plant, Taxila | Yes |
| Usman Ali | `usman.ali@acousticsense.local` | Viewer | Wah Plant | Yes |
| Bilal Ahmed | `bilal.ahmed@acousticsense.local` | Maintenance Engineer | Taxila | No (disabled) |

## What each role can do

- **Admin**: everything, including Users, Audit log, Settings, Register node and Rotate credentials.
- **Maintenance Engineer**: acknowledge, assign and resolve alerts, and recalibrate nodes, at their own sites only.
- **Viewer**: read-only. No action buttons. Users, Audit log and Settings show 403.
- **Disabled**: sign-in is refused. Shows the disabled-account case.

## Notes

- Five wrong passwords in a row lock the account for 15 minutes. As Admin, go to **Users** and click **Unlock** to clear it.
- `npm run seed -- --reset` sets every password back to `AcousticDemo#2026` and unlocks all accounts.
- To use a different demo password, set `DEMO_PASSWORD` in `.env.local` before seeding.
- New users created on the Users page get an email link instead of a password. The emails are saved in `dev-mail/*.eml`.
- These are local demo accounts only. Don't reuse this password anywhere real.
