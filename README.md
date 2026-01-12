# Server (Express + Prisma + Realtime)

## Setup

1. Install deps:

```bash
cd server
npm install
```

2. Create a `.env` (copy from `env.example`) and set `DATABASE_URL`.

3. Generate Prisma client:

```bash
npm run prisma:generate
```

4. Run dev server:

```bash
npm run dev
```

## API

- `GET /health`
- `GET /api/orders`
- `POST /api/orders`
- `PUT /api/orders/:id/status`

## Realtime (Socket.IO)

- Connect to Socket.IO on the same host/port as the API.
- Optional: emit `join` with `{ branchId }` to receive branch-scoped updates.
- Server emits:
  - `order:created`
  - `order:updated`




