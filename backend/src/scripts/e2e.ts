/**
 * End-to-end walk of the full product loop (build sequence step 23):
 *
 *   register → face enrol → location → create intent → broadcast →
 *   respond → maker selects → responder confirms → match → chat →
 *   complete → activity-log draft → rate → trust score
 *
 * Runs against a live server. Every assertion is a real HTTP/WS round trip;
 * nothing is mocked.
 */
import axios, { AxiosInstance } from 'axios';
import { io as ioClient, Socket } from 'socket.io-client';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:4000';
const API = `${BASE}/api/v1`;

/** Scopes every account this run creates, so runs never collide. */
const RUN_ID = Date.now().toString(36);

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    failures.push(label);
    console.log(`  ✗ ${label}${detail ? ` — ${JSON.stringify(detail)}` : ''}`);
  }
}

function section(title: string) {
  console.log(`\n▸ ${title}`);
}

/** Deterministic 128-d descriptor; `drift` simulates a fresh capture. */
function descriptor(seed: number, drift = 0): number[] {
  return Array.from({ length: 128 }, (_, i) => {
    const base = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
    return (base - Math.floor(base)) + (drift ? Math.sin(i) * drift : 0);
  });
}

const client = (token?: string): AxiosInstance =>
  axios.create({
    baseURL: API,
    validateStatus: () => true,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

interface Actor {
  name: string;
  username: string;
  phone: string;
  token: string;
  refreshToken: string;
  id: string;
  api: AxiosInstance;
  seed: number;
}

async function createActor(
  label: string,
  seed: number,
  lat: number,
  lng: number,
  interests: string[]
): Promise<Actor> {
  const username = `${label}_${RUN_ID}`.slice(0, 24);
  // Unique per run so repeated E2E runs never collide on the phone unique index.
  const phone = `+91${String(Date.now()).slice(-7)}${String(seed).slice(-3)}`;

  const anon = client();
  const res = await anon.post('/auth/register', {
    phone,
    password: 'Daffodil1Pass',
    name: label[0].toUpperCase() + label.slice(1),
    username,
    city: 'Kolkata',
    deviceId: `device-${username}`,
  });

  if (res.status !== 201) throw new Error(`register failed: ${JSON.stringify(res.data)}`);

  const token = res.data.data.accessToken;
  const api = client(token);

  await api.patch('/users/me', { interestTags: interests, bio: `${label} test actor` });
  await api.post('/users/me/location', { lat, lng });

  return {
    name: res.data.data.user.name,
    username,
    phone,
    token,
    refreshToken: res.data.data.refreshToken,
    id: res.data.data.user.id,
    api,
    seed,
  };
}

async function enrollFace(actor: Actor) {
  const challenge = await actor.api.post('/face/challenge');
  return actor.api.post('/face/enroll', {
    descriptor: descriptor(actor.seed),
    challengeToken: challenge.data.data.challengeToken,
  });
}

async function main() {
  console.log(`\n═══ Daffodils E2E — ${BASE} ═══`);

  section('health');
  const health = await axios.get(`${BASE}/health`, { validateStatus: () => true });
  check('server is up', health.status === 200, health.data);
  if (health.status !== 200) {
    console.error('\nServer is not running. Start it with: npm run dev');
    process.exit(1);
  }

  // ── actors ───────────────────────────────────────────────────────────
  section('accounts');
  // Park Street, Kolkata and two nearby points.
  const maker = await createActor('raj', 1001, 22.5535, 88.3520, ['coffee', 'walks', 'music']);
  const responder = await createActor('priya', 1002, 22.5560, 88.3495, ['coffee', 'books', 'walks']);
  const bystander = await createActor('arjun', 1003, 22.5600, 88.3550, ['football']);
  check('three accounts registered', Boolean(maker.id && responder.id && bystander.id));

  const me = await maker.api.get('/users/me');
  check('profile reads back with interests', me.data.data.interestTags.length === 3);

  // ── face gate ────────────────────────────────────────────────────────
  section('face verification gate (spec §2)');

  const ungatedIntent = await maker.api.post('/intents', {
    title: 'Coffee at Flurys',
    locationName: 'Flurys, Park Street',
    lat: 22.5535,
    lng: 88.352,
    scheduledAt: new Date(Date.now() + 3 * 3600_000).toISOString(),
    groupSize: 1,
    vibeTag: 'CASUAL',
    radiusKm: 5,
    expiresAt: new Date(Date.now() + 2 * 3600_000).toISOString(),
  });
  check(
    'unverified user CANNOT create an intent',
    ungatedIntent.status === 403 &&
      ungatedIntent.data.error?.code === 'FACE_VERIFICATION_REQUIRED',
    ungatedIntent.data
  );

  const noChallenge = await maker.api.post('/face/enroll', {
    descriptor: descriptor(maker.seed),
    challengeToken: '00000000-0000-4000-8000-000000000000',
  });
  check('enrolment without a live challenge is rejected', noChallenge.status === 400);

  const blankFrame = await (async () => {
    const c = await maker.api.post('/face/challenge');
    return maker.api.post('/face/enroll', {
      descriptor: new Array(128).fill(0.5),
      challengeToken: c.data.data.challengeToken,
    });
  })();
  check('featureless frame is rejected', blankFrame.status === 400, blankFrame.data);

  const enrolMaker = await enrollFace(maker);
  check('maker enrols a face record', enrolMaker.status === 201, enrolMaker.data);

  const enrolResponder = await enrollFace(responder);
  check('responder enrols a face record', enrolResponder.status === 201);

  const status = await maker.api.get('/face/status');
  check('face status reports verified', status.data.data.faceVerified === true);

  const reuse = await maker.api.post('/face/challenge').then((c) =>
    maker.api.post('/face/enroll', {
      descriptor: descriptor(maker.seed),
      challengeToken: c.data.data.challengeToken,
    })
  );
  check('double enrolment is blocked', reuse.status === 409, reuse.data);

  const liveCheck = await maker.api.post('/face/challenge').then((c) =>
    maker.api.post('/face/verify', {
      descriptor: descriptor(maker.seed, 0.002),
      challengeToken: c.data.data.challengeToken,
    })
  );
  check('same face passes verification', liveCheck.status === 200, liveCheck.data);

  const imposter = await maker.api.post('/face/challenge').then((c) =>
    maker.api.post('/face/verify', {
      descriptor: descriptor(9999),
      challengeToken: c.data.data.challengeToken,
    })
  );
  check(
    'different face fails verification',
    imposter.status === 403 && imposter.data.error?.code === 'FACE_VERIFICATION_FAILED',
    imposter.data
  );

  // The failed check revoked the gate — re-verify to continue.
  await maker.api.post('/face/challenge').then((c) =>
    maker.api.post('/face/verify', {
      descriptor: descriptor(maker.seed),
      challengeToken: c.data.data.challengeToken,
    })
  );
  const regained = await maker.api.get('/face/status');
  check('re-verification restores the gate', regained.data.data.faceVerified === true);

  // ── intent + broadcast ───────────────────────────────────────────────
  section('intent creation & geofenced broadcast');

  // Connected ahead of intent creation so we can catch the "nearby intent"
  // socket event the instant it fires and inspect the full card payload the
  // client-side popup renders straight off — no follow-up GET involved.
  const socket: Socket = ioClient(BASE, {
    auth: { token: responder.token },
    transports: ['websocket'],
  });
  const socketReady = await new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), 5000);
    socket.on('connect', () => {
      clearTimeout(timer);
      resolve(true);
    });
    socket.on('connect_error', () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
  check('authenticated socket connects', socketReady);

  const nearbyPopupEvent = new Promise<Record<string, unknown> | null>((resolve) => {
    const timer = setTimeout(() => resolve(null), 6000);
    socket.once('intent:nearby', (payload: Record<string, unknown>) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });

  const scheduledAt = new Date(Date.now() + 3 * 3600_000);
  const created = await maker.api.post('/intents', {
    title: 'Coffee at Flurys',
    description: 'Filter coffee and people-watching on Park Street.',
    activityEmoji: '☕',
    locationName: 'Flurys, Park Street',
    lat: 22.5535,
    lng: 88.352,
    scheduledAt: scheduledAt.toISOString(),
    groupSize: 1,
    vibeTag: 'CASUAL',
    radiusKm: 5,
    expiresAt: new Date(Date.now() + 2 * 3600_000).toISOString(),
  });
  check('verified user creates an intent', created.status === 201, created.data);

  const intentId = created.data?.data?.id;
  check('broadcast reached nearby users', (created.data?.data?.broadcast?.notified ?? 0) >= 2, created.data?.data?.broadcast);

  // The interactive "someone posted nearby" popup card renders entirely off
  // this one socket payload — verify it actually carries everything the
  // card needs, not just an id to go fetch.
  const nearbyPopup = await nearbyPopupEvent;
  check('intent:nearby fires with a full card payload', Boolean(nearbyPopup), nearbyPopup);
  check('popup payload names the right intent', nearbyPopup?.intentId === intentId);
  check(
    'popup payload embeds the creator profile',
    (nearbyPopup?.creator as { username?: string } | undefined)?.username === maker.username,
    nearbyPopup?.creator
  );
  check(
    'popup payload carries coordinates for the map',
    typeof nearbyPopup?.lat === 'number' && typeof nearbyPopup?.lng === 'number'
  );
  check(
    'popup payload knows the responder is already face-verified',
    nearbyPopup?.requiresFaceVerification === false,
    nearbyPopup
  );
  check(
    'popup payload carries a live distance label',
    typeof nearbyPopup?.distanceLabel === 'string' && (nearbyPopup.distanceLabel as string).length > 0,
    nearbyPopup?.distanceLabel
  );

  const dup = await maker.api.post('/intents', {
    title: 'Second intent',
    locationName: 'Park Street',
    lat: 22.5535,
    lng: 88.352,
    scheduledAt: scheduledAt.toISOString(),
    groupSize: 1,
    vibeTag: 'CASUAL',
    radiusKm: 5,
    expiresAt: new Date(Date.now() + 2 * 3600_000).toISOString(),
  });
  check('only one live intent per user', dup.status === 409, dup.data);

  const nearby = await responder.api.get('/intents/nearby', {
    params: { lat: 22.556, lng: 88.3495, radiusKm: 10 },
  });
  check('intent appears on a nearby user’s map', nearby.data.data.some((i: { id: string }) => i.id === intentId));

  const nearbyItem = nearby.data.data.find((i: { id: string }) => i.id === intentId);
  check('distance badge is computed', typeof nearbyItem?.distanceM === 'number' && nearbyItem.distanceM > 0, nearbyItem?.distanceLabel);

  const farAway = await responder.api.get('/intents/nearby', {
    params: { lat: 19.076, lng: 72.8777, radiusKm: 10 }, // Mumbai
  });
  check('intent does NOT leak outside its radius', !farAway.data.data.some((i: { id: string }) => i.id === intentId));

  const detail = await responder.api.get(`/intents/${intentId}`);
  check('intent detail exposes creator profile', detail.data.data.creator?.username === maker.username);
  check('intent detail lists shared interests', detail.data.data.sharedInterests.length >= 2, detail.data.data.sharedInterests);

  // ── respond → select → confirm ───────────────────────────────────────
  section('response, selection and match');

  const unverifiedRespond = await bystander.api.post(`/intents/${intentId}/respond`, {});
  check(
    'unverified user CANNOT join an intent',
    unverifiedRespond.status === 403 &&
      unverifiedRespond.data.error?.code === 'FACE_VERIFICATION_REQUIRED',
    unverifiedRespond.data
  );

  const respond = await responder.api.post(`/intents/${intentId}/respond`, {
    message: 'I am in! Been meaning to try Flurys.',
  });
  check('verified user responds "I\'m in"', respond.status === 201, respond.data);

  const respondTwice = await responder.api.post(`/intents/${intentId}/respond`, {});
  check('double response is blocked', respondTwice.status === 409);

  const selfRespond = await maker.api.post(`/intents/${intentId}/respond`, {});
  check('maker cannot respond to their own intent', selfRespond.status === 400);

  const dashboard = await maker.api.get(`/intents/${intentId}/responses`);
  check('maker dashboard lists the responder', dashboard.data.data.length === 1, dashboard.data);
  const responseCard = dashboard.data.data[0];
  check('responder card carries trust + distance', responseCard.responder.trustTier !== undefined && responseCard.distanceM !== null);
  check('shared interests highlighted on card', responseCard.sharedInterests.length >= 2, responseCard.sharedInterests);

  const notMine = await responder.api.get(`/intents/${intentId}/responses`);
  check('non-maker cannot read the dashboard', notMine.status === 403);

  const responseId = responseCard.id;
  const select = await maker.api.post(`/intents/${intentId}/select`, { responseId });
  check('maker chooses a companion', select.status === 200, select.data);

  // ── socket already connected above; confirm match events next ─────────
  section('realtime');

  const badSocket: Socket = ioClient(BASE, {
    auth: { token: 'not-a-real-token' },
    transports: ['websocket'],
  });
  const badRejected = await new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), 5000);
    badSocket.on('connect_error', () => {
      clearTimeout(timer);
      resolve(true);
    });
    badSocket.on('connect', () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
  check('socket rejects an invalid token', badRejected);
  badSocket.close();

  const matchEvent = new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), 6000);
    socket.on('match:confirmed', () => {
      clearTimeout(timer);
      resolve(true);
    });
  });

  const confirm = await responder.api.post(`/matches/responses/${responseId}/confirm`);
  check('responder accepts → match created', confirm.status === 201, confirm.data);

  const matchId = confirm.data?.data?.id;
  const roomId = confirm.data?.data?.chatRoom?.id;
  check('chat room opened with the match', Boolean(roomId));
  check('match confirmation carries safety tips', (confirm.data?.data?.safetyTips ?? []).length >= 4);
  check('match:confirmed pushed over socket', await matchEvent);

  const intentAfter = await maker.api.get(`/intents/${intentId}`);
  check('intent moved to MATCHED', intentAfter.data.data.status === 'MATCHED');

  // ── chat ─────────────────────────────────────────────────────────────
  section('chat');

  const joined = await new Promise<{ ok: boolean }>((resolve) => {
    socket.emit('room:join', roomId, (r: { ok: boolean }) => resolve(r));
    setTimeout(() => resolve({ ok: false }), 5000);
  });
  check('responder joins the chat room over WS', joined.ok);

  const incoming = new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), 6000);
    socket.on('message:new', (m: { body?: string }) => {
      if (m.body?.includes('6:30')) {
        clearTimeout(timer);
        resolve(true);
      }
    });
  });

  // chat:activity fires on the recipient's own user room (not the chat
  // room), so their "someone messaged you" toast can name the sender and
  // preview the text without a round trip back to the server.
  const chatToastEvent = new Promise<Record<string, unknown> | null>((resolve) => {
    const timer = setTimeout(() => resolve(null), 6000);
    socket.once('chat:activity', (payload: Record<string, unknown>) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });

  const sent = await maker.api.post(`/chat/rooms/${roomId}/messages`, {
    type: 'TEXT',
    body: 'See you at 6:30 outside Flurys!',
  });
  check('maker sends a message', sent.status === 201, sent.data);
  check('message delivered to the other party in realtime', await incoming);

  const chatToast = await chatToastEvent;
  check('chat:activity names the sender for the toast', chatToast?.senderName === maker.name, chatToast);
  check(
    'chat:activity previews the message text',
    typeof chatToast?.preview === 'string' && (chatToast.preview as string).includes('6:30'),
    chatToast?.preview
  );

  const ping = await responder.api.post(`/chat/rooms/${roomId}/messages`, {
    type: 'LOCATION',
    lat: 22.5561,
    lng: 88.3497,
  });
  check('location ping sends', ping.status === 201, ping.data);

  const outsider = await bystander.api.get(`/chat/rooms/${roomId}/messages`);
  check('outsider cannot read the conversation', outsider.status === 403, outsider.data);

  const history = await responder.api.get(`/chat/rooms/${roomId}/messages`);
  check('history returns system + both messages', history.data.data.items.length >= 3, history.data.data.items.length);

  const rooms = await responder.api.get('/chat/rooms');
  check('chat list shows the room with a partner', rooms.data.data[0]?.partner?.username === maker.username);
  check('room carries an expiry countdown', rooms.data.data[0]?.expiresInMs > 0);

  // ── posts ────────────────────────────────────────────────────────────
  section('posts, feed and reactions');

  const post1 = await maker.api.post('/posts', {
    type: 'MOMENT',
    caption: 'Filter coffee at Flurys today ☕',
    locationName: 'Park Street',
    lat: 22.5535,
    lng: 88.352,
  });
  check('post created', post1.status === 201, post1.data);
  check('dislikeCount is NOT in the create response', !('dislikeCount' in (post1.data.data.post ?? {})));

  await maker.api.post('/posts', { type: 'VIBE_CHECK', caption: 'Craving an evening walk' });
  const wishlist = await maker.api.post('/posts', {
    type: 'WISHLIST',
    caption: 'Someone take me to Teretti Bazaar',
  });
  check('third post still allowed', wishlist.status === 201);

  const capped = await maker.api.post('/posts', { type: 'VIBE_CHECK', caption: 'One too many' });
  check(
    'fourth post hits the daily cap with 429',
    capped.status === 429 && capped.data.error?.message === 'Post limit reached for today',
    capped.data
  );

  const quota = await maker.api.get('/posts/me/quota');
  check('quota endpoint reports 0 remaining', quota.data.data.remaining === 0, quota.data.data);

  const activityLogAttempt = await responder.api.post('/posts', {
    type: 'ACTIVITY_LOG',
    caption: 'trying to fake an activity log',
  });
  check('ACTIVITY_LOG cannot be created by hand', activityLogAttempt.status === 400);

  const feed = await responder.api.get('/posts/feed', {
    params: { lat: 22.556, lng: 88.3495, radiusKm: 20 },
  });
  check('feed returns nearby posts', feed.data.data.items.length >= 3, feed.data.data.items.length);
  check('feed items never carry dislikeCount', feed.data.data.items.every((p: object) => !('dislikeCount' in p)));
  check('feed items carry a distance badge', feed.data.data.items.every((p: { distanceM: number | null }) => p.distanceM !== null));
  check(
    'a matched intent no longer marks its author intent-live',
    feed.data.data.items
      .filter((p: { author: { username: string } }) => p.author.username === maker.username)
      .every((p: { authorHasActiveIntent: boolean }) => p.authorHasActiveIntent === false)
  );

  const postId = post1.data.data.post.id;

  const like = await responder.api.post(`/posts/${postId}/react`, { type: 'LIKE' });
  check('like registers', like.data.data.likeCount === 1 && like.data.data.myReaction === 'LIKE', like.data);

  const switchToDislike = await responder.api.post(`/posts/${postId}/react`, { type: 'DISLIKE' });
  check('switching to dislike drops the like', switchToDislike.data.data.likeCount === 0);
  check('dislike count is absent from the reaction response', !('dislikeCount' in switchToDislike.data.data));

  const publicView = await responder.api.get(`/posts/${postId}`);
  check('other users never see dislikeCount', !('dislikeCount' in publicView.data.data), Object.keys(publicView.data.data));

  const ownerView = await maker.api.get(`/posts/${postId}`);
  check('owner DOES see dislikeCount', ownerView.data.data.dislikeCount === 1, ownerView.data.data.dislikeCount);

  const ownList = await maker.api.get('/posts/me');
  check('GET /posts/me exposes dislikeCount', ownList.data.data.items.every((p: object) => 'dislikeCount' in p));

  const comment = await responder.api.post(`/posts/${postId}/comments`, { body: 'Their cream horns are unbeatable' });
  check('comment posts', comment.status === 201, comment.data);

  const reply = await maker.api.post(`/posts/${postId}/comments`, {
    body: 'Agreed!',
    parentId: comment.data.data.id,
  });
  check('threaded reply posts', reply.status === 201);

  const comments = await responder.api.get(`/posts/${postId}/comments`);
  check('comment thread nests the reply', comments.data.data[0]?.replies?.length === 1, comments.data.data);

  const share = await responder.api.get(`/posts/${postId}/share`);
  check('share returns an outbound deep link (not a repost)', share.data.data.url.includes(`/post/${postId}`));

  const xss = await responder.api.post(`/posts/${postId}/comments`, {
    body: '<script>alert(1)</script>hello',
  });
  check('script tags are stripped from input', !xss.data.data.body.includes('<script>'), xss.data.data.body);

  // ── blocking ─────────────────────────────────────────────────────────
  section('blocking (query-level exclusion, spec §7)');

  await bystander.api.post(`/users/${maker.username}/block`);
  const blockedFeed = await bystander.api.get('/posts/feed', {
    params: { lat: 22.56, lng: 88.355, radiusKm: 20 },
  });
  check(
    'blocked user’s posts vanish from the feed',
    !blockedFeed.data.data.items.some((p: { author: { username: string } }) => p.author.username === maker.username)
  );

  const blockedIntents = await bystander.api.get('/intents/nearby', {
    params: { lat: 22.56, lng: 88.355, radiusKm: 20 },
  });
  check('blocked user’s intents vanish from the map', !blockedIntents.data.data.some((i: { id: string }) => i.id === intentId));

  const blockedProfile = await bystander.api.get(`/users/${maker.username}`);
  check('blocked profile 404s', blockedProfile.status === 404);
  await bystander.api.delete(`/users/${maker.username}/block`);

  // ── safety ───────────────────────────────────────────────────────────
  section('safety');

  await maker.api.put('/safety/trusted-contact', {
    name: 'Ma',
    phone: '+919812345678',
    relation: 'Mother',
  });
  const sos = await maker.api.post('/safety/sos', {
    lat: 22.5535,
    lng: 88.352,
    matchId,
    note: 'Feeling uneasy',
  });
  check('SOS logged with coordinates', sos.status === 201 && sos.data.data.location?.mapsLink, sos.data);
  check('SOS reports the trusted contact was targeted', sos.data.data.hasTrustedContact === true);

  const logs = await maker.api.get('/safety/logs');
  check('safety log recorded', logs.data.data.length === 1);

  // ── completion, activity log, rating ─────────────────────────────────
  section('completion, activity log and trust score');

  const complete = await maker.api.post(`/matches/${matchId}/complete`);
  check('match marked complete', complete.status === 200, complete.data);

  const drafts = await maker.api.get('/posts/me/drafts');
  check('activity-log draft auto-generated', drafts.data.data.length === 1, drafts.data.data);
  check(
    'draft names the companion',
    drafts.data.data[0]?.caption?.includes(responder.name),
    drafts.data.data[0]?.caption
  );
  check('draft is NOT auto-published', drafts.data.data[0]?.status === 'DRAFT');

  const closedRoom = await maker.api.post(`/chat/rooms/${roomId}/messages`, {
    type: 'TEXT',
    body: 'still there?',
  });
  check('chat closes on completion', closedRoom.status === 400 && closedRoom.data.error?.code === 'ROOM_CLOSED', closedRoom.data);

  const pending = await responder.api.get('/matches/pending-ratings');
  check('rating prompt is pending for both', pending.data.data.length === 1);

  const rate1 = await responder.api.post(`/matches/${matchId}/rate`, {
    score: 5,
    review: 'Easy company, great conversation.',
  });
  check('rating submitted', rate1.status === 201, rate1.data);
  // maker started at trustScore 0 with 0 activities: (0*0 + 5)/1 = 5.00
  check('trust score recomputed per spec formula', rate1.data.data.newTrustScore === 5, rate1.data.data);

  const rateTwice = await responder.api.post(`/matches/${matchId}/rate`, { score: 3 });
  check('double rating blocked', rateTwice.status === 409);

  const rate2 = await maker.api.post(`/matches/${matchId}/rate`, { score: 4, review: 'Lovely evening.' });
  check('both sides can rate', rate2.status === 201);

  const makerProfile = await responder.api.get(`/users/${maker.username}`);
  check('trust score visible on profile', Number(makerProfile.data.data.trustScore) === 5, makerProfile.data.data.trustScore);
  check('activities done incremented', makerProfile.data.data.activitiesDone === 1);
  check('companions met incremented', makerProfile.data.data.companionsMet === 1);

  const reviews = await responder.api.get(`/users/${maker.username}/reviews`);
  check('review appears on the profile Reviews tab', reviews.data.data[0]?.score === 5);

  const activity = await responder.api.get(`/users/${maker.username}/activity`);
  check('completed activity appears on the Activity tab', activity.data.data[0]?.status === 'COMPLETED');

  const publish = await maker.api.post(`/posts/${drafts.data.data[0].id}/publish`, {
    caption: 'Coffee at Flurys with Priya — good call ☕',
  });
  check('activity-log draft publishes on demand', publish.status === 200 && publish.data.data.status === 'PUBLISHED', publish.data);

  // ── wishlist → intent ────────────────────────────────────────────────
  section('wishlist → intent conversion');

  const converted = await responder.api.post('/intents', {
    title: 'Teretti Bazaar breakfast',
    locationName: 'Teretti Bazaar',
    lat: 22.5795,
    lng: 88.3555,
    scheduledAt: new Date(Date.now() + 5 * 3600_000).toISOString(),
    groupSize: 2,
    vibeTag: 'ADVENTUROUS',
    radiusKm: 8,
    expiresAt: new Date(Date.now() + 4 * 3600_000).toISOString(),
    fromPostId: wishlist.data.data.post.id,
  });
  check('wishlist post converts to a live intent', converted.status === 201, converted.data);

  // The responder now has a live intent, so their posts must carry the badge.
  await responder.api.post('/posts', {
    type: 'VIBE_CHECK',
    caption: 'Up for dim sum before sunrise',
  });
  const badgedFeed = await maker.api.get('/posts/feed', {
    params: { lat: 22.5535, lng: 88.352, radiusKm: 20 },
  });
  check(
    'feed marks an author with a live intent as intent-live 🟢',
    badgedFeed.data.data.items.some(
      (p: { author: { username: string }; authorHasActiveIntent: boolean }) =>
        p.author.username === responder.username && p.authorHasActiveIntent === true
    ),
    badgedFeed.data.data.items
      .filter((p: { author: { username: string } }) => p.author.username === responder.username)
      .map((p: { authorHasActiveIntent: boolean }) => p.authorHasActiveIntent)
  );

  // ── auth hardening ───────────────────────────────────────────────────
  section('auth hardening');

  const noToken = await client().get('/users/me');
  check('protected route rejects a missing token', noToken.status === 401);

  const rotated = await client().post('/auth/refresh', { refreshToken: maker.refreshToken });
  check('refresh returns a new token pair', rotated.status === 200 && rotated.data.data.accessToken);

  const replay = await client().post('/auth/refresh', { refreshToken: maker.refreshToken });
  check(
    'the old refresh token is dead after rotation',
    replay.status === 401 && replay.data.error?.code === 'REFRESH_TOKEN_REUSED',
    replay.data
  );

  const weakPassword = await client().post('/auth/register', {
    phone: '+919000000009',
    password: 'weak',
    name: 'Weak',
    username: `weak_${Date.now().toString(36)}`,
    deviceId: 'device-weak',
  });
  check('weak passwords are rejected by Zod', weakPassword.status === 400);

  const otp = await client().post('/auth/otp/send', { phone: '+919123456780' });
  check('OTP send works', otp.status === 200 && otp.data.data.sent);
  const wrongOtp = await client().post('/auth/otp/verify', {
    phone: '+919123456780',
    code: '000000',
  });
  check('wrong OTP is rejected', wrongOtp.status === 400 || wrongOtp.status === 429, wrongOtp.data);

  socket.close();

  // ── summary ──────────────────────────────────────────────────────────
  console.log(`\n═══ ${passed} passed, ${failed} failed ═══`);
  if (failed) {
    console.log('\nFailures:');
    failures.forEach((f) => console.log(`  · ${f}`));
  }
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error('\nE2E crashed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
