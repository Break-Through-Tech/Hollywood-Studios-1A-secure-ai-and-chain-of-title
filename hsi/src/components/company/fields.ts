/**
 * Company page field options. The keys are validated server-side in
 * api/entity/_company.ts — keep the two lists in step.
 */

export const CATEGORIES: { value: string; label: string }[] = [
  { value: 'studio', label: 'Studio' },
  { value: 'production', label: 'Production Company' },
  { value: 'talent-agency', label: 'Talent Agency' },
  { value: 'management', label: 'Management Company' },
  { value: 'distribution', label: 'Distribution' },
  { value: 'streaming', label: 'Streaming & Broadcast' },
  { value: 'post-production', label: 'Post-Production' },
  { value: 'vfx-animation', label: 'VFX & Animation' },
  { value: 'record-label', label: 'Record Label' },
  { value: 'music-publishing', label: 'Music Publishing' },
  { value: 'casting', label: 'Casting' },
  { value: 'finance', label: 'Film Finance' },
  { value: 'marketing-pr', label: 'Marketing & PR' },
  { value: 'legal', label: 'Entertainment Law' },
  { value: 'festivals-events', label: 'Festivals & Events' },
  { value: 'equipment-stages', label: 'Equipment & Stages' },
  { value: 'games-interactive', label: 'Games & Interactive' },
  { value: 'education', label: 'Education & Training' },
  { value: 'other', label: 'Other' },
];

export const ORGANIZATION_TYPES: { value: string; label: string }[] = [
  { value: 'private', label: 'Privately held' },
  { value: 'public', label: 'Public company' },
  { value: 'self-employed', label: 'Self-employed' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'nonprofit', label: 'Nonprofit' },
  { value: 'government', label: 'Government agency' },
  { value: 'educational', label: 'Educational institution' },
];

export const COMPANY_SIZES: { value: string; label: string }[] = [
  { value: '1', label: 'Just me' },
  { value: '2-10', label: '2–10 people' },
  { value: '11-50', label: '11–50 people' },
  { value: '51-200', label: '51–200 people' },
  { value: '201-500', label: '201–500 people' },
  { value: '501-1000', label: '501–1,000 people' },
  { value: '1001-5000', label: '1,001–5,000 people' },
  { value: '5001-10000', label: '5,001–10,000 people' },
  { value: '10001+', label: '10,001+ people' },
];

export const SOCIALS: { key: string; label: string; placeholder: string }[] = [
  { key: 'linkedin', label: 'LinkedIn', placeholder: 'linkedin.com/company/…' },
  { key: 'instagram', label: 'Instagram', placeholder: 'instagram.com/…' },
  { key: 'x', label: 'X', placeholder: 'x.com/…' },
  { key: 'youtube', label: 'YouTube', placeholder: 'youtube.com/@…' },
  { key: 'tiktok', label: 'TikTok', placeholder: 'tiktok.com/@…' },
  { key: 'facebook', label: 'Facebook', placeholder: 'facebook.com/…' },
  { key: 'vimeo', label: 'Vimeo', placeholder: 'vimeo.com/…' },
  { key: 'imdb', label: 'IMDb', placeholder: 'imdb.com/company/…' },
];

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const labelOf = (list: { value: string; label: string }[], value: string | null | undefined) =>
  value ? list.find(o => o.value === value)?.label ?? null : null;

export const categoryLabel = (v: string | null | undefined) => labelOf(CATEGORIES, v);
export const organizationTypeLabel = (v: string | null | undefined) => labelOf(ORGANIZATION_TYPES, v);
export const sizeLabel = (v: string | null | undefined) => labelOf(COMPANY_SIZES, v);

/** "Since March 2012", or "Since 2012" when only the year is known. */
export function formatFounded(year: number | null, month: number | null): string | null {
  if (!year) return null;
  return month ? `${MONTHS[month - 1]} ${year}` : String(year);
}

/** "selftest.example" from "https://www.selftest.example/" — for display only. */
export function displayHost(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname === '/' ? '' : u.pathname.replace(/\/$/, '');
    return u.hostname.replace(/^www\./, '') + path;
  } catch {
    return url;
  }
}
