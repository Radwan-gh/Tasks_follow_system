#!/usr/bin/env node
// UserPromptSubmit hook: rejects prompts in this repo unless Claude Code is
// signed in to the account below. Exit code 2 blocks the prompt and shows
// stderr to the user. Any failure to confirm the account also blocks.
const { execSync } = require('node:child_process');

const REQUIRED_EMAIL = 'walid.kelzia@gmail.com';

function block(detail) {
  process.stderr.write(
    `This project may only be used with the Claude account ${REQUIRED_EMAIL}. ${detail} ` +
      'Run /login to switch accounts, then send your prompt again.\n',
  );
  process.exit(2);
}

let output;
try {
  output = execSync('claude auth status', {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 25000,
  });
} catch (error) {
  // The CLI exits non-zero when signed out but may still print its JSON.
  output = error.stdout || '';
}

let status;
try {
  status = JSON.parse(output);
} catch {
  block('The signed-in account could not be determined.');
}

const email = typeof status.email === 'string' ? status.email.trim().toLowerCase() : '';

if (email !== REQUIRED_EMAIL) {
  block(email ? `Currently signed in as ${email}.` : 'No Claude account email is active.');
}
