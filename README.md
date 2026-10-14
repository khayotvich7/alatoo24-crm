# Alatoo CRM

One Node.js service: the API the mobile app talks to, the SQLite database, and the CRM web panel.

- `server/` – Fastify API (`/api/...`), SQLite through Node's built-in `node:sqlite`, uploaded photos in `/uploads`.
- `web/` – CRM panel (React + Vite), built into `server/public` and served by the same process.

## Run locally

```bash
npm run build
PORT=4000 npm start
```

Open http://localhost:4000. Without `ADMIN_PASSWORD` a password is generated into `server/data/admin-password.txt`.

## Environment (Railway → Variables)

| Variable | Purpose |
| --- | --- |
| `ADMIN_PASSWORD` | CRM login password (required in production) |
| `SESSION_SECRET` | Long random string that signs CRM sessions |
| `DATA_DIR` | Where the database and photos live; point it at a mounted volume, e.g. `/data` |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Optional: post every new order to a Telegram group |

The mobile app finds the server through `EXPO_PUBLIC_API_URL`.
