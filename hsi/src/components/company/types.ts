import type { Entity, EntitySummary } from '../entity/types';

export interface CompanyDetails {
  entity_id: number;
  tagline: string | null;
  category: string | null;
  organization_type: string | null;
  company_size: string | null;
  founded_month: number | null;
  headquarters: string | null;
  website: string | null;
  contact_email: string | null;
  phone: string | null;
  specialties: string[];
  social_links: Record<string, string>;
  cover_url: string | null;
  notable_entity_ids: number[];
}

export interface CompanyPerson {
  handle: string;
  display_name: string;
  avatar_url: string | null;
  headline: string | null;
  job_title: string;
  start_date: string | null;
  end_date: string | null;
  is_current: boolean;
}

export interface CompanyOwner {
  handle: string;
  display_name: string;
  avatar_url: string | null;
  headline: string | null;
}

export interface CompanyData {
  entity: Entity;
  company: CompanyDetails | null;
  owner: CompanyOwner | null;
  people: CompanyPerson[];
  notableWork: EntitySummary[];
  canEdit: boolean;
}
