#!/usr/bin/env node
/**
 * mysec.mjs — tiny keychain-backed secret helper (keytar)
 *
 * Store secrets under (service, account:key) in the OS credential store.
 *
 * Set:
 *   ./script/mysec.mjs <service> <account> <KEY_NAME> <secret>
 *   (echo -n 'secret') | ./script/mysec.mjs <service> <account> <KEY_NAME> -
 *
 * Get:
 *   ./script/mysec.mjs <service> <account> <KEY_NAME>
 *
 * Delete:
 *   ./script/mysec.mjs -d <service> <account> <KEY_NAME>
 *
 * List keys (no values):
 *   ./script/mysec.mjs -l <service> <account>
 *
 * List categories (no values):
 *   ./script/mysec.mjs -L <service>
 */

import keytar from 'keytar';

function usage(exitCode = 1) {
  console.error(
    `\nUsage:\n  mysec.mjs <service> <account> <KEY_NAME> <secret|->\n  mysec.mjs <service> <account> <KEY_NAME>\n  mysec.mjs -d <service> <account> <KEY_NAME>\n  mysec.mjs -l <service> <account>\n  mysec.mjs -L <service>\n\nExamples:\n  ./script/mysec.mjs vercel nextloom.ai-dev GITHUB_TOKEN ghp_...\n  (echo -n 'ghp_...') | ./script/mysec.mjs vercel nextloom.ai-dev GITHUB_TOKEN -\n  ./script/mysec.mjs vercel nextloom.ai-dev GITHUB_TOKEN\n  ./script/mysec.mjs -d vercel nextloom.ai-dev GITHUB_TOKEN\n  ./script/mysec.mjs -l vercel nextloom.ai-dev\n  ./script/mysec.mjs -L vercel\n`.trimStart(),
  );
  process.exit(exitCode);
}

async function readAllStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

const argv = process.argv.slice(2);
let del = false;
let list = false;
let listCategories = false;
if (argv[0] === '-h' || argv[0] === '--help') usage(0);
if (argv[0] === '-d' || argv[0] === '--delete') {
  del = true;
  argv.shift();
}
if (argv[0] === '-l' || argv[0] === '--list') {
  list = true;
  argv.shift();
}
if (argv[0] === '-L' || argv[0] === '--list-categories') {
  listCategories = true;
  argv.shift();
}

const [service, account, keyName, value] = argv;
if (!service || (!listCategories && !account) || (!listCategories && !list && !keyName)) usage();

if (listCategories) {
  const creds = await keytar.findCredentials(service);
  const cats = Array.from(
    new Set(
      creds
        .map(c => c.account)
        .map(a => a.split(':')[0])
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b));

  for (const c of cats) console.log(c);
  process.exit(0);
}

if (list) {
  const prefix = `${account}:`;
  const creds = await keytar.findCredentials(service);
  const keys = creds
    .map(c => c.account)
    .filter(a => a.startsWith(prefix))
    .map(a => a.slice(prefix.length))
    .filter(k => k.length > 0)
    .sort((a, b) => a.localeCompare(b));

  // Print one key per line (no values)
  for (const k of keys) console.log(k);
  process.exit(0);
}

const accountKey = `${account}:${keyName}`;

if (del) {
  const ok = await keytar.deletePassword(service, accountKey);
  console.log(ok ? 'OK' : 'NOT_FOUND');
  process.exit(ok ? 0 : 3);
}

// SET
if (typeof value === 'string') {
  let secret = value;
  if (value === '-') {
    if (process.stdin.isTTY) {
      console.error('Refusing to read secret from TTY. Pipe it in.');
      process.exit(2);
    }
    secret = (await readAllStdin()).replace(/\r?\n$/, '');
  }
  if (!secret) {
    console.error('Empty secret. Nothing stored.');
    process.exit(2);
  }
  await keytar.setPassword(service, accountKey, secret);
  console.log('OK');
  process.exit(0);
}

// GET
const v = await keytar.getPassword(service, accountKey);
if (v == null) {
  console.error('NOT_FOUND');
  process.exit(3);
}
process.stdout.write(v);
