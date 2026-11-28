export interface Credit {
  id?: number;
  department: string;
  title: string;
  year: number | null;
  role: string | null;
  work_type: string | null;
  sort_order?: number;
  entity_id?: number | null;
  entity_type?: string;
  entity_slug?: string;
  entity_image_url?: string | null;
}

export interface Experience {
  id?: number;
  company: string;
  job_title: string;
  start_date: string | null;
  end_date: string | null;
  description: string | null;
  /** Set when the entry links to a company page. */
  company_entity_id?: number | null;
  company_slug?: string | null;
  company_logo_url?: string | null;
}

export interface Award {
  id?: number;
  award_name: string;
  category: string | null;
  year: number | null;
  result: string;
  project: string | null;
}

export interface RepEntry {
  name: string;
  company: string;
  role: string;
  email?: string;
  phone?: string;
}

export interface MediaEntry {
  url: string;
  title: string;
  type: string;
}

export interface ConnectionProfile {
  handle: string;
  display_name: string;
  headline: string | null;
  avatar_url: string | null;
}

export interface Profile {
  id: number;
  email: string;
  handle: string;
  display_name: string;
  headline: string | null;
  bio: string | null;
  location: string | null;
  avatar_url: string | null;
  skills: string[];
  representation: RepEntry[];
  media_links: MediaEntry[];
  featured_credit_ids: number[];
  /** Seeded reference entry for a public figure, not a claimed HSI account. */
  is_directory?: boolean;
  source?: string | null;
  source_url?: string | null;
  image_attribution?: string | null;
}

export interface CreatedPage {
  id: number;
  type: string;
  title: string;
  slug: string;
  image_url: string | null;
  year: number | null;
}

export interface ProfileData {
  profile: Profile;
  credits: Credit[];
  experience: Experience[];
  awards: Award[];
  connections: ConnectionProfile[];
  createdPages?: CreatedPage[];
}
