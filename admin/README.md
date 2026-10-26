# CoVakeel Admin

Independent React + Vite administration application with its own Node.js API.

## Boundaries

- User/landing application: `../landing-page` with backend in `../landing-page/server`
- Admin application: this directory with backend in `./server`
- Admin API namespace: `/api/admin/*`
- Admin web development port: `5174`
- Admin API development port: `3010`

These boundaries keep user-facing and privileged admin routes from colliding.

## Local development

```bash
cp .env.example .env
pnpm install
pnpm dev
```

Open `http://127.0.0.1:5174`.

## Current scope

The admin application includes a responsive dashboard, protected administrator sessions, legal corpus counts and health checks for the user API and local legal AI service.

The Knowledge Base module reads CoVakeel's active index from the root `.env`. It supports document/content search, chunk inspection, PDF/DOC/DOCX/text ingestion, pending or reviewed status, and complete document deletion. Knowledge changes are written atomically. Restart the Legal AI service after a change because its corpus is loaded into memory at startup.

The Settings module provides:

- logo and brand-name management shared with the landing page and user workspace
- administrator name and email editing, protected by the current password
- password changes that revoke all active administrator sessions
- SMTP configuration used by the landing API for OTP and transactional email

On the first local run, use the values from `ADMIN_INITIAL_EMAIL` and `ADMIN_INITIAL_PASSWORD`. Without an `.env` file, the local-only fallback is `admin@covakeel.local` / `Admin@12345`. The settings file is created under the ignored root `storage/admin/` directory. Changing those environment variables later does not overwrite an existing administrator. Production refuses to create its first administrator unless `ADMIN_INITIAL_PASSWORD` is explicitly configured.

Use the same strong `ADMIN_SETTINGS_SECRET` in both `admin/.env` and `landing-page/.env`; it encrypts the stored SMTP password. Set `COOKIE_SECURE=true` behind HTTPS in production. Role-based access control, durable session storage and audit logging should be completed before a multi-admin production launch.
