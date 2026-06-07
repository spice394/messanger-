# CloudTalk

CloudTalk is a full-featured messenger app — real-time chat, voice/video calls, audio/video messages, and emoji reactions, with registration by unique nickname.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080, path /api)
- `pnpm --filter @workspace/cloudtalk run dev` — run the frontend (path /)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Tailwind CSS + framer-motion + wouter
- API: Express 5 + cookie-parser (session auth)
- DB: PostgreSQL + Drizzle ORM
- Auth: session tokens (HTTP-only cookies), bcryptjs for password hashing
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — API contract (source of truth)
- `lib/db/src/schema/` — DB tables: users, conversations, conversation_participants, messages, reactions, calls, sessions
- `artifacts/api-server/src/routes/` — auth, users, conversations, messages, calls
- `artifacts/api-server/src/middlewares/auth.ts` — session cookie middleware
- `artifacts/cloudtalk/src/` — React frontend

## Architecture decisions

- Session auth via HTTP-only cookies (no JWT exposure to JS)
- Nicknames are unique at the DB level (UNIQUE constraint on users.nickname)
- Conversations are always 1:1; participants stored in conversation_participants join table
- Polling (2s interval) for real-time feel without WebSockets on first build
- bcryptjs used for password hashing (10 rounds)

## Product

- Register/login by nickname + password
- 1:1 conversations with real-time-style polling
- Text, audio, video, image messages
- Emoji reactions on messages
- Audio/video call initiation with ringing, accept, reject, end flows
- Call history page
- User search by nickname to start new conversations

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- After editing `lib/api-spec/openapi.yaml`, always run codegen AND check `lib/api-zod/src/index.ts` for TS2308 collisions (Orval generates `*Params` Zod schemas that can collide with TypeScript types from `generated/types/`). The fix: explicitly re-export types from `generated/types/` excluding the conflicting names.
- `lib/api-zod/src/index.ts` uses explicit named re-exports from `./generated/types` (not `export *`) to avoid TS2308 collisions with Zod schemas.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
