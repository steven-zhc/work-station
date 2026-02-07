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
 */

import keytar from 'keytar';

function usage(exitCode = 1) {
  console.error(`\nUsage:\n  mysec.mjs <service> <account> <KEY_NAME> <secret|->\n  mysec.mjs <service> <account> <KEY_NAME>\n  mysec.mjs -d <service> <account> <KEY_NAME>\n\nExamples:\n  ./script/mysec.mjs vercel nextloom.ai GITHUB_TOKEN ghp_...\n  (echo -n 'ghp_...') | ./script/mysec.mjs vercel nextloom.ai GITHUB_TOKEN -\n  ./script/mysec.mjs vercel nextloom.ai GITHUB_TOKEN\n  ./script/mysec.mjs -d vercel nextloom.ai GITHUB_TOKEN\n`.trimStart());
  process.exit(exitCode);
}

async function readAllStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

const argv = process.argv.slice(2);
let del = false;
if (argv[0] === '-h' || argv[0] === '--help') usage(0);
if (argv[0] === '-d' || argv[0] === '--delete') {
  del = true;
  argv.shift();
}

const [service, account, keyName, value] = argv;
if (!service || !account || !keyName) usage();

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
