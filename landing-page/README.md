# CoVakeel Landing Page

React landing page based on the supplied `covakeel_landing.html`, with an Express API and PostgreSQL-ready enquiry storage.

## Stack

- React + Vite
- Node.js + Express
- PostgreSQL via `pg`
- Passwordless email OTP authentication via SMTP
- Authenticated workspace with searchable conversation history
- Streaming proxy to the local CoVakeel legal AI service
- Per-conversation PDF, Word, text and image attachments
- Shared logo and brand name managed from the admin Settings module

## Local development

```bash
cp .env.example .env
pnpm install
pnpm dev
```

- Frontend: `http://127.0.0.1:5173`
- API: `http://127.0.0.1:3001/api/health`

The page works without PostgreSQL, but the contact form will report that storage is not configured.

For local authentication testing, `.env` enables an in-memory development store and shows the OTP on the verification screen. Live environments must disable `AUTH_DEV_MODE`, configure PostgreSQL, set a strong `OTP_SECRET`, and provide SMTP settings. After verification the server redirects to `APP_URL`.

SMTP can be saved from the admin Settings screen. The admin API encrypts its password and the landing API uses it for OTP delivery. Keep `ADMIN_SETTINGS_SECRET` identical in both applications. Environment-based `SMTP_*` values remain available as a fallback.

The landing backend exposes a key-protected server-to-server signup listing for the separate admin API. Configure the same strong `ADMIN_INTERNAL_API_KEY` in both applications before deployment; the key is never sent to either React frontend.

The authenticated workspace is available at `/workspace`. In local mode its conversations last for the lifetime of the Node process. With PostgreSQL configured, users, sessions, conversations and messages persist across restarts.

Attachment uploads accept PDF, DOC, DOCX, TXT, Markdown, CSV, JSON, JPG, PNG and WebP files up to 15 MB each. PDF and document text is extracted locally and passed to the AI as untrusted reference material. Images are stored and shown in history; OCR is not enabled in the local text-model setup.

## PostgreSQL setup

Create a database and user, update `DATABASE_URL` in `.env`, then run:

```bash
psql "$DATABASE_URL" -f database/schema.sql
```

## Production

```bash
pnpm build
pnpm start
```

Express serves the built React app and API from port `3001` by default.

On the current local workspace, the bundled runtime can be used with:

```bash
bash scripts/start-local.sh
```
