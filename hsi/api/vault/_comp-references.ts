import type { NeonQueryFunction } from '@neondatabase/serverless';

export interface CompReference {
  id: number;
  title: string;
  year: number | null;
  genre: string;
  subgenre: string | null;
  tags: string[];
  budget_tier: string | null;
  box_office_dom: number | null;
  box_office_intl: number | null;
  rating: string | null;
  platform: string | null;
  strengths: string[];
  weaknesses: string[];
  audience_demo: string | null;
  awards_note: string | null;
  craft_summary: string | null;
}

export async function selectComps(
  sql: NeonQueryFunction<false, false>,
  genre: string,
  genreSignals: string[],
  limit: number = 5,
): Promise<CompReference[]> {
  const tags = [...genreSignals, genre].map(s => s.toLowerCase());

  const comps = await sql`
    SELECT *,
      (CASE WHEN genre = ${genre} THEN 3 ELSE 0 END) +
      (CASE WHEN subgenre IS NOT NULL AND subgenre = ANY(${tags}::text[]) THEN 2 ELSE 0 END) +
      (SELECT COUNT(*)::int FROM unnest(tags) t WHERE t = ANY(${tags}::text[])) +
      (CASE WHEN year >= 2016 THEN 1 ELSE 0 END)
    AS relevance_score
    FROM comp_references
    WHERE genre = ${genre} OR tags && ${tags}::text[]
    ORDER BY relevance_score DESC, year DESC NULLS LAST
    LIMIT ${limit}
  `;

  return comps as CompReference[];
}

export const SEED_COMPS: Omit<CompReference, 'id'>[] = [
  // ── Thriller ──
  {
    title: 'Gone Girl', year: 2014, genre: 'thriller', subgenre: 'psychological thriller',
    tags: ['thriller', 'mystery', 'psychological', 'marriage', 'unreliable narrator'],
    budget_tier: 'mid', box_office_dom: 167_800_000, box_office_intl: 201_500_000,
    rating: 'R', platform: 'theatrical',
    strengths: ['masterful unreliable narration', 'mid-script genre shift', 'dual timeline structure'],
    weaknesses: ['polarizing third act'], audience_demo: 'A25-49, skews female',
    awards_note: 'Rosamund Pike Oscar nom',
    craft_summary: 'Redefined the domestic thriller by weaponizing audience sympathy. The midpoint reveal reconfigures everything — a structural masterclass in unreliable narration.',
  },
  {
    title: 'Sicario', year: 2015, genre: 'thriller', subgenre: 'crime thriller',
    tags: ['thriller', 'crime', 'cartel', 'moral ambiguity', 'border'],
    budget_tier: 'mid', box_office_dom: 46_900_000, box_office_intl: 38_400_000,
    rating: 'R', platform: 'theatrical',
    strengths: ['sustained dread', 'moral complexity', 'atmosphere as storytelling'],
    weaknesses: ['protagonist is somewhat passive'], audience_demo: 'M18-49',
    awards_note: 'Three Oscar noms including Cinematography',
    craft_summary: 'Uses a naive protagonist as the audience surrogate into an amoral world. The tension comes from systematic disillusionment rather than traditional thriller mechanics.',
  },
  {
    title: 'Knives Out', year: 2019, genre: 'thriller', subgenre: 'mystery',
    tags: ['mystery', 'whodunit', 'ensemble', 'comedy thriller', 'class'],
    budget_tier: 'mid', box_office_dom: 165_400_000, box_office_intl: 146_000_000,
    rating: 'PG-13', platform: 'theatrical',
    strengths: ['genre subversion', 'social commentary', 'ensemble management', 'audience-friendly complexity'],
    weaknesses: ['some characters underserved'], audience_demo: 'broad quadrant',
    awards_note: 'Oscar nom Original Screenplay',
    craft_summary: 'Revitalized the whodunit by revealing the "who" early and building tension from dramatic irony. The genre mechanics serve class commentary without feeling forced.',
  },

  // ── Horror ──
  {
    title: 'Get Out', year: 2017, genre: 'horror', subgenre: 'psychological horror',
    tags: ['horror', 'social thriller', 'race', 'psychological', 'elevated horror', 'satire'],
    budget_tier: 'low', box_office_dom: 176_000_000, box_office_intl: 79_400_000,
    rating: 'R', platform: 'theatrical',
    strengths: ['social commentary as horror mechanic', 'comedic tension release', 'visual metaphor'],
    weaknesses: [], audience_demo: 'A18-44, crossover appeal',
    awards_note: 'Oscar for Original Screenplay',
    craft_summary: 'Embedded social commentary in horror mechanics so the genre IS the message. Every comedic beat serves as tension release. The Sunken Place is a masterclass in visual metaphor. Proved elevated horror has massive commercial upside.',
  },
  {
    title: 'Hereditary', year: 2018, genre: 'horror', subgenre: 'supernatural horror',
    tags: ['horror', 'supernatural', 'family drama', 'grief', 'elevated horror', 'psychological'],
    budget_tier: 'low', box_office_dom: 44_100_000, box_office_intl: 35_200_000,
    rating: 'R', platform: 'theatrical',
    strengths: ['grief as horror engine', 'sustained dread', 'family dysfunction as terror', 'structural subversion'],
    weaknesses: ['divisive third-act tonal shift'], audience_demo: 'A18-34, horror enthusiasts',
    awards_note: 'Toni Collette widely regarded as snubbed for Oscar',
    craft_summary: 'Uses family grief as the engine of horror. The most terrifying moments come from domestic dysfunction, not the supernatural. The famous car scene works because it\'s set up as grief, not horror.',
  },
  {
    title: 'A Quiet Place', year: 2018, genre: 'horror', subgenre: 'creature feature',
    tags: ['horror', 'survival', 'family', 'high concept', 'creature', 'silence'],
    budget_tier: 'low', box_office_dom: 188_000_000, box_office_intl: 152_000_000,
    rating: 'PG-13', platform: 'theatrical',
    strengths: ['high concept execution', 'family drama underneath', 'sound design as narrative', 'PG-13 horror that works'],
    weaknesses: ['some logic gaps in world rules'], audience_demo: 'broad, family-friendly horror',
    awards_note: 'Oscar nom Sound Editing',
    craft_summary: 'Proved that a high-concept constraint (silence) can generate both sustained tension and genuine family drama. The limitation is the creative engine. Franchise-starter from an original concept.',
  },

  // ── Comedy ──
  {
    title: 'Bridesmaids', year: 2011, genre: 'comedy', subgenre: 'ensemble comedy',
    tags: ['comedy', 'ensemble', 'female-led', 'wedding', 'friendship', 'raunchy comedy'],
    budget_tier: 'mid', box_office_dom: 169_100_000, box_office_intl: 119_000_000,
    rating: 'R', platform: 'theatrical',
    strengths: ['character-driven comedy', 'ensemble without losing protagonist', 'vulnerability as comedy engine'],
    weaknesses: ['some set pieces run long'], audience_demo: 'F18-49, broad appeal',
    awards_note: 'Two Oscar noms including Original Screenplay',
    craft_summary: 'Character-driven comedy where every set piece reveals character. Ensemble managed without losing protagonist focus. Proved female-led R-rated comedy has a massive audience. Vulnerability is the comedy engine.',
  },
  {
    title: 'The Grand Budapest Hotel', year: 2014, genre: 'comedy', subgenre: 'dark comedy',
    tags: ['comedy', 'dark comedy', 'ensemble', 'period', 'whimsical', 'auteur'],
    budget_tier: 'mid', box_office_dom: 59_300_000, box_office_intl: 113_000_000,
    rating: 'R', platform: 'theatrical',
    strengths: ['distinctive voice', 'nested narrative structure', 'tonal balancing act', 'visual storytelling'],
    weaknesses: ['style can overwhelm substance for some audiences'], audience_demo: 'A25-54, arthouse crossover',
    awards_note: 'Nine Oscar noms, four wins',
    craft_summary: 'Demonstrates that an idiosyncratic vision executed with total commitment can be both a critical and commercial success. The comedy lives in precision and contrast.',
  },
  {
    title: 'Booksmart', year: 2019, genre: 'comedy', subgenre: 'coming-of-age comedy',
    tags: ['comedy', 'coming-of-age', 'teen', 'friendship', 'female-led', 'high school'],
    budget_tier: 'low', box_office_dom: 25_000_000, box_office_intl: 7_600_000,
    rating: 'R', platform: 'theatrical',
    strengths: ['authentic teen voices', 'emotional depth beneath comedy', 'subverted archetypes'],
    weaknesses: ['underperformed theatrically despite quality'], audience_demo: 'F16-30',
    awards_note: 'Major festival acclaim',
    craft_summary: 'Elevated the teen comedy by giving every character interiority. The comedy arises from specific, believable teen behavior rather than broad stereotypes. A case study in quality that didn\'t find its theatrical audience.',
  },

  // ── Drama ──
  {
    title: 'Parasite', year: 2019, genre: 'drama', subgenre: 'social drama',
    tags: ['drama', 'thriller', 'class', 'social commentary', 'genre-fluid', 'international'],
    budget_tier: 'mid', box_office_dom: 53_400_000, box_office_intl: 210_000_000,
    rating: 'R', platform: 'theatrical',
    strengths: ['genre fluidity', 'class commentary embedded in architecture', 'every setup pays off', 'international appeal'],
    weaknesses: [], audience_demo: 'A25-54, arthouse and mainstream crossover',
    awards_note: 'Four Oscars including Best Picture (first non-English language film)',
    craft_summary: 'Genre-fluid structure that shifts from comedy to thriller to horror without losing coherence. Class commentary is embedded in spatial relationships and architecture. Every setup pays off with mechanical precision.',
  },
  {
    title: 'Moonlight', year: 2016, genre: 'drama', subgenre: 'coming-of-age drama',
    tags: ['drama', 'coming-of-age', 'identity', 'LGBTQ', 'triptych', 'indie', 'prestige'],
    budget_tier: 'low', box_office_dom: 28_000_000, box_office_intl: 37_800_000,
    rating: 'R', platform: 'theatrical',
    strengths: ['restraint as power', 'triptych structure', 'visual storytelling', 'specificity as universality'],
    weaknesses: [], audience_demo: 'A25-49, prestige audience',
    awards_note: 'Three Oscars including Best Picture',
    craft_summary: 'Proved that radical restraint and specificity creates universality. The triptych structure gives decades of character development in 110 minutes. What is unsaid carries more weight than what is spoken.',
  },
  {
    title: 'Manchester by the Sea', year: 2016, genre: 'drama', subgenre: 'family drama',
    tags: ['drama', 'grief', 'family', 'indie', 'prestige', 'New England'],
    budget_tier: 'low', box_office_dom: 48_000_000, box_office_intl: 31_000_000,
    rating: 'R', platform: 'theatrical',
    strengths: ['unflinching honesty', 'grief without catharsis', 'humor within devastation', 'non-linear reveals'],
    weaknesses: [], audience_demo: 'A30-60, prestige audience',
    awards_note: 'Two Oscars including Original Screenplay',
    craft_summary: 'Radical in its refusal to provide catharsis. The non-linear structure makes revelations land like depth charges. Finds genuine humor within devastation without undercutting grief.',
  },

  // ── Action ──
  {
    title: 'Mad Max: Fury Road', year: 2015, genre: 'action', subgenre: 'post-apocalyptic',
    tags: ['action', 'chase', 'post-apocalyptic', 'feminist', 'practical stunts', 'blockbuster'],
    budget_tier: 'tentpole', box_office_dom: 154_000_000, box_office_intl: 224_000_000,
    rating: 'R', platform: 'theatrical',
    strengths: ['action as storytelling', 'visual narrative', 'practical effects', 'character through action'],
    weaknesses: ['minimal dialogue may limit some audiences'], audience_demo: 'M18-49, crossover',
    awards_note: 'Six Oscars, ten nominations',
    craft_summary: 'Proved that sustained action can be the story, not interruption of the story. Character and theme are communicated through movement and visual design. The chase IS the plot.',
  },
  {
    title: 'John Wick', year: 2014, genre: 'action', subgenre: 'revenge thriller',
    tags: ['action', 'revenge', 'assassin', 'world-building', 'franchise', 'martial arts'],
    budget_tier: 'mid', box_office_dom: 43_000_000, box_office_intl: 45_000_000,
    rating: 'R', platform: 'theatrical',
    strengths: ['world-building through detail', 'action choreography as art', 'efficient storytelling', 'franchise engine'],
    weaknesses: ['thin emotional core beyond initial motivation'], audience_demo: 'M18-49',
    awards_note: 'None, but launched billion-dollar franchise',
    craft_summary: 'Built a mythology through details rather than exposition. The Continental hotel system, the coins, the rules — all conveyed through action, not dialogue. Created a franchise from an original IP.',
  },

  // ── Sci-Fi ──
  {
    title: 'Arrival', year: 2016, genre: 'scifi', subgenre: 'first contact',
    tags: ['scifi', 'first contact', 'linguistics', 'time', 'philosophical', 'prestige'],
    budget_tier: 'mid', box_office_dom: 100_500_000, box_office_intl: 102_000_000,
    rating: 'PG-13', platform: 'theatrical',
    strengths: ['concept inseparable from story', 'emotional sci-fi', 'structural revelation', 'accessible ideas'],
    weaknesses: [], audience_demo: 'A25-54, crossover appeal',
    awards_note: 'Eight Oscar noms, one win (Sound Editing)',
    craft_summary: 'The speculative concept IS the emotional experience. The structural reveal reframes the entire film as a meditation on grief and choice. Proved high-concept sci-fi can be deeply emotional.',
  },
  {
    title: 'Ex Machina', year: 2014, genre: 'scifi', subgenre: 'AI thriller',
    tags: ['scifi', 'AI', 'thriller', 'chamber piece', 'philosophical', 'indie'],
    budget_tier: 'low', box_office_dom: 25_400_000, box_office_intl: 11_600_000,
    rating: 'R', platform: 'theatrical',
    strengths: ['contained scope maximized', 'three-character power dynamics', 'ideas through drama'],
    weaknesses: [], audience_demo: 'A18-44, tech-savvy',
    awards_note: 'Oscar for Visual Effects',
    craft_summary: 'A three-character chamber drama that explores AI consciousness through shifting power dynamics rather than exposition. Proves that big ideas work best in contained spaces.',
  },
  {
    title: 'Everything Everywhere All at Once', year: 2022, genre: 'scifi', subgenre: 'multiverse',
    tags: ['scifi', 'multiverse', 'action', 'comedy', 'family drama', 'genre-fluid', 'immigrant story'],
    budget_tier: 'low', box_office_dom: 77_200_000, box_office_intl: 63_000_000,
    rating: 'R', platform: 'theatrical',
    strengths: ['genre fluidity', 'multiverse as family metaphor', 'absurdism with emotional depth', 'maximum creativity on low budget'],
    weaknesses: ['can feel overstuffed'], audience_demo: 'A18-44, wide crossover',
    awards_note: 'Seven Oscars including Best Picture',
    craft_summary: 'Used the multiverse concept as a metaphor for immigrant family dynamics. The absurdist comedy is the delivery mechanism for devastating emotional truths. Budget constraints bred creativity.',
  },

  // ── Romance ──
  {
    title: 'Past Lives', year: 2023, genre: 'romance', subgenre: 'romantic drama',
    tags: ['romance', 'immigration', 'nostalgia', 'Korean American', 'love triangle', 'literary'],
    budget_tier: 'low', box_office_dom: 21_600_000, box_office_intl: 10_400_000,
    rating: 'PG-13', platform: 'theatrical',
    strengths: ['restraint as romance', 'cultural specificity', 'silence carries emotion', 'all three characters fully realized'],
    weaknesses: [], audience_demo: 'A25-54, prestige/arthouse',
    awards_note: 'Two Oscar noms including Best Picture',
    craft_summary: 'Proved that romantic restraint is more powerful than romantic expression. All three sides of the triangle are fully realized and sympathetic. The final shot communicates more than any dialogue could.',
  },
  {
    title: 'Crazy Rich Asians', year: 2018, genre: 'romance', subgenre: 'romantic comedy',
    tags: ['romance', 'romcom', 'Asian American', 'culture clash', 'ensemble', 'luxury'],
    budget_tier: 'mid', box_office_dom: 174_500_000, box_office_intl: 64_200_000,
    rating: 'PG-13', platform: 'theatrical',
    strengths: ['cultural specificity as universal appeal', 'ensemble comedy', 'mother-son relationship as real antagonist'],
    weaknesses: ['supporting storylines can overwhelm'], audience_demo: 'F18-44, broad appeal',
    awards_note: 'SAG nomination',
    craft_summary: 'The real love story is between mother and son, not the romantic leads. Cultural specificity drove rather than limited appeal. Ensemble comedy balanced with genuine emotional stakes.',
  },

  // ── Biopic ──
  {
    title: 'Oppenheimer', year: 2023, genre: 'biopic', subgenre: 'historical drama',
    tags: ['biopic', 'historical', 'science', 'war', 'moral dilemma', 'epic'],
    budget_tier: 'tentpole', box_office_dom: 326_700_000, box_office_intl: 625_300_000,
    rating: 'R', platform: 'theatrical',
    strengths: ['non-linear structure serving theme', 'subjective filmmaking', 'intellectual complexity as spectacle'],
    weaknesses: ['dense for casual audiences', 'women characters underserved'],
    audience_demo: 'M25-64, prestige crossover',
    awards_note: 'Seven Oscars including Best Picture',
    craft_summary: 'Non-linear structure serves the thematic point: you cannot unlearn what you know. Made a theoretical physicist into a blockbuster by dramatizing the moral weight of knowledge.',
  },
  {
    title: 'The Social Network', year: 2010, genre: 'biopic', subgenre: 'tech biopic',
    tags: ['biopic', 'tech', 'entrepreneurship', 'friendship', 'legal drama', 'prestige'],
    budget_tier: 'mid', box_office_dom: 97_000_000, box_office_intl: 127_000_000,
    rating: 'PG-13', platform: 'theatrical',
    strengths: ['Rashomon structure', 'dialogue as action', 'loneliness as theme', 'making coding cinematic'],
    weaknesses: ['factual liberties'], audience_demo: 'A18-44, broad',
    awards_note: 'Three Oscars, eight nominations',
    craft_summary: 'The Rashomon structure turns a business dispute into a meditation on creation and loneliness. Sorkin\'s dialogue IS the action — every scene is a verbal duel. Made the founding of a website as tense as a heist.',
  },
  {
    title: 'Bohemian Rhapsody', year: 2018, genre: 'biopic', subgenre: 'music biopic',
    tags: ['biopic', 'music', 'queen', 'LGBTQ', 'rise and fall', 'performance'],
    budget_tier: 'mid', box_office_dom: 216_400_000, box_office_intl: 687_000_000,
    rating: 'PG-13', platform: 'theatrical',
    strengths: ['crowd-pleasing performance sequences', 'nostalgic appeal', 'massive international draw'],
    weaknesses: ['greatest-hits structure', 'sanitized portrayal', 'formulaic rise-fall-redemption arc'],
    audience_demo: 'broad, 25-65, music fans',
    awards_note: 'Four Oscars including Best Actor',
    craft_summary: 'A cautionary comp — commercially massive but critically seen as formulaic. The "greatest hits" approach works at the box office but doesn\'t push the biopic form forward. Success driven by music catalog and Malek\'s performance rather than screenplay innovation.',
  },
];

export function getSeedSQL(): string {
  return SEED_COMPS.map(c => {
    const strengths = `ARRAY[${c.strengths.map(s => `'${s.replace(/'/g, "''")}'`).join(',')}]`;
    const weaknesses = `ARRAY[${c.weaknesses.map(s => `'${s.replace(/'/g, "''")}'`).join(',')}]`;
    const tags = `ARRAY[${c.tags.map(t => `'${t}'`).join(',')}]`;
    return `INSERT INTO comp_references (title, year, genre, subgenre, tags, budget_tier, box_office_dom, box_office_intl, rating, platform, strengths, weaknesses, audience_demo, awards_note, craft_summary) VALUES ('${c.title.replace(/'/g, "''")}', ${c.year}, '${c.genre}', ${c.subgenre ? `'${c.subgenre}'` : 'NULL'}, ${tags}, ${c.budget_tier ? `'${c.budget_tier}'` : 'NULL'}, ${c.box_office_dom || 'NULL'}, ${c.box_office_intl || 'NULL'}, ${c.rating ? `'${c.rating}'` : 'NULL'}, ${c.platform ? `'${c.platform}'` : 'NULL'}, ${strengths}, ${weaknesses}, ${c.audience_demo ? `'${c.audience_demo}'` : 'NULL'}, ${c.awards_note ? `'${c.awards_note.replace(/'/g, "''")}'` : 'NULL'}, ${c.craft_summary ? `'${c.craft_summary.replace(/'/g, "''")}'` : 'NULL'}) ON CONFLICT DO NOTHING;`;
  }).join('\n');
}
