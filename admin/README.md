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

The foundation includes a responsive admin dashboard, legal corpus counts and health checks for the user API and local legal AI service.

The Knowledge Base module reads CoVakeel's active index from the root `.env`. It supports document/content search, chunk inspection, PDF/DOC/DOCX/text ingestion, pending or reviewed status, and complete document deletion. Knowledge changes are written atomically. Restart the Legal AI service after a change because its corpus is loaded into memory at startup.

Admin authentication, roles, audit logging and user management must be completed before deployment. The development server binds to localhost by default while those controls are unfinished.
