export interface Entity {
  id: number;
  type: 'movie' | 'tvshow' | 'company' | 'music';
  title: string;
  slug: string;
  year: number | null;
  image_url: string | null;
  genre: string[];
  description: string | null;
  metadata: Record<string, unknown>;
  created_by: number | null;
  creator_name?: string;
  creator_handle?: string;
  created_at: string;
  updated_at: string;
}

export interface CastCrewEntry {
  department: string;
  role: string | null;
  year: number | null;
  display_name: string;
  handle: string;
  avatar_url: string | null;
  headline: string | null;
}

export interface EntityData {
  entity: Entity;
  castCrew: CastCrewEntry[];
  /** Whether the signed-in caller may edit or delete this page. */
  canEdit: boolean;
}

export interface EntitySummary {
  id: number;
  type: string;
  title: string;
  slug: string;
  image_url: string | null;
  year: number | null;
}

export const TYPE_LABELS: Record<string, string> = {
  movie: 'Movie',
  tvshow: 'TV Show',
  company: 'Company',
  music: 'Music',
};

export const TYPE_ROUTES: Record<string, string> = {
  movie: '/movie',
  tvshow: '/tvshow',
  company: '/company',
  music: '/music',
};
