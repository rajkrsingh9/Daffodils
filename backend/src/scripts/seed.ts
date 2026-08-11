/**
 * Demo data — a plausible slice of Kolkata so the app opens with something
 * real in it. Idempotent: re-running replaces the seeded accounts.
 *
 * Every seeded account uses the password `Daffodil1Pass`.
 */
import bcrypt from 'bcryptjs';
import { prisma } from '../config/db';
import { connectRedis, disconnectRedis } from '../config/redis';

const PASSWORD = 'Daffodil1Pass';

/** Deterministic 128-float descriptor so seeded users are face-verified. */
function descriptor(seed: number): number[] {
  return Array.from({ length: 128 }, (_, i) => {
    const v = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
    return v - Math.floor(v);
  });
}

const PEOPLE = [
  {
    username: 'priya_sen',
    name: 'Priya Sen',
    bio: 'Bookshop crawler. Will walk 3 km for good filter coffee.',
    lat: 22.5551, lng: 88.3512, // Park Street
    interestTags: ['coffee', 'books', 'walks', 'museums'],
    trustScore: 4.8, activitiesDone: 12, companionsMet: 11,
  },
  {
    username: 'arjun_d',
    name: 'Arjun Das',
    bio: 'Weekend footballer, weekday photographer.',
    lat: 22.5478, lng: 88.3639, // Sealdah side
    interestTags: ['football', 'photography', 'street food', 'running'],
    trustScore: 4.5, activitiesDone: 8, companionsMet: 7,
  },
  {
    username: 'meher_k',
    name: 'Meher Khan',
    bio: 'Live gigs, thrift shops, and long tram rides.',
    lat: 22.5626, lng: 88.3495, // Esplanade
    interestTags: ['music', 'live gigs', 'thrifting', 'walks'],
    trustScore: 4.9, activitiesDone: 21, companionsMet: 18,
  },
  {
    username: 'rohit_m',
    name: 'Rohit Mitra',
    bio: 'Chess in the park. Loser buys chai.',
    lat: 22.5432, lng: 88.3421, // Bhowanipore
    interestTags: ['chess', 'board games', 'coffee', 'podcasts'],
    trustScore: 4.2, activitiesDone: 5, companionsMet: 5,
  },
  {
    username: 'ananya_b',
    name: 'Ananya Bose',
    bio: 'Sunrise runner. Ask me about the Maidan loop.',
    lat: 22.5588, lng: 88.3402, // Maidan
    interestTags: ['running', 'yoga', 'birdwatching', 'coffee'],
    trustScore: 4.7, activitiesDone: 15, companionsMet: 13,
  },
  {
    username: 'sameer_j',
    name: 'Sameer Jain',
    bio: 'Chinatown breakfast evangelist.',
    lat: 22.5795, lng: 88.3555, // Teretti Bazaar
    interestTags: ['street food', 'markets', 'photography', 'cycling'],
    trustScore: 4.4, activitiesDone: 9, companionsMet: 9,
  },
] as const;

const POSTS = [
  { author: 'priya_sen', type: 'MOMENT' as const, caption: 'Filter coffee at Flurys and a stack of secondhand paperbacks ☕️', locationName: 'Flurys, Park Street', lat: 22.5535, lng: 88.352, likeCount: 14 },
  { author: 'priya_sen', type: 'WISHLIST' as const, caption: 'Someone take me to Teretti Bazaar for breakfast before it gets too warm', locationName: null, lat: null, lng: null, likeCount: 6 },
  { author: 'arjun_d', type: 'VIBE_CHECK' as const, caption: 'Craving an evening walk along the river. Anyone else restless?', locationName: null, lat: null, lng: null, likeCount: 9 },
  { author: 'meher_k', type: 'MOMENT' as const, caption: 'Three hours of live jazz at a place with eleven chairs 🎷', locationName: 'Princep Ghat', lat: 22.5573, lng: 88.3327, likeCount: 22 },
  { author: 'rohit_m', type: 'VIBE_CHECK' as const, caption: 'Board set up in the park till six if anyone fancies losing', locationName: null, lat: null, lng: null, likeCount: 4 },
  { author: 'ananya_b', type: 'MOMENT' as const, caption: 'Maidan at 5:40am. Worth every alarm 🌅', locationName: 'Maidan', lat: 22.5588, lng: 88.3402, likeCount: 31 },
  { author: 'sameer_j', type: 'WISHLIST' as const, caption: 'Want to cycle the whole of Southern Avenue one Sunday morning', locationName: null, lat: null, lng: null, likeCount: 11 },
  { author: 'meher_k', type: 'VIBE_CHECK' as const, caption: 'Quiet afternoon, good light, no plans. Museum, anyone?', locationName: null, lat: null, lng: null, likeCount: 7 },
];

const INTENTS = [
  {
    creator: 'meher_k',
    title: 'Evening walk from Princep Ghat',
    description: 'Slow loop along the river, ending wherever the good chai is.',
    activityEmoji: '🚶',
    locationName: 'Princep Ghat',
    lat: 22.5573, lng: 88.3327,
    hoursFromNow: 4, groupSize: 2, vibeTag: 'QUIET' as const, radiusKm: 6,
  },
  {
    creator: 'ananya_b',
    title: 'Sunrise run on the Maidan loop',
    description: '6 km, easy pace, coffee after. Beginners welcome.',
    activityEmoji: '🏃',
    locationName: 'Maidan, near Gate 3',
    lat: 22.5588, lng: 88.3402,
    hoursFromNow: 14, groupSize: 3, vibeTag: 'ENERGETIC' as const, radiusKm: 8,
  },
  {
    creator: 'sameer_j',
    title: 'Chinatown breakfast crawl',
    description: 'Pork buns, fish ball soup, and too much tea. Start early.',
    activityEmoji: '🍽',
    locationName: 'Teretti Bazaar',
    lat: 22.5795, lng: 88.3555,
    hoursFromNow: 20, groupSize: 4, vibeTag: 'ADVENTUROUS' as const, radiusKm: 10,
  },
  {
    creator: 'rohit_m',
    title: 'Chess and chai at Deshapriya Park',
    activityEmoji: '🎲',
    locationName: 'Deshapriya Park',
    lat: 22.5185, lng: 88.3494,
    hoursFromNow: 6, groupSize: 1, vibeTag: 'CASUAL' as const, radiusKm: 5,
  },
];

async function main() {
  await connectRedis();
  console.log('▸ seeding demo data');

  const usernames = PEOPLE.map((p) => p.username);

  // Clean slate for the seeded accounts only — cascades clear their content.
  const { count: removed } = await prisma.user.deleteMany({
    where: { username: { in: usernames } },
  });
  if (removed) console.log(`  cleared ${removed} existing seed account(s)`);

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const idByUsername = new Map<string, string>();

  for (const [i, person] of PEOPLE.entries()) {
    const user = await prisma.user.create({
      data: {
        username: person.username,
        name: person.name,
        bio: person.bio,
        city: 'Kolkata',
        phone: `+9198${String(30000000 + i).padStart(8, '0')}`,
        passwordHash,
        interestTags: [...person.interestTags],
        trustTier: 'TIER_2',
        trustScore: person.trustScore,
        activitiesDone: person.activitiesDone,
        companionsMet: person.companionsMet,
        phoneVerified: true,
        faceVerified: true,
        faceVerifiedAt: new Date(),
        lat: person.lat,
        lng: person.lng,
        locationAt: new Date(),
        lastActiveAt: new Date(),
      },
    });

    await prisma.faceRecord.create({
      data: { userId: user.id, provider: 'local', descriptor: descriptor(i + 1) },
    });

    idByUsername.set(person.username, user.id);
  }
  console.log(`  ✓ ${PEOPLE.length} people`);

  for (const [i, post] of POSTS.entries()) {
    await prisma.post.create({
      data: {
        authorId: idByUsername.get(post.author)!,
        type: post.type,
        status: 'PUBLISHED',
        caption: post.caption,
        locationName: post.locationName,
        lat: post.lat,
        lng: post.lng,
        likeCount: post.likeCount,
        publishedAt: new Date(),
        // Spread posts over the last few days so feed recency ranking has
        // something to actually sort.
        createdAt: new Date(Date.now() - i * 7 * 3600_000),
      },
    });
  }
  console.log(`  ✓ ${POSTS.length} posts`);

  for (const intent of INTENTS) {
    const scheduledAt = new Date(Date.now() + intent.hoursFromNow * 3600_000);
    // Expiry always lands before the activity starts.
    const expiresAt = new Date(
      Math.min(scheduledAt.getTime() - 30 * 60_000, Date.now() + 3 * 3600_000)
    );

    await prisma.intent.create({
      data: {
        creatorId: idByUsername.get(intent.creator)!,
        title: intent.title,
        description: 'description' in intent ? intent.description : null,
        activityEmoji: intent.activityEmoji,
        locationName: intent.locationName,
        lat: intent.lat,
        lng: intent.lng,
        scheduledAt,
        groupSize: intent.groupSize,
        vibeTag: intent.vibeTag,
        radiusKm: intent.radiusKm,
        expiresAt,
        status: 'ACTIVE',
      },
    });
  }
  console.log(`  ✓ ${INTENTS.length} live intents`);

  console.log('\n✓ seed complete');
  console.log(`  sign in as any of: ${usernames.join(', ')}`);
  console.log(`  password: ${PASSWORD}`);
  console.log('  all seeded users are face-verified and centred on Kolkata');

  await disconnectRedis();
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
