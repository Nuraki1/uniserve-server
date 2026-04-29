# Server environment variables

Set these in `nicecafe-server/.env` (do **not** commit secrets).

## Required

- `DATABASE_URL`: MySQL connection string, e.g.
  - `mysql://USER:PASSWORD@HOST:3306/restaurantinternal`
- `JWT_SECRET`: long random string (min 16 chars)

## Optional

- `PORT`: defaults to `4000`
- `CLIENT_ORIGIN`: e.g. `http://localhost:5173` (CORS; comma-separated for multiple origins)

## Bootstrap admin (optional)

- `BOOTSTRAP_TOKEN`: random string used to authorize `POST /api/auth/bootstrap-admin`

With a valid token, you can create **admin (owner) accounts** any number of times (each needs a unique email). Existing admins can also create more admins from the app via `POST /api/admin/users` with `role: "admin"`.

## Forgot password (email reset)

Users use **Forgot password?** on the login screen. The API sends a one-hour link if SMTP is configured.

- `PASSWORD_RESET_CLIENT_URL` (optional): full frontend base URL for reset links, e.g. `https://app.example.com` (no trailing slash). If omitted, the **first** entry from `CLIENT_ORIGIN` is used—set it explicitly in production if you use multiple origins.

**SMTP** (all are effectively required for reset emails to be sent):

- `SMTP_HOST`
- `SMTP_PORT` (default `587`)
- `SMTP_SECURE`: `true` or `1` for TLS on port 465; omit or `false` for STARTTLS on 587
- `SMTP_USER`
- `SMTP_PASS`
- `EMAIL_FROM` (optional; defaults to `SMTP_USER`)

After changing schema, run migrations so the `PasswordResetToken` table exists:

- `npm run prisma:migrate` (or `prisma migrate deploy` in your environment)
