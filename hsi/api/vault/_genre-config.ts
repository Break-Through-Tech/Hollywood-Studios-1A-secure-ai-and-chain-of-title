export interface GenreRubricOverride {
  what_excellence_looks_like: string;
  common_pitfalls: string;
  genre_specific_criteria: string[];
}

export interface GenreConfig {
  key: string;
  label: string;
  subgenres: string[];
  scoring_weights: Record<string, number>;
  rubric_overrides: Record<string, GenreRubricOverride>;
  comp_pool_tags: string[];
}

export const GENRE_CONFIGS: GenreConfig[] = [
  {
    key: 'thriller',
    label: 'Thriller / Suspense',
    subgenres: ['psychological thriller', 'political thriller', 'erotic thriller', 'techno-thriller', 'conspiracy thriller', 'legal thriller'],
    scoring_weights: {
      premise_concept: 0.14,
      structure_plot: 0.18,
      character_development: 0.13,
      dialogue: 0.10,
      theme_meaning: 0.07,
      emotional_impact: 0.12,
      pacing_rhythm: 0.15,
      originality: 0.11,
    },
    rubric_overrides: {
      structure_plot: {
        what_excellence_looks_like: 'Tension escalates across acts without plateauing. Each revelation reconfigures the audience\'s understanding. The ticking clock or stakes are crystal clear by end of Act 1. Plot mechanics are tight enough that the audience can\'t see the machinery.',
        common_pitfalls: 'False tension from withheld information rather than earned tension from dramatic irony. Twists that invalidate established character motivations. Over-reliance on red herrings that don\'t enrich on re-watch.',
        genre_specific_criteria: [
          'Is there a clear and escalating sense of danger or urgency?',
          'Does the twist/revelation reward the attentive viewer?',
          'Are the stakes personal, not just circumstantial?',
          'Does the antagonist force drive relentless forward motion?',
        ],
      },
      pacing_rhythm: {
        what_excellence_looks_like: 'Relentless forward momentum with strategically placed breathing room. Scene lengths compress as tension builds. Set pieces are spaced to escalate, not repeat. The third act is a pressure cooker.',
        common_pitfalls: 'Confusing busyness with tension. Long expository scenes that kill momentum. A climax that arrives too early, leaving a dragging denouement.',
        genre_specific_criteria: [
          'Does every scene either build tension or provide necessary release before the next escalation?',
          'Is the opening hook immediate enough for the genre?',
          'Does Act 2 maintain or increase pace rather than sag?',
        ],
      },
    },
    comp_pool_tags: ['thriller', 'suspense', 'mystery', 'crime'],
  },
  {
    key: 'horror',
    label: 'Horror',
    subgenres: ['supernatural horror', 'slasher', 'psychological horror', 'body horror', 'folk horror', 'elevated horror', 'creature feature', 'found footage'],
    scoring_weights: {
      premise_concept: 0.14,
      structure_plot: 0.12,
      character_development: 0.13,
      dialogue: 0.10,
      theme_meaning: 0.10,
      emotional_impact: 0.16,
      pacing_rhythm: 0.14,
      originality: 0.11,
    },
    rubric_overrides: {
      emotional_impact: {
        what_excellence_looks_like: 'Atmosphere and dread outweigh shock. The audience fears for characters they care about. Horror emerges from thematic or psychological truth, not just gore or surprise. The scares linger after the credits.',
        common_pitfalls: 'Over-reliance on jump scares that don\'t hold up on paper. Characters making inexplicably stupid decisions to serve the kill schedule. Horror that is disgusting but not frightening.',
        genre_specific_criteria: [
          'Is dread sustained or does the script rely on punctuated scares?',
          'Are the rules of the threat internally consistent?',
          'Does the horror connect to a deeper fear or anxiety?',
          'Do character reactions to danger feel authentic under fear?',
        ],
      },
      originality: {
        what_excellence_looks_like: 'Subverts genre expectations without alienating the horror audience. Finds a fresh lens on familiar fears. The mythology or monster design feels genuinely new.',
        common_pitfalls: 'Retreading well-worn horror premises without a new angle. Mistaking meta-commentary for originality. Twists borrowed wholesale from better-known horror films.',
        genre_specific_criteria: [
          'Does this offer something the horror audience hasn\'t seen?',
          'Is the threat/monster/curse conceptually original?',
          'Does it find fresh ground in a well-trodden genre?',
        ],
      },
    },
    comp_pool_tags: ['horror', 'supernatural', 'slasher', 'psychological'],
  },
  {
    key: 'comedy',
    label: 'Comedy',
    subgenres: ['romantic comedy', 'dark comedy', 'satire', 'farce', 'buddy comedy', 'coming-of-age comedy', 'workplace comedy', 'absurdist'],
    scoring_weights: {
      premise_concept: 0.12,
      structure_plot: 0.12,
      character_development: 0.16,
      dialogue: 0.18,
      theme_meaning: 0.08,
      emotional_impact: 0.12,
      pacing_rhythm: 0.11,
      originality: 0.11,
    },
    rubric_overrides: {
      dialogue: {
        what_excellence_looks_like: 'Comedy lives in character voice — each character is funny in a different way. Joke density is high but varied (physical, verbal, situational, callback). Setups pay off pages later. The comedy reveals character truth.',
        common_pitfalls: 'Mistaking cruelty or shock for humor. Sacrificing character consistency for a joke. Comedy that requires performance to land and reads flat on the page. Characters who are all "the funny one."',
        genre_specific_criteria: [
          'Does the humor arise from character rather than being imposed on characters?',
          'Is there variety in comedic technique?',
          'Do jokes serve the story or interrupt it?',
          'Are there runners and callbacks that reward attention?',
        ],
      },
      character_development: {
        what_excellence_looks_like: 'Characters are funny because of who they are, not despite it. Comedy comes from specific, grounded character flaws. The emotional arc is real beneath the laughs. Supporting characters are individually hilarious, not interchangeable.',
        common_pitfalls: 'The protagonist\'s flaw is so endearing it\'s not really a flaw. Supporting cast exists only to set up the lead\'s jokes. Emotional beats feel grafted on rather than earned by the comedy.',
        genre_specific_criteria: [
          'Is the protagonist\'s comic flaw specific and load-bearing?',
          'Does the ensemble have distinct comedic functions?',
          'Are emotional turns earned through the comedy, not in spite of it?',
        ],
      },
    },
    comp_pool_tags: ['comedy', 'romcom', 'satire', 'dark comedy'],
  },
  {
    key: 'drama',
    label: 'Drama',
    subgenres: ['family drama', 'social drama', 'legal drama', 'political drama', 'period drama', 'domestic drama', 'courtroom drama'],
    scoring_weights: {
      premise_concept: 0.12,
      structure_plot: 0.13,
      character_development: 0.18,
      dialogue: 0.13,
      theme_meaning: 0.14,
      emotional_impact: 0.15,
      pacing_rhythm: 0.08,
      originality: 0.07,
    },
    rubric_overrides: {
      character_development: {
        what_excellence_looks_like: 'Character change is earned through specific dramatic events, not announced through dialogue. Characters are contradictory and human. Subtext runs beneath every interaction. Relationships shift in ways that feel inevitable in retrospect.',
        common_pitfalls: 'Characters as mouthpieces for themes. Melodrama — unearned emotional extremes. Endings that resolve too neatly. Characters who learn their lesson in a single revelatory moment.',
        genre_specific_criteria: [
          'Is the protagonist\'s inner conflict as developed as their external conflict?',
          'Are character decisions morally complex rather than clearly right/wrong?',
          'Do relationships feel lived-in and specific?',
          'Is the character transformation gradual and earned?',
        ],
      },
      theme_meaning: {
        what_excellence_looks_like: 'The theme is the story — not something layered on top. Multiple characters explore the theme from different angles. The ending complicates rather than simplifies the thesis. The audience leaves with questions, not just answers.',
        common_pitfalls: 'Preachiness. Theme stated directly in dialogue. A message that is too simple for the complexity of the story. Confusing seriousness of topic with depth of treatment.',
        genre_specific_criteria: [
          'Does the theme emerge from story events rather than being stated?',
          'Do different characters embody different perspectives on the theme?',
          'Is there thematic complexity or just thematic presence?',
        ],
      },
    },
    comp_pool_tags: ['drama', 'indie', 'prestige', 'character study'],
  },
  {
    key: 'action',
    label: 'Action / Adventure',
    subgenres: ['action thriller', 'adventure', 'heist', 'war film', 'martial arts', 'disaster', 'survival'],
    scoring_weights: {
      premise_concept: 0.16,
      structure_plot: 0.16,
      character_development: 0.12,
      dialogue: 0.09,
      theme_meaning: 0.07,
      emotional_impact: 0.12,
      pacing_rhythm: 0.16,
      originality: 0.12,
    },
    rubric_overrides: {
      pacing_rhythm: {
        what_excellence_looks_like: 'Set pieces escalate in stakes and creativity, not just scale. Action sequences are interspersed with character moments that make the next action beat matter more. The final set piece is the most inventive, not just the biggest.',
        common_pitfalls: 'Action fatigue from too many sequences without emotional breathing room. Escalation by volume rather than ingenuity. A final act that\'s just "the same thing but bigger."',
        genre_specific_criteria: [
          'Does each action sequence serve a narrative purpose beyond spectacle?',
          'Are set pieces varied in type and escalating in stakes?',
          'Is the hero\'s competence established before being tested?',
        ],
      },
      premise_concept: {
        what_excellence_looks_like: 'The world and premise generate action organically — set pieces emerge from the rules of the world. The concept promises escalating spectacle. World-building is embedded in action, not exposition.',
        common_pitfalls: 'A generic "save the world" setup. Interchangeable action scripts where only the location changes. Premises that exhaust their potential in Act 1.',
        genre_specific_criteria: [
          'Does the premise naturally generate escalating conflict?',
          'Is the world specific enough to produce unique action scenarios?',
          'Does the concept have franchise or extension potential?',
        ],
      },
    },
    comp_pool_tags: ['action', 'adventure', 'blockbuster', 'heist'],
  },
  {
    key: 'scifi',
    label: 'Science Fiction',
    subgenres: ['hard sci-fi', 'space opera', 'cyberpunk', 'dystopian', 'first contact', 'time travel', 'post-apocalyptic', 'biopunk'],
    scoring_weights: {
      premise_concept: 0.18,
      structure_plot: 0.13,
      character_development: 0.12,
      dialogue: 0.09,
      theme_meaning: 0.13,
      emotional_impact: 0.10,
      pacing_rhythm: 0.11,
      originality: 0.14,
    },
    rubric_overrides: {
      premise_concept: {
        what_excellence_looks_like: 'The speculative element is load-bearing — you cannot tell this story without it. The "what if" is explored to its logical and emotional extremes. Internal logic is airtight. The concept illuminates something true about humanity.',
        common_pitfalls: 'Sci-fi as decoration on a generic plot. Rules that exist only to serve plot convenience. Technology that is never questioned or explored. Exposition-heavy world-building.',
        genre_specific_criteria: [
          'Is the speculative element essential to the story\'s DNA?',
          'Are the rules of the world internally consistent?',
          'Does the concept explore its implications thoroughly?',
          'Is exposition dramatized rather than delivered?',
        ],
      },
      originality: {
        what_excellence_looks_like: 'Offers genuinely new speculative territory or finds a profoundly fresh angle on familiar concepts. The world-building contains surprises that reframe the genre. Visual possibilities are unprecedented.',
        common_pitfalls: 'Derivative of well-known sci-fi franchises without adding anything. Dystopias that feel like every other dystopia. Time travel or AI stories that retread exhausted ground.',
        genre_specific_criteria: [
          'Does this offer speculative territory the audience hasn\'t explored?',
          'Are the visual and world-building possibilities exciting?',
          'Does it advance the genre conversation?',
        ],
      },
    },
    comp_pool_tags: ['scifi', 'science fiction', 'dystopia', 'space', 'cyberpunk'],
  },
  {
    key: 'romance',
    label: 'Romance / Romantic Comedy',
    subgenres: ['romantic drama', 'romantic comedy', 'period romance', 'love triangle', 'second chance romance', 'workplace romance'],
    scoring_weights: {
      premise_concept: 0.10,
      structure_plot: 0.12,
      character_development: 0.18,
      dialogue: 0.16,
      theme_meaning: 0.10,
      emotional_impact: 0.14,
      pacing_rhythm: 0.10,
      originality: 0.10,
    },
    rubric_overrides: {
      character_development: {
        what_excellence_looks_like: 'Both leads are fully realized, not just the protagonist. The obstacle to love is internal and meaningful — not a misunderstanding that a conversation could fix. Chemistry lives in specificity of interaction. Each character is independently compelling.',
        common_pitfalls: 'One lead is a fantasy projection rather than a person. The "obstacle" is a contrivance. Confusing dysfunction with passion. The love interest has no interiority.',
        genre_specific_criteria: [
          'Are both leads equally developed and compelling?',
          'Is the obstacle to love internal and meaningful?',
          'Do their interactions reveal specific chemistry, not generic attraction?',
          'Does each character have a life and arc beyond the romance?',
        ],
      },
      dialogue: {
        what_excellence_looks_like: 'Romantic banter is specific to these characters — no other couple could have these conversations. Flirtation operates on subtext. Declarations of feeling are earned by everything that precedes them. Humor and vulnerability coexist.',
        common_pitfalls: 'Generic romantic dialogue interchangeable between any couple. Grand speeches that haven\'t been earned. Banter that\'s clever but emotionally hollow.',
        genre_specific_criteria: [
          'Is the romantic dialogue character-specific?',
          'Does subtext drive attraction more than explicit declaration?',
          'Are the key romantic exchanges built up to and earned?',
        ],
      },
    },
    comp_pool_tags: ['romance', 'romcom', 'love story', 'romantic drama'],
  },
  {
    key: 'biopic',
    label: 'Biopic / True Story',
    subgenres: ['biographical drama', 'docudrama', 'historical drama', 'music biopic', 'sports biopic', 'political biopic'],
    scoring_weights: {
      premise_concept: 0.14,
      structure_plot: 0.16,
      character_development: 0.18,
      dialogue: 0.12,
      theme_meaning: 0.12,
      emotional_impact: 0.12,
      pacing_rhythm: 0.08,
      originality: 0.08,
    },
    rubric_overrides: {
      structure_plot: {
        what_excellence_looks_like: 'Finds the story within the life — not a cradle-to-grave chronology but a dramatically focused narrative. Compression of timeline feels natural. The chosen scope reveals something a documentary couldn\'t.',
        common_pitfalls: 'The "greatest hits" biopic that hits every milestone without finding the story. Hagiography. Ending with title cards that do the emotional work the script should have done.',
        genre_specific_criteria: [
          'Does the script find a focused dramatic question within the larger life?',
          'Is the timeline compressed with purpose?',
          'Does this justify the cinematic format over documentary?',
          'Are historical liberties taken for dramatic truth, not convenience?',
        ],
      },
      character_development: {
        what_excellence_looks_like: 'The subject\'s contradiction and complexity IS the story. They are allowed to be flawed, difficult, and human. Supporting characters are not merely satellites. The private person behind the public figure is explored.',
        common_pitfalls: 'Worship of the subject that prevents honest portrayal. Supporting characters as foils or witnesses rather than people. Surface-level "dark side" that doesn\'t complicate admiration.',
        genre_specific_criteria: [
          'Is the subject portrayed with genuine complexity?',
          'Does the script find the private human behind the public figure?',
          'Are supporting figures dimensionally written?',
        ],
      },
    },
    comp_pool_tags: ['biopic', 'true story', 'biographical', 'historical'],
  },
];

export function detectGenre(genreSignals: string[]): GenreConfig {
  const signalStr = genreSignals.join(' ').toLowerCase();

  let bestMatch: GenreConfig = GENRE_CONFIGS[3]; // default to drama
  let bestScore = 0;

  for (const config of GENRE_CONFIGS) {
    let score = 0;
    if (signalStr.includes(config.key)) score += 3;
    for (const sub of config.subgenres) {
      if (signalStr.includes(sub)) score += 2;
    }
    for (const tag of config.comp_pool_tags) {
      if (signalStr.includes(tag)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = config;
    }
  }

  return bestMatch;
}

export function getGenreConfig(key: string): GenreConfig | undefined {
  return GENRE_CONFIGS.find(g => g.key === key);
}

export function getGenreWeights(genreKey: string, defaultWeights: Record<string, number>): Record<string, number> {
  const genre = getGenreConfig(genreKey);
  if (!genre) return defaultWeights;
  return { ...defaultWeights, ...genre.scoring_weights };
}
