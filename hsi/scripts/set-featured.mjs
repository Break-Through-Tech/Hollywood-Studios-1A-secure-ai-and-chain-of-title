/**
 * Set (or clear) the people shown in "Featured This Week" on /people.
 *
 * A selection is a cohort stamped with the Monday of the week it was made. The
 * app renders whichever cohort has the latest week_start, so a selection stays
 * up until it is deliberately replaced — it does not fall off when the calendar
 * week rolls over.
 *
 *   node scripts/set-featured.mjs ada-lovelace grace-hopper
 *   node scripts/set-featured.mjs "ada-lovelace=One line on why they are up this week."
 *   node scripts/set-featured.mjs --week=2026-09-07 some-handle
 *   node scripts/set-featured.mjs --list
 *   node scripts/set-featured.mjs --clear      # drops the current cohort
 *
 * Handles are given in display order. `handle=blurb` sets the one-line note
 * shown under the name; a bare handle leaves it empty.
 */
import { connect } from './_db.mjs';

const sql = connect();
const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const LIST = args.includes('--list');
const CLEAR = args.includes('--clear');
const WEEK = flag('week');

/** Monday of the week containing `date`, as YYYY-MM-DD in UTC. */
function weekStart(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

async function currentCohort() {
  const [row] = await sql`SELECT max(week_start)::text AS week FROM featured_profiles`;
  return row?.week || null;
}

async function show(week) {
  if (!week) return console.log('Nothing featured.');
  const rows = await sql`
    SELECT f.sort_order, f.blurb, p.handle, p.display_name
    FROM featured_profiles f JOIN profiles p ON p.id = f.profile_id
    WHERE f.week_start = ${week}
    ORDER BY f.sort_order`;
  console.log(`Featured, week of ${week}:`);
  for (const r of rows) console.log(`  ${r.display_name} (@${r.handle})${r.blurb ? ` — ${r.blurb}` : ''}`);
}

async function run() {
  if (LIST) return show(await currentCohort());

  if (CLEAR) {
    const week = await currentCohort();
    if (!week) return console.log('Nothing featured — nothing to clear.');
    await show(week);
    const rows = await sql`DELETE FROM featured_profiles WHERE week_start = ${week} RETURNING id`;
    return console.log(`\nCleared ${rows.length} entr${rows.length === 1 ? 'y' : 'ies'}.`);
  }

  const picks = args.filter((a) => !a.startsWith('--')).map((a) => {
    const [handle, ...blurb] = a.split('=');
    return { handle: handle.trim(), blurb: blurb.join('=').trim() || null };
  });
  if (picks.length === 0) {
    console.log('Usage: node scripts/set-featured.mjs <handle>[=blurb] …  |  --list  |  --clear');
    process.exit(1);
  }

  const week = WEEK || weekStart();
  const rows = [];
  for (const [i, pick] of picks.entries()) {
    const [profile] = await sql`SELECT id, display_name FROM profiles WHERE handle = ${pick.handle}`;
    if (!profile) throw new Error(`no profile with handle "${pick.handle}"`);
    rows.push({ ...pick, id: profile.id, name: profile.display_name, order: i });
  }

  // The cohort is replaced wholesale so a re-run can't leave last week's
  // leftovers sitting under this week's stamp.
  await sql`DELETE FROM featured_profiles WHERE week_start = ${week}`;
  for (const r of rows) {
    await sql`
      INSERT INTO featured_profiles (profile_id, week_start, blurb, sort_order)
      VALUES (${r.id}, ${week}, ${r.blurb}, ${r.order})`;
  }

  await show(week);
  console.log('\nLive on /people until this script is run again.');
}

run().catch((err) => { console.error('Failed:', err.message); process.exit(1); });
