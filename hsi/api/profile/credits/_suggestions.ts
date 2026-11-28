// The JSON format shared by the credit-import API and page, plus the pure
// functions that convert the research agent's output into it. No imports,
// so the page can `import type` from here and the tests run with plain Node.

export const DEPARTMENTS = ['Acting', 'Directing', 'Producing', 'Writing', 'Music', 'Camera', 'Editing', 'Other'] as const;
export const WORK_TYPES = ['Film', 'TV', 'Music Video', 'Short', 'Web Series'] as const;
export type Department = (typeof DEPARTMENTS)[number];
export type WorkType = (typeof WORK_TYPES)[number];

/** One credit the agent found, as the review page shows it. */
export interface CreditSuggestion {
  id: string;                 // stable within one response: "s0", "s1", ...
  title: string;
  year: number | null;
  role: string | null;
  workType: WorkType | null;
  department: Department;
  sourceUrl: string;          // the page the agent read it from
  needsReview: boolean;       // true when the agent wasn't sure
  reason: string | null;      // why it needs review
  alreadyOnProfile: boolean;  // same title + year is already saved
}

/** POST /api/profile/credits/research → */
export interface ResearchResponse {
  personName: string;
  suggestions: CreditSuggestion[];
}

/** One confirmed credit sent to POST /api/profile/credits/add. */
export interface NewCredit {
  title: string;
  year: number | null;
  role: string | null;
  workType: WorkType | null;
  department: Department;
}

// ---------- agent output → suggestions ----------

/** The parts of the agent's result this file reads (see agent_call_folder/agentapicall.ts). */
interface AgentFinding {
  field: string;
  value: string;
  year: number | null;
  role: string | null;
  workType: string | null;
  sourceUrl: string;
  reason?: string;
}
export interface AgentResult {
  personName: string;
  findings: AgentFinding[];
  needsReview: AgentFinding[];
}

// First match wins, so "Creator, Director, Star" files under Directing.
const DEPARTMENT_KEYWORDS: [Department, RegExp][] = [
  ['Directing', /direct/i],
  ['Writing', /writ|screenplay|story by/i],
  ['Producing', /produc|creator|showrunner/i],
  ['Acting', /act(or|ress|ing)|star|voice|cast|self|host|performer|role/i],
  ['Music', /compos|music|song|singer|score/i],
  ['Camera', /cinematograph|camera|photograph/i],
  ['Editing', /edit/i],
];

export function departmentForRole(role: string | null): Department {
  if (!role) return 'Other';
  return DEPARTMENT_KEYWORDS.find(([, re]) => re.test(role))?.[0] ?? 'Other';
}

export function toWorkType(value: string | null): WorkType | null {
  return (WORK_TYPES as readonly string[]).includes(value ?? '') ? (value as WorkType) : null;
}

export const creditKey = (title: string, year: number | null) =>
  `${title.trim().toLowerCase().replace(/\s+/g, ' ')}|${year ?? ''}`;

/**
 * Keeps only `credit` findings (occupation, achievement etc. have no place in the
 * credits table) and marks the ones the member has already saved.
 */
export function toSuggestions(
  result: AgentResult,
  existing: { title: string; year: number | null }[] = [],
): ResearchResponse {
  const saved = new Set(existing.map((c) => creditKey(c.title, c.year)));
  const items = [
    ...result.findings.map((f) => ({ f, needsReview: false })),
    ...result.needsReview.map((f) => ({ f, needsReview: true })),
  ].filter(({ f }) => f.field === 'credit' && f.value.trim());

  return {
    personName: result.personName,
    suggestions: items.map(({ f, needsReview }, i) => ({
      id: `s${i}`,
      title: f.value.trim(),
      year: f.year,
      role: f.role,
      workType: toWorkType(f.workType),
      department: departmentForRole(f.role),
      sourceUrl: f.sourceUrl,
      needsReview,
      reason: needsReview ? f.reason || 'The agent was not sure about this one' : null,
      alreadyOnProfile: saved.has(creditKey(f.value, f.year)),
    })),
  };
}

// ---------- validating what the page sends back ----------

export const MAX_CREDITS_PER_SAVE = 100;
const MAX_TEXT = 200;

/** Returns clean credits, or a string describing the first problem. */
export function validateNewCredits(input: unknown): NewCredit[] | string {
  if (!Array.isArray(input)) return 'credits must be an array';
  if (input.length === 0) return 'no credits to add';
  if (input.length > MAX_CREDITS_PER_SAVE) return `at most ${MAX_CREDITS_PER_SAVE} credits per save`;

  const maxYear = new Date().getFullYear() + 5;
  const out: NewCredit[] = [];
  for (const [i, raw] of input.entries()) {
    const c = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const title = typeof c.title === 'string' ? c.title.trim() : '';
    if (!title || title.length > MAX_TEXT) return `credit ${i + 1}: title is required (max ${MAX_TEXT} characters)`;

    const year = c.year == null ? null : Number(c.year);
    if (year !== null && !(Number.isInteger(year) && year >= 1880 && year <= maxYear)) return `credit ${i + 1}: invalid year`;

    const role = typeof c.role === 'string' && c.role.trim() ? c.role.trim().slice(0, MAX_TEXT) : null;
    const department = (DEPARTMENTS as readonly string[]).includes(String(c.department)) ? (c.department as Department) : 'Other';
    out.push({ title, year, role, workType: toWorkType(typeof c.workType === 'string' ? c.workType : null), department });
  }
  return out;
}
