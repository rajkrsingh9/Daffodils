

## 1. PRODUCT IDENTITY

You are building a **mobile-first social + intent-matching application** called **Daffodils**.

### What it is
- A **moment-based companionship platform** — the core question it answers is: *"I want to do X at Y time — who's in?"*
- A **public social feed** where users publish content (posts) that build their personality profile over time.
- A **mutual-selection matching system** inspired by how cab-hailing platforms dispatch to nearby drivers — but applied to finding a human companion for a real-world activity.

### What it is NOT
- ❌ Not a dating app
- ❌ Not a generic social media app (no follower counts)
- ❌ Not a long-term friend discovery app

The social feed and the intent system are two layers of the same product. Posts tell people *who you are*. Intents tell people *what you want right now*.

---

## 2. TECH STACK

### Mobile (Frontend)
- **Framework:** React Native (Expo managed workflow)
- **Navigation:** Expo Router (file-based)
- **State management:** Zustand
- **API communication:** Axios + React Query
- **Real-time:** Socket.IO client
- **Maps/Geolocation:** `expo-location` + React Native Maps
- **Push notifications:** Expo Notifications (FCM/APNs)
- **Media upload:** Expo ImagePicker → Cloudinary (or S3-compatible)

### Backend
- **Runtime:** Node.js with Express.js
- **Language:** TypeScript
- **Real-time:** Socket.IO server
- **Auth:** JWT (access token 15 min + refresh token 30 days), bcrypt for passwords
- **File storage:** Cloudinary or AWS S3

### Database
- **Primary DB:** PostgreSQL (all relational data, all core tables below)
- **Geospatial:** PostGIS extension (for radius queries on intents and user locations)
- **Cache / Pub-Sub:** Redis (intent broadcast queuing, active user location TTL, session store)
- **ORM:** Prisma (with raw SQL fallback for PostGIS queries)

### Infrastructure
- **Backend hosting:** Railway or Render (containerised Node.js)
- **DB hosting:** Supabase (PostgreSQL + PostGIS pre-enabled) or Railway PostgreSQL
- **CDN:** Cloudinary for all media

### Authentication
- Facial record and authentication is neccessary for posting intents. Normal user can only build their personal profile and cannot create or join any intent.


### Specifications
- Like, Share and comment buttons
- Preview and Publish
- Follow /companionship_app_workflow.svg and /posts_profile_layer.svg


*Build Claymorphism UI* 

## 4. API SPECIFICATION

- Create proper API routes from backend to database and frontend.
### Base URL: `/api/v1`
### Auth header: `Authorization: Bearer <access_token>`

---

### AUTH

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/auth/register` | Register with phone or email + password |
| POST | `/auth/login` | Login → returns access + refresh tokens |
| POST | `/auth/refresh` | Rotate refresh token |
| POST | `/auth/logout` | Invalidate refresh token |
| POST | `/auth/otp/send` | Send OTP to phone |
| POST | `/auth/otp/verify` | Verify OTP → upgrade trust_tier |

---

## 6. COMPLETE SCREEN & NAVIGATION MAP

### Tab bar (5 tabs)
```
[🏠 Feed] [🗺 Around me] [➕ Create] [💬 Chat] [👤 Profile]
```

---

### Tab 1 — Feed
- **Home feed screen:** Infinite scroll of posts (Moment, Vibe Check, Activity Log, Wishlist types). Distance badge on each card. "Intent live 🟢" badge if poster has active intent.
- **Post detail screen:** Full post, like/dislike buttons, comment thread (threaded), reply input. Dislike shown as button only (no public count).
- **No repost button** anywhere in the app.

---

### Tab 2 — Nearby (Intent Map)
- **Map view:** Map (React Native Maps) with pins for active intents near current location.
- **List toggle:** Same intents as scrollable cards below the map.
- **Intent card:** Activity emoji, title, creator avatar + name, time, vibe tag, distance, group size remaining.
- **Intent detail screen:**
  - Full intent info + creator profile preview (photo, bio, trust tier badge, interest tags, avg rating, companions met)
  - Creator's recent posts (last 3, tappable)
  - "I'm in →" button → POST `/intents/:id/respond`
  - "Skip" → dismisses from feed (local state)

---

### Tab 3 — Create (modal, bottom sheet)
Two options presented:
1. **Create Post** → post type picker → compose screen
2. **Create Intent** → intent compose screen

**Intent compose fields:**
- Activity title (text input)
- Description (optional)
- Location (map picker or text search)
- Date & time picker
- Group size (stepper: 1–6)
- Vibe tag (chip selector: Casual / Energetic / Quiet / Adventurous)
- Broadcast radius (slider: 1–20 km)
- Expiry (segmented: 1h / 3h / 6h / Custom)
- Preview card → Publish

**Post compose fields:**
- Post type (chip: Moment / Vibe Check / Wishlist)
- Caption (text area, 280 char limit)
- Photo attach (ImagePicker, max 4 images)
- Location tag (optional)
- Wishlist posts: one-tap "Convert to Intent" button visible after posting

Activity Log posts are **auto-generated** by the server when a match is marked complete — both users get a draft they can optionally edit and publish (not forced).

---

### Tab 4 — Chat
- **Chat list screen:** All active chat rooms (match-based). Shows last message preview, match partner avatar, activity name, room expiry countdown.
- **Chat room screen:** Bubble UI, real-time Socket.IO. Image send supported. Location ping button (sends current coordinates as a message bubble with mini-map). Room header shows matched activity name + countdown timer.
- Expired rooms show read-only message history with "This conversation has closed" banner.

---

### Tab 5 — Profile (own) / Viewed profile (others)

**Own profile screen:**
- Header: avatar, name, username, city, bio, interest tags, trust tier badge
- Stats row: Companions met · Activities done · Avg rating · Posts
- Three tabs:
  - **Posts:** Grid or list of own posts
  - **Activity:** Past matched intents (completed, expired, cancelled)
  - **Reviews:** Ratings received from companions (reviewer name + score + text)
- Edit profile button → edit screen
- Settings → trusted contact, notifications, account

**Viewed profile screen (public, all profiles are public):**
- Same structure as own profile but no edit button
- "Report user" via kebab menu
- Posts tab shows their content → tappable to post detail
- Activity tab shows past completed intents (activity name, date, city)
- Reviews tab shows companion reviews they received

---

### Additional screens
- **Intent maker dashboard** (accessed from own active intent card):
  - Live list of yes-responders as profile cards (photo, name, distance, trust tier, avg rating, shared interests highlighted)
  - "Choose →" button on each card → triggers selection flow
  - After selection: status changes, waiting for responder confirmation
  - If responder declines → back to list, can choose another

- **Match confirmation screen** (appears for both users on match):
  - Shared plan summary (activity, location, time)
  - Both avatars + names
  - Safety tips bullet list
  - "Open Chat →" CTA

- **Post-activity rating screen** (triggered when match is ended):
  - 1–5 star tap rating
  - Optional short review text (140 chars)
  - Submit → updates both users' trust scores

- **Onboarding flow** (first launch, 5 screens):
  1. Welcome + value prop
  2. Phone number → OTP verify
  3. Build profile (name, username, city, photo)
  4. Interest tag picker (multi-select, min 3)
  5. Location permission request + notification permission request

---

## 7. BUSINESS LOGIC — CRITICAL RULES

### Intent lifecycle
```
ACTIVE → (broadcast sent) → responses collected → maker selects → 
responder confirms → MATCHED
ACTIVE → expires_at passes with no match → EXPIRED (auto, cron job)
ACTIVE → creator cancels → CANCELLED
```

### Trust score update (after each rating)
```
new_score = (current_score * activities_done + new_rating) / (activities_done + 1)
```
Rounded to 2 decimal places. Trust tier upgrades are manual (phone OTP = tier 2, ID upload reviewed = tier 3).

### Dislike privacy rules
- `dislike_count` is incremented in the `posts` table
- Never returned in any public API response
- Returned only in `GET /posts/me` (own posts)
- High dislike accumulation (> 10 dislikes on a post, or > 5 unique dislikers) → auto-flag for moderation queue; post stays live until reviewed

### Post daily cap
- Server checks: `SELECT COUNT(*) FROM posts WHERE author_id = $1 AND created_at > NOW() - INTERVAL '24 hours'`
- If count ≥ 3 → return `429 Too Many Requests` with message "Post limit reached for today"

### Broadcast blocking
- All intents/posts from blocked users are excluded from feeds and broadcasts in both directions
- `WHERE user_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = $currentUser) AND user_id NOT IN (SELECT blocker_id FROM blocks WHERE blocked_id = $currentUser)`

### Chat room expiry
- `chat_rooms.expires_at` = `intents.scheduled_at` + activity duration estimate + 2 hours buffer
- Cron job runs every 10 min: rooms past expiry are marked closed, no new messages accepted
- Message history retained for 30 days then purged

### SOS flow
- User taps SOS in-app
- Server immediately: (a) sends SMS to `trusted_contact.phone` via Twilio/SMS gateway, (b) sends push notification to trusted contact if they're also an app user, (c) creates a safety log entry
- Current GPS coordinates are included in the alert

---

## 8. REDIS USAGE

| Key pattern | Value | TTL |
|-------------|-------|-----|
| `user:loc:{userId}` | `{lat, lng}` JSON | 5 min (refreshed on each location update) |
| `intent:broadcast:{intentId}` | Set of notified user IDs | 24h |
| `session:{userId}` | refresh token hash | 30 days |
| `post:ratelimit:{userId}` | post count | 24h rolling |
| `otp:{phone}` | hashed OTP | 10 min |

---

## 9. ENVIRONMENT VARIABLES (`.env`)

```env
DATABASE_URL=postgresql://user:Minar@123@host:5432/dbname
REDIS_URL=redis://localhost:6379
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=30d
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
EXPO_ACCESS_TOKEN=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=
NODE_ENV=development
PORT=4000
CORS_ORIGIN=*
```

---

## 10. FOLDER STRUCTURE

### Backend
```
/backend
  /src
    /config         db.ts, redis.ts, env.ts
    /middleware     auth.ts, rateLimit.ts, errorHandler.ts
    /modules
      /auth         auth.router.ts, auth.service.ts, auth.controller.ts
      /users        users.router.ts, users.service.ts, users.controller.ts
      /intents      intents.router.ts, intents.service.ts, intents.controller.ts, broadcast.service.ts
      /posts        posts.router.ts, posts.service.ts, posts.controller.ts
      /matches      matches.router.ts, matches.service.ts, matches.controller.ts
      /chat         chat.router.ts, chat.service.ts, chat.gateway.ts (Socket.IO)
      /safety       safety.router.ts, safety.service.ts
      /notifications notifications.service.ts
    /jobs           expireIntents.job.ts, expireChatRooms.job.ts, syncLocations.job.ts
    /utils          geo.ts, pushNotification.ts, sms.ts, scoring.ts
    app.ts
    server.ts
  prisma/
    schema.prisma
  .env
```

### Mobile (React Native / Expo)
```
/mobile
  /app                          Expo Router file-based routes
    /(tabs)
      index.tsx                 Feed tab
      nearby.tsx                Intent map tab
      create.tsx                Create modal tab
      chat.tsx                  Chat list tab
      profile.tsx               Own profile tab
    /intent/[id].tsx            Intent detail
    /post/[id].tsx              Post detail
    /profile/[username].tsx     Viewed profile
    /chat/[matchId].tsx         Chat room
    /match/[id].tsx             Match confirmation
    /onboarding/                5 onboarding screens
    /auth/                      Login, register screens
  /components
    /intent    IntentCard, IntentCompose, ResponseCard, MakerDashboard
    /post      PostCard, PostCompose, CommentThread, ReactionBar
    /profile   ProfileHeader, ProfileTabs, ReviewCard, TrustBadge
    /chat      MessageBubble, ChatRoomHeader, LocationPing
    /shared    Avatar, TagChip, VibeTag, DistanceBadge, SOSButton
  /stores      authStore.ts, locationStore.ts, chatStore.ts (Zustand)
  /services    api.ts (Axios instance), socket.ts (Socket.IO client)
  /hooks       useLocation.ts, useNearbyIntents.ts, useFeed.ts
  /constants   theme.ts, config.ts
```

---

## 11. SECURITY REQUIREMENTS

- All routes (except `/auth/*`) require valid JWT
- Rate limiting on all endpoints: 100 req/min general, 10 req/min on auth endpoints
- Input validation via Zod on all request bodies (backend)
- XSS: sanitise all text inputs before storing
- Media uploads: validate MIME type server-side, accept only `image/jpeg`, `image/png`, `image/webp`, `video/mp4`
- Never return `dislike_count` in public API responses
- Blocked user exclusion applied at the query level, not application level
- OTP expires in 10 minutes, max 3 attempts before lockout (5 min)
- Refresh token rotation: old token invalidated on each refresh

---

## 12. BUILD SEQUENCE (implement in this order)

1. PostgreSQL schema + Prisma setup + PostGIS extension
2. Auth module (register, login, OTP, JWT)
3. User profile module
4. Location update endpoint + Redis integration
5. Intent CRUD + PostGIS broadcast query
6. Intent response + selection + match creation flow
7. Socket.IO server + chat module
8. Posts CRUD + feed algorithm
9. Post reactions + comments
10. Ratings + trust score update
11. Push notifications (Expo)
12. SOS + trusted contact
13. Cron jobs (intent expiry, chat room expiry)
14. Mobile: Onboarding + Auth screens
15. Mobile: Feed tab + post detail
16. Mobile: Nearby tab + intent detail + respond flow
17. Mobile: Create tab (post + intent compose)
18. Mobile: Maker dashboard + match confirmation
19. Mobile: Chat tab + chat room (Socket.IO)
20. Mobile: Profile screens (own + viewed)
21. Mobile: Notifications screen
22. Mobile: Safety (SOS button, trusted contact settings)
23. End-to-end testing of full intent → match → chat → rate loop

---

*End of build prompt. Every section above is a direct specification*
