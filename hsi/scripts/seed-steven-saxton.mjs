import { connect } from './_db.mjs';

const sql = connect();

function generateSlug() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let slug = '';
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < 12; i++) slug += chars[bytes[i] % chars.length];
  return slug;
}

// ── Steven Saxton profile ──────────────────────────────────────────
const profile = {
  email: 'steven.saxton@hollywoodstudios.ai',
  handle: 'steven-saxton',
  displayName: 'Steven Saxton',
  headline: 'Founder, Chairman & CEO — Hollywood Studios International',
  bio: `Steven Saxton is an American film producer and entertainment executive. He is the Founder, Chairman & CEO of Hollywood Studios International (HSI), a global entertainment company. Saxton has produced and executive produced numerous feature films including Lone Survivor, 2 Guns, The Kids Are All Right, Gotti, and First Kill. His body of work spans action, drama, and thriller genres, frequently collaborating with major talent including Mark Wahlberg, Bruce Willis, Arnold Schwarzenegger, and John Travolta. HSI operates as a studio with divisions in film production, artist management, and music, with offices in Los Angeles, New York, London, Hong Kong, and Dubai.`,
  location: 'Los Angeles, CA',
  skills: ['Producing', 'Executive Producing', 'Film Finance', 'Entertainment Management'],
  representation: [],
  mediaLinks: [],
};

// ── Films with credits ─────────────────────────────────────────────
const films = [
  { title: 'Gotti', year: 2018, role: 'Executive Producer', genre: ['Biography', 'Crime', 'Drama'], metadata: { box_office: '$6,400,000' } },
  { title: 'Arsenal', year: 2017, role: 'Executive Producer', genre: ['Action', 'Crime', 'Thriller'], metadata: { box_office: '$41,000' } },
  { title: 'Aftermath', year: 2017, role: 'Executive Producer', genre: ['Drama', 'Mystery', 'Thriller'], metadata: { box_office: '$840,800' } },
  { title: 'First Kill', year: 2017, role: 'Executive Producer', genre: ['Action', 'Thriller'], metadata: { box_office: '$347,300' } },
  { title: 'Marauders', year: 2016, role: 'Executive Producer', genre: ['Action', 'Adventure', 'Crime'], metadata: { box_office: '$1,600,000' } },
  { title: 'Precious Cargo', year: 2016, role: 'Executive Producer', genre: ['Action', 'Comedy', 'Thriller'], metadata: { box_office: '$567,100' } },
  { title: 'Sweet Lorraine', year: 2015, role: 'Co-Executive Producer', genre: ['Comedy', 'Drama', 'Sport'], metadata: {} },
  { title: 'Extraction', year: 2015, role: 'Executive Producer', genre: ['Action', 'Thriller'], metadata: { box_office: '$710,600' } },
  { title: 'Vice', year: 2015, role: 'Executive Producer', genre: ['Action', 'Sci-Fi', 'Thriller'], metadata: { box_office: '$1,600,000' } },
  { title: 'Whispers of the Forest', year: 2014, role: 'Executive Producer', genre: ['Fantasy', 'Horror', 'Romance'], metadata: {} },
  { title: 'Lone Survivor', year: 2013, role: 'Executive Producer', genre: ['Action', 'Biography', 'Drama'], metadata: { box_office: '$154,800,000' } },
  { title: '2 Guns', year: 2013, role: 'Executive Producer', genre: ['Action', 'Comedy', 'Crime'], metadata: { box_office: '$131,900,000' } },
  { title: 'LUV', year: 2012, role: 'Executive Producer', genre: ['Crime', 'Drama'], metadata: { box_office: '$157,000' } },
  { title: 'Junction', year: 2012, role: 'Executive Producer', genre: ['Thriller'], metadata: {} },
  { title: 'The Brooklyn Brothers Beat the Best', year: 2011, role: 'Executive Producer', genre: ['Comedy', 'Music'], metadata: { box_office: '$8,200' } },
  { title: 'The Ledge', year: 2011, role: 'Executive Producer', genre: ['Drama', 'Romance', 'Thriller'], metadata: { box_office: '$1,300,000' } },
  { title: 'The Zero Hour', year: 2010, role: 'Co-Executive Producer', genre: ['Action', 'Drama', 'Thriller'], metadata: { box_office: '$3,900,000' } },
  { title: 'The Kids Are All Right', year: 2010, role: 'Executive Producer', genre: ['Comedy', 'Drama', 'Romance'], metadata: { box_office: '$34,800,000' } },
  { title: 'Beyond a Reasonable Doubt', year: 2009, role: 'Executive Producer', genre: ['Crime', 'Drama', 'Mystery'], metadata: { box_office: '$4,500,000' } },
  { title: 'Hide and Seek', year: 2005, role: 'Executive Music Producer', genre: ['Horror', 'Mystery'], metadata: { box_office: '$127,400,000' } },
  { title: 'Insomnia Manica', year: 2005, role: 'Executive Producer', genre: ['Thriller'], metadata: {} },
  { title: 'George and the Dragon', year: 2004, role: 'Executive Producer', genre: ['Action', 'Adventure', 'Comedy'], metadata: { box_office: '$47,600' } },
  { title: 'The Singing Detective', year: 2003, role: 'Executive Music Producer', genre: ['Comedy', 'Crime', 'Musical'], metadata: { box_office: '$435,600' } },
  { title: 'Carnival of Wolves', year: 1996, role: 'Executive Producer', genre: ['Action', 'Crime'], metadata: {} },
  { title: 'Warriors', year: 1994, role: 'Executive Producer', genre: ['Action', 'Drama'], metadata: {} },
  { title: 'Turner & Hooch', year: 1989, role: 'Silver Screen Partners III', genre: ['Comedy', 'Crime'], metadata: { box_office: '$71,100,000' } },
  { title: 'Honey, I Shrunk the Kids', year: 1989, role: 'Silver Screen Partners III', genre: ['Adventure', 'Comedy', 'Family'], metadata: { box_office: '$222,700,000' } },
  { title: 'Cheetah', year: 1989, role: 'Silver Screen Partners III', genre: ['Adventure', 'Family'], metadata: {} },
  { title: 'Who Framed Roger Rabbit', year: 1988, role: 'Silver Screen Partners III', genre: ['Animation', 'Adventure', 'Comedy'], metadata: { box_office: '$351,500,000' } },
  { title: 'The Rescue', year: 1988, role: 'Silver Screen Partners III', genre: ['Action', 'Adventure', 'Family'], metadata: {} },
  { title: 'Return to Snowy River', year: 1988, role: 'Silver Screen Partners III', genre: ['Adventure', 'Drama', 'Family'], metadata: {} },
  { title: 'Ernest Saves Christmas', year: 1988, role: 'Silver Screen Partners III', genre: ['Comedy', 'Family'], metadata: {} },
  { title: 'Black Eagle', year: 1988, role: 'Executive Producer', genre: ['Action', 'Drama'], metadata: {} },
  { title: 'Shoot to Kill', year: 1988, role: 'Silver Screen Partners III', genre: ['Action', 'Adventure', 'Crime'], metadata: {} },
  { title: 'D.O.A.', year: 1988, role: 'Silver Screen Partners III', genre: ['Mystery', 'Thriller'], metadata: {} },
  { title: 'Big Business', year: 1988, role: 'Silver Screen Partners III', genre: ['Comedy'], metadata: {} },
  { title: 'Cocktail', year: 1988, role: 'Silver Screen Partners III', genre: ['Comedy', 'Drama', 'Romance'], metadata: { box_office: '$171,500,000' } },
  { title: 'Heartbreak Hotel', year: 1988, role: 'Silver Screen Partners III', genre: ['Comedy', 'Drama', 'Fantasy'], metadata: {} },
  { title: 'Oliver & Company', year: 1988, role: 'Silver Screen Partners III', genre: ['Animation', 'Comedy', 'Family'], metadata: { box_office: '$74,200,000' } },
  { title: "Can't Buy Me Love", year: 1987, role: 'Silver Screen Partners III', genre: ['Comedy', 'Drama', 'Romance'], metadata: {} },
  { title: 'Good Morning, Vietnam', year: 1987, role: 'Silver Screen Partners III', genre: ['Biography', 'Comedy', 'Drama'], metadata: { box_office: '$123,900,000' } },
  { title: 'Three Men and a Baby', year: 1987, role: 'Silver Screen Partners III', genre: ['Comedy', 'Family'], metadata: { box_office: '$240,800,000' } },
  { title: 'Tin Men', year: 1987, role: 'Silver Screen Partners III', genre: ['Comedy', 'Drama'], metadata: {} },
  { title: 'Benji the Hunted', year: 1987, role: 'Silver Screen Partners III', genre: ['Adventure', 'Family'], metadata: {} },
  { title: 'Adventures in Babysitting', year: 1987, role: 'Silver Screen Partners III', genre: ['Adventure', 'Comedy'], metadata: {} },
  { title: 'Ernest Goes to Camp', year: 1987, role: 'Silver Screen Partners III', genre: ['Comedy', 'Family'], metadata: {} },
];

async function seed() {
  console.log('Seeding Steven Saxton profile...');

  const [p] = await sql`
    INSERT INTO profiles (email, handle, display_name, headline, bio, location, skills, representation, media_links, updated_at)
    VALUES (${profile.email}, ${profile.handle}, ${profile.displayName}, ${profile.headline}, ${profile.bio}, ${profile.location},
            ${JSON.stringify(profile.skills)}, ${JSON.stringify(profile.representation)}, ${JSON.stringify(profile.mediaLinks)}, NOW())
    ON CONFLICT (email) DO UPDATE SET
      handle = EXCLUDED.handle,
      display_name = EXCLUDED.display_name,
      headline = EXCLUDED.headline,
      bio = EXCLUDED.bio,
      location = EXCLUDED.location,
      skills = EXCLUDED.skills,
      representation = EXCLUDED.representation,
      media_links = EXCLUDED.media_links,
      updated_at = NOW()
    RETURNING *
  `;
  console.log(`  ✓ Profile created: id=${p.id}, handle=${p.handle}`);

  console.log(`\nSeeding ${films.length} movie entities...`);

  const credits = [];

  for (let i = 0; i < films.length; i++) {
    const f = films[i];
    const slug = generateSlug();

    const [existing] = await sql`
      SELECT id, slug FROM entities WHERE title = ${f.title} AND year = ${f.year} AND type = 'movie'
    `;

    let entityId;
    let entitySlug;

    if (existing) {
      entityId = existing.id;
      entitySlug = existing.slug;
      console.log(`  – ${f.title} (${f.year}) already exists, slug=${entitySlug}`);
    } else {
      const [entity] = await sql`
        INSERT INTO entities (type, title, slug, year, genre, description, metadata, created_by)
        VALUES ('movie', ${f.title}, ${slug}, ${f.year}, ${f.genre}, ${null}, ${JSON.stringify(f.metadata)}, ${p.id})
        RETURNING *
      `;
      entityId = entity.id;
      entitySlug = entity.slug;
      console.log(`  ✓ ${f.title} (${f.year}) → /movie/${entitySlug}`);
    }

    credits.push({
      profileId: p.id,
      department: 'Producing',
      title: f.title,
      year: f.year,
      role: f.role,
      workType: 'movie',
      entityId,
      sortOrder: i,
    });
  }

  console.log(`\nLinking ${credits.length} credits...`);

  await sql`DELETE FROM credits WHERE profile_id = ${p.id}`;

  for (const c of credits) {
    await sql`
      INSERT INTO credits (profile_id, department, title, year, role, work_type, entity_id, sort_order)
      VALUES (${c.profileId}, ${c.department}, ${c.title}, ${c.year}, ${c.role}, ${c.workType}, ${c.entityId}, ${c.sortOrder})
    `;
  }

  console.log(`  ✓ ${credits.length} credits linked`);

  console.log('\n🎬 Done! Steven Saxton seeded with profile + entities + credits.');
  console.log(`  Profile: /profile/${p.handle}`);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
