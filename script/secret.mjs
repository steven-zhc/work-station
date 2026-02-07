#!/usr/bin/env node
/**
 * secret.mjs — small CLI around keytar (macOS Keychain / etc.)
 *
 * Usage:
 *   ./script/secret.mjs set <service> <account> <secret>
 *   ./script/secret.mjs set-stdin <service> <account>
 *   ./script/secret.mjs get <service> <account>
 *   ./script/secret.mjs delete <service> <account>
 *
 * Notes:
 * - Avoid passing secrets on the command line when possible (shows in shell history / ps).
 *   Prefer set-stdin.
 */

import keytar from 'keytar';

function usage(exitCode = 1) {
  const msg = `
Usage:
  secret.mjs set <service> <account> <secret>
  secret.mjs set-stdin <service> <account>
  secret.mjs get <service> <account>
  secret.mjs delete <service> <account>

Examples:
  ./script/secret.mjs set-stdin openai steven
  ./script/secret.mjs get openai steven
  ./script/secret.mjs delete openai steven
`;
  console.error(msg.trimStart());
  process.exit(exitCode);
}

async function readAllStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

const [cmd, service, account, secretArg] = process.argv.slice(2);

if (!cmd) usage();

if (cmd === 'set') {
  if (!service || !account || typeof secretArg !== 'string') usage();
  await keytar.setPassword(service, account, secretArg);
  console.log('OK');
  process.exit(0);
}

if (cmd === 'set-stdin') {
  if (!service || !account) usage();
  if (process.stdin.isTTY) {
    console.error('Refusing to read from TTY. Pipe the secret in. Example:');
    console.error("  (echo -n '...') | ./script/secret.mjs set-stdin <service> <account>");
    process.exit(2);
  }
  const secret = (await readAllStdin()).replace(/\r?\n$/, '');
  if (!secret) {
    console.error('Empty secret. Nothing stored.');
    process.exit(2);
  }
  await keytar.setPassword(service, account, secret);
  console.log('OK');
  process.exit(0);
}

if (cmd === 'get') {
  if (!service || !account) usage();
  const v = await keytar.getPassword(service, account);
  if (v == null) {
    console.error('NOT_FOUND');
    process.exit(3);
  }
  process.stdout.write(v);
  process.exit(0);
}

if (cmd === 'delete') {
  if (!service || !account) usage();
  const ok = await keytar.deletePassword(service, account);
  console.log(ok ? 'OK' : 'NOT_FOUND');
  process.exit(ok ? 0 : 3);
}

usage();
