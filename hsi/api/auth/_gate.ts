/**
 * The application gate: when on, only emails with an approved row in
 * `applications` may request a sign-in code. It is off for now — anyone can
 * sign in with a new email and get a profile immediately. Set
 * APPLICATION_GATE_ENABLED=true to turn the curated flow back on; the
 * application form, the applications table, and its data are all untouched.
 */
export const APPLICATION_GATE_ENABLED = process.env.APPLICATION_GATE_ENABLED === 'true';
