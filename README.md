# Daffodils 🌼

A moment-based companionship platform. It answers one question — *"I want to do X at Y time, who's in?"* — and wraps it in a public social layer so you know who you're meeting.

Two layers of one product: **posts tell people who you are, intents tell people what you want right now.**

Not a dating app. Not a follower-count social network. Not long-term friend discovery.

---

## Repository layout

```
/backend     Node + Express + TypeScript API, Socket.IO, Prisma, PostGIS, Redis
/mobile      React Native (Expo SDK 57) app, Expo Router, Zustand, React Query
```

---

## Prerequisites

| Requirement | Notes |
|---|---|
| Node 20+ | built and tested on 22 |
| PostgreSQL 14+ | **with the PostGIS extension available** |
| Redis 6+ | broadcast sets, location TTL, sessions, OTP |

---

## Setup

### 1. Database

```bash
createdb daffodils
psql -d postgres -c "CREATE ROLE daffodils WITH LOGIN PASSWORD 'your-password' CREATEDB;"
psql -d daffodils -c "ALTER DATABASE daffodils OWNER TO daffodils;"
psql -d daffodils -c "CREATE EXTENSION IF NOT EXISTS postgis;"
```

### 2. Backend

```bash
cd backend
cp .env.example .env      # fill in DATABASE_URL and the two JWT secrets
npm install
npm run migrate           # postgis extension -> prisma db push -> GIST indexes + geom triggers
npm run seed              # optional: 6 people, 8 posts, 4 live intents around Kolkata
npm run dev               # http://localhost:4000
```

`npm run migrate` is the only correct way to apply schema changes — plain `prisma db push` skips the GIST indexes and the `geom` sync triggers that every radius query depends on.

### 3. Mobile

```bash
cd mobile
npm install
npx expo start
```

The app discovers the API from the host Metro is served on, so a physical device on the same network works with no configuration. Override with `EXPO_PUBLIC_API_URL` if needed.

Seeded accounts sign in with password `Daffodil1Pass` — try `priya_sen` or `meher_k`. All are face-verified and located around Kolkata, so set your simulator's location nearby to see the map populate.

---

## Verification

```bash
cd backend
npm run typecheck
npm run test:e2e          # 96 assertions against a running server, nothing mocked
```

The E2E suite walks the entire product loop as real HTTP and WebSocket traffic:

> register → face enrol → location → create intent → geofenced broadcast → respond → maker selects → responder confirms → match → chat → complete → activity-log draft → rate → trust score

It also asserts the negative cases that matter: unverified users cannot create or join intents, a stranger's face fails verification, the 4th post in 24h returns 429, `dislikeCount` never appears in a public response, blocked users vanish from feeds *and* the map, outsiders cannot read a conversation, and a rotated refresh token is dead on reuse.

```bash
cd mobile
npm run typecheck
npx expo export --platform android   # verifies the whole app bundles
```

---

## How the core mechanics work

### Intent lifecycle
```
ACTIVE ──broadcast──> responses collected ──maker selects──> responder confirms ──> MATCHED
ACTIVE ──expires_at passes──> EXPIRED        (cron, every minute)
ACTIVE ──creator cancels──> CANCELLED
```
Both sides must agree. The maker chooses from raised hands; the chosen person confirms. Only then does a match — and its chat room — exist.

### Geofenced broadcast
`users.geom`, `intents.geom` and `posts.geom` are `geography(Point,4326)` columns kept in sync with `lat`/`lng` by a Postgres trigger and indexed with GIST. Dispatch is a single `ST_DWithin` query over the intent's radius, cab-hailing style, capped at 500 targets.

An intent is only ever visible inside **its own** broadcast radius — a wide map viewport cannot surface an intent that was meant for a 1 km circle.

### Face verification gate
Spec requirement: a normal user builds a profile freely, but **creating or joining an intent requires a verified face.**

- The server issues a single-use liveness challenge (2 min TTL) with a random gesture.
- The client captures a frame, reduces it to a 128-float descriptor **on device**, and sends only that vector. The photo never leaves the phone.
- Matching is correlation distance (cosine over mean-centred vectors) against the enrolled descriptor.
- A failed check revokes the gate until the user re-verifies.
- `requireFaceVerified` reads the live DB flag rather than the JWT claim, so a revoked record takes effect immediately instead of after the 15-minute token expiry.

> ⚠️ **The bundled `local` provider is not face recognition.** It performs genuine vector matching and exercises the entire flow, but it cannot reliably tell two people apart. It is a working seam, not an identity control — set `FACE_PROVIDER=rekognition` and supply credentials before production. Swapping providers means implementing one interface in `face.provider.ts`; no routes, gates or schema change.

### Feed ranking
`distance · recency · shared interests · mutual activity history`, plus a small bonus for authors with a live intent. **Like counts never enter the score** — there are no follower counts and popularity is deliberately not a ranking signal.

### Privacy and guardrails
- `dislikeCount` is stripped in exactly one place (`toPublicPost`) so a new endpoint cannot leak it by omission. It is returned only from `GET /posts/me`.
- >10 dislikes or >5 unique dislikers auto-flags a post for moderation; the post stays live until reviewed.
- Blocked users are excluded **at the query level**, in both directions, inside the SQL itself.
- 3 posts per rolling 24h → `429 Post limit reached for today`.
- Chat rooms close at `scheduled_at + duration + 2h buffer`; history stays readable for 30 days, then is purged.
- **No repost anywhere.** "Share" produces an outbound deep link for the OS share sheet only.

---

## Design

Claymorphism, implemented as a system rather than a coat of paint: generous radii, a warm sand ground so white surfaces read as *raised clay*, a warm-toned drop shadow, and a light top edge (React Native has no inset shadow, so the highlight is a translucent top border). Buttons sink on press. Inputs invert the treatment to read as pressed *into* the surface.

All tokens live in [`mobile/constants/theme.ts`](mobile/constants/theme.ts).

---

## Known gaps

These are deliberate stopping points, not oversights:

1. **Media upload is not wired to a CDN.** The compose screens pick images and the API validates and stores URLs, but local `file://` URIs are filtered out before submission because the server cannot fetch them. Add Cloudinary credentials and an upload step to close this.
2. **The `local` face provider must be replaced before production** — see the warning above.
3. **Trust tier 3** (ID document review) has schema and badge support but no review queue UI; tier 2 via phone OTP is fully wired.
4. **The moderation queue** records flags but has no admin interface.
