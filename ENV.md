# Server environment variables

Set these in `server/.env` (do **not** commit secrets).

## Required

- `DATABASE_URL`: MySQL connection string, e.g.
  - `mysql://USER:PASSWORD@HOST:3306/restaurantinternal`
- `JWT_SECRET`: long random string (min 16 chars)

## Optional

- `PORT`: defaults to `4000`
- `CLIENT_ORIGIN`: e.g. `http://localhost:5173` (CORS)

## One-time bootstrap (optional but recommended)

To create the **first admin** account (when there are no admins yet), set:

- `BOOTSTRAP_TOKEN`: random string used to authorize `/api/auth/bootstrap-admin`



