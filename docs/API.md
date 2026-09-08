# API contract and permissions

`server/src/` implements this contract as a real Express + SQLite backend. `src/local-api.js` still ships a browser-only, localStorage-backed adapter for offline/no-backend use — see [DEPLOYMENT.md](DEPLOYMENT.md) for when each one runs.

All responses are JSON. Successful responses are shaped `{ "data": { ... } }`; see [Error shape](#error-shape) below for failures.

## Authentication

| Route | Method | Access | Purpose |
| --- | --- | --- | --- |
| `/auth/register` | POST | Public | Create an account (`user` or `representative` only). |
| `/auth/login` | POST | Public | Start a session and return the current user. |
| `/auth/logout` | POST | Signed in | End the current session. |
| `/me` | GET/PATCH | Signed in | Read or update profile and preferences. |

Public registration can never grant `admin` or `coordinator` — attempting to do so returns `403 forbidden`. Admin is only ever granted by an existing administrator through `PATCH /admin/users/:id`. Passwords are hashed with bcrypt (`server/src/lib/auth.js`); sessions are a signed, `HttpOnly`, `SameSite=Lax` cookie (`Secure` in production) via `cookie-session` — there is no server-side session store, so nothing can be revoked mid-lifetime short of rotating `SESSION_SECRET`.

## Core resources

| Route | Methods | Minimum permission |
| --- | --- | --- |
| `/cases` | GET | Public |
| `/cases` | POST | Administrator |
| `/cases/:id` | GET | Signed in |
| `/cases/:id` | PATCH | Case coordinator or Administrator |
| `/cases/:id` | DELETE | Administrator only |
| `/cases/:id/workspace` | GET/PATCH | Signed in (PATCH: coordinator or Administrator) |
| `/cases/:id/invitations` | POST | Case coordinator or Administrator |
| `/cases/:id/members` | GET | Signed in |
| `/cases/:id/members` | PATCH | Case coordinator or Administrator |
| `/cases/:id/decisions` | GET/POST | Signed in (POST: coordinator or Administrator) |
| `/decisions/:id/comments` | GET/POST | Signed in |
| `/decisions/:id/vote` | POST | Signed in (one vote per user per decision; re-voting overwrites it) |
| `/decisions/:id/status` | PATCH | Case coordinator or Administrator |
| `/resources` | GET | Public |
| `/resources` | POST/PATCH/DELETE | Representative or Administrator |
| `/notifications` | GET/PATCH | Notification owner |
| `/files/upload` | POST | Signed in, subject to MIME type and size policy (25MB, `server/src/routes/uploads.js`) |
| `/files/:id` | GET | The file's owner or an Administrator |
| `/admin/users` | GET | Administrator |
| `/admin/users/:id` | PATCH | Administrator (changes `platformRole`) |
| `/admin/audit` | GET | Administrator (most recent 200 entries) |
| `/systems` | GET | Public |
| `/systems/:id` | GET | Public; aggregates primary and linked cases, impacts and pathways |
| `/systems/:id` | PATCH | Administrator |
| `/impacts` | GET | Public; optionally filtered by `systemId` |
| `/impacts/:id` | GET | Public; aggregates linked systems, cases and child pathways |
| `/impacts` | POST | Administrator |
| `/impacts/:id` | PATCH | Administrator |
| `/hazards` | GET | Public |
| `/cases/:id/baseline` | GET | Case member or Administrator |
| `/cases/:id/baseline/comments` | GET/POST | Case member or Administrator |
| `/cases/:id/steps` | GET | Case member or Administrator |
| `/cases/:id/steps/:step` | PATCH | Case coordinator or Administrator |
| `/cases/:id/futures` | GET/POST | Case member or Administrator |
| `/cases/:id/futures/:futureId/replies` | GET/POST | Case member or Administrator |
| `/cases/:id/futures/:futureId/vote` | POST | Case member or Administrator |
| `/cases/:id/vision-elements` | GET/POST | Case member or Administrator |
| `/cases/:id/shared-vision` | GET/PUT | Case member (PUT: coordinator or Administrator) |
| `/cases/:id/theory-of-change` | GET/PUT | Case member (PUT: coordinator or Administrator) |
| `/cases/:id/options` | GET/POST | Case member or Administrator |
| `/cases/:id/pathways` | GET/POST | Case member (POST: coordinator or Administrator) |
| `/cases/:id/pathways/comparison` | GET | Case member or Administrator |
| `/cases/:id/journey` | GET | Case member or Administrator; traceable end-to-end journey |

Browsing the case-study catalogue and the knowledge library (`GET /cases`, `GET /resources`) needs no session at all, matching the original local mock's behaviour. Opening a specific case study's full detail (`GET /cases/:id`) requires signing in — the catalogue only exposes the public summary fields (title, description, area, sector, status, member count); the frontend must prompt for login before navigating to a case's detail view, preserving the intended case so it can return there after login (see `src/runtime-enhancements.js`'s `guardCaseAccess`).

"Case coordinator" means a `case_members` row for that case with `role = 'coordinator'`; an account-wide `admin` always satisfies any case-scoped check too. Every mutating route derives the actor and role from the session (`req.session.userId` → a fresh `users` lookup) and never from the request body, and writes one `audit_log` row (`server/src/lib/audit.js`). `/decisions/*`, `/admin/*` are not aspirational — the actual frontend bundle calls all of them; the previous localStorage mock never implemented them and they 404'd silently.

## Connected resilience journey

Priority Systems, Climate Impacts, Case Studies and Pathways are one relational model rather than four copied catalogues:

```text
Priority System
  -> Climate Impact / Resilience Challenge
    -> Case Study
      -> Alternative Futures
      -> Vision Elements and published Shared Vision
      -> Theory of Change
      -> Adaptation Options
      -> Pathways
      -> Comparison and Preferred / Combined Direction
```

A Case Study stores one `impact_id`; that Impact owns its Primary System. Extra System associations are stored only in `case_linked_systems`, hazards only in `case_hazards`, and a Pathway always stores a required `case_study_id`. System and Impact endpoints calculate their Case Study and Pathway collections from those relationships. They do not accept separate copies of the same Case Study or Pathway. Consequently, editing the source Case Study changes every System/Impact view immediately. Soft-deleting it removes the Case Study and its child Pathways from every public aggregate while retaining their records for audit history; a later physical delete is protected by database foreign-key cascades.

The co-creation workspace follows eight server-backed steps: Baseline, Alternative Futures, Shared Vision, Theory of Change, Adaptation Options, Pathways, Compare & Prioritise, and Preferred/Combined Direction. Participants can contribute, reply, agree/disagree, build on ideas and assess pathways. Case coordinators additionally open/close activities, group/merge/highlight contributions, publish the Shared Vision, manage the Theory of Change, assemble Pathways and publish the final direction. Administrators retain platform taxonomy and Case Study creation/deletion authority.

There is no AFFiNE integration behind `/cases/:id/workspace` — it stores an opaque JSON blob (`case_studies.workspace_state`) that the frontend's board view reads/writes. The UI's "AFFiNE" copy and sync toggle are simulated client-side state, not a real integration (see [DEPLOYMENT.md](DEPLOYMENT.md)).

## Error shape

```json
{
  "error": {
    "code": "validation_error",
    "message": "Please correct the highlighted fields.",
    "fields": { "title": "Title is required." }
  }
}
```

`code` is one of `validation_error` (400), `unauthenticated` (401), `forbidden` (403), `not_found` (404), `conflict` (409), `rate_limited` (429) — see `server/src/lib/errors.js`. `fields` is present only for validation errors. `/auth/*` is rate-limited to 30 requests/minute per IP (`server/src/lib/rateLimit.js`); no other route is currently rate-limited.
