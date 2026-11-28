// Offline tests for the credit-import JSON format (api/profile/credits/_suggestions.ts).
//   npm run test:credits
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toSuggestions,
  departmentForRole,
  validateNewCredits,
  MAX_CREDITS_PER_SAVE,
  type AgentResult,
} from '../api/profile/credits/_suggestions.ts';

const WIKI = 'https://en.wikipedia.org/wiki/Zendaya';
const agentResult: AgentResult = {
  personName: 'Zendaya',
  findings: [
    { field: 'occupation', value: 'Actress', year: null, role: null, workType: null, sourceUrl: WIKI },
    { field: 'credit', value: 'Euphoria', year: 2019, role: 'Actor (Rue Bennett)', workType: 'TV', sourceUrl: WIKI },
    { field: 'credit', value: 'Dune', year: 2021, role: 'Actress (Chani)', workType: 'Film', sourceUrl: WIKI },
  ],
  needsReview: [
    { field: 'credit', value: 'Shake It Up', year: null, role: 'Performer', workType: 'Other', sourceUrl: WIKI, reason: 'Year not stated' },
  ],
};

test('keeps only credits, in order, with review items last', () => {
  const { personName, suggestions } = toSuggestions(agentResult);
  assert.equal(personName, 'Zendaya');
  assert.deepEqual(suggestions.map((s) => s.title), ['Euphoria', 'Dune', 'Shake It Up']);
  assert.deepEqual(suggestions.map((s) => s.id), ['s0', 's1', 's2']);
  assert.equal(suggestions[2].needsReview, true);
  assert.equal(suggestions[2].reason, 'Year not stated');
  assert.equal(suggestions[0].reason, null);
});

test('maps fields into the profile credit format', () => {
  const [euphoria, , shakeItUp] = toSuggestions(agentResult).suggestions;
  assert.deepEqual(
    { ...euphoria },
    {
      id: 's0', title: 'Euphoria', year: 2019, role: 'Actor (Rue Bennett)', workType: 'TV', department: 'Acting',
      sourceUrl: WIKI, needsReview: false, reason: null, alreadyOnProfile: false,
    },
  );
  assert.equal(shakeItUp.workType, null, "'Other' is not a profile work type");
});

test('marks credits already on the profile (title is case/space-insensitive, year must match)', () => {
  const { suggestions } = toSuggestions(agentResult, [{ title: '  euphoria ', year: 2019 }, { title: 'Dune', year: 2024 }]);
  assert.equal(suggestions[0].alreadyOnProfile, true);
  assert.equal(suggestions[1].alreadyOnProfile, false);
});

test('departmentForRole picks the department from the role text', () => {
  assert.equal(departmentForRole('Director'), 'Directing');
  assert.equal(departmentForRole('Creator, Director, Star'), 'Directing');
  assert.equal(departmentForRole('Screenplay'), 'Writing');
  assert.equal(departmentForRole('Executive Producer'), 'Producing');
  assert.equal(departmentForRole('Voice Actress (Meechee)'), 'Acting');
  assert.equal(departmentForRole('Composer'), 'Music');
  assert.equal(departmentForRole('Film Editor'), 'Editing');
  assert.equal(departmentForRole('Gaffer'), 'Other');
  assert.equal(departmentForRole(null), 'Other');
});

test('validateNewCredits accepts and cleans good input', () => {
  const out = validateNewCredits([{ title: ' Euphoria ', year: 2019, role: ' Actor ', workType: 'TV', department: 'Acting' }]);
  assert.deepEqual(out, [{ title: 'Euphoria', year: 2019, role: 'Actor', workType: 'TV', department: 'Acting' }]);
});

test('validateNewCredits fixes unknown department / work type instead of failing', () => {
  const out = validateNewCredits([{ title: 'X', year: null, role: '', workType: 'Podcast', department: 'Catering' }]);
  assert.deepEqual(out, [{ title: 'X', year: null, role: null, workType: null, department: 'Other' }]);
});

test('validateNewCredits rejects bad input with a message', () => {
  assert.equal(typeof validateNewCredits('nope'), 'string');
  assert.equal(typeof validateNewCredits([]), 'string');
  assert.match(validateNewCredits([{ title: '' }]) as string, /title/);
  assert.match(validateNewCredits([{ title: 'X', year: 20211 }]) as string, /year/);
  assert.match(validateNewCredits([{ title: 'X', year: 2019.5 }]) as string, /year/);
  const tooMany = Array.from({ length: MAX_CREDITS_PER_SAVE + 1 }, () => ({ title: 'X' }));
  assert.match(validateNewCredits(tooMany) as string, /at most/);
});
