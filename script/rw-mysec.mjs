#!/usr/bin/env node
/**
 * rw-mysec.mjs — read secrets from keytar and run a command with env injected.
 *
 * Usage:
 *   ./script/rw-mysec.mjs <specs> -- <cmd> [args...]
 *
 * Where <specs> is a comma-separated list of either:
 *   - Exact:    <service>:<account>:<KEY_NAME>
 *   - Wildcard: <service>:<account>
 *
 * Storage convention:
 *   - Stored under (service, account:KEY_NAME)
 *   - Injected as env KEY_NAME
 *
 * Examples:
 *   # Exact mapping
 *   ./script/rw-mysec.mjs \
 *     vercel:nextloom.ai:GITHUB_TOKEN,vercel:nextloom.ai:DEPLOY_TOKEN \
 *     -- node ./my-app.mjs
 *
 *   # Wildcard (load ALL secrets under vercel / nextloom.ai)
 *   ./script/rw-mysec.mjs vercel:nextloom.ai -- node ./my-app.mjs
 */

import keytar from 'keytar';
import { spawn } from 'node:child_process';

function usage(exitCode = 1) {
  console.error(
    `\nUsage:\n  rw-mysec.mjs <service>:<account>:<KEY_NAME>[,...] -- <cmd> [args...]\n  rw-mysec.mjs <service>:<account> -- <cmd> [args...]\n\nNotes:\n- The 2-part form (<service>:<account>) loads ALL secrets stored under that service\n  whose account starts with "<account>:" and injects them as env vars.\n`.trimStart(),
  );
  process.exit(exitCode);
}

const argv = process.argv.slice(2);
if (argv.length === 0 || argv[0] === '-h' || argv[0] === '--help') usage(argv.length ? 0 : 1);

const sep = argv.indexOf('--');
if (sep === -1) usage();

const specStr = argv.slice(0, sep).join(' ').trim();
const cmd = argv[sep + 1];
const cmdArgs = argv.slice(sep + 2);
if (!specStr || !cmd) usage();

function parseSpec(s) {
  const parts = s.split(':');
  if (parts.length < 2) throw new Error(`Invalid spec: ${s}`);

  // Wildcard form: <service>:<account>
  if (parts.length === 2) {
    const [service, account] = parts;
    return { kind: 'wildcard', service, account };
  }

  // Exact form: <service>:<account>:<KEY_NAME> (service may itself contain ':')
  const keyName = parts.pop();
  const account = parts.pop();
  const service = parts.join(':');
  return { kind: 'exact', service, account, keyName };
}

const specs = specStr
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)
  .map(parseSpec);

const env = { ...process.env };

for (const sp of specs) {
  if (sp.kind === 'exact') {
    const accountKey = `${sp.account}:${sp.keyName}`;
    const v = await keytar.getPassword(sp.service, accountKey);
    if (v == null) {
      console.error(`Missing secret in keychain: ${sp.service}:${sp.account}:${sp.keyName}`);
      process.exit(3);
    }
    env[sp.keyName] = v;
    continue;
  }

  // wildcard: load all secrets for service where accountKey starts with `${account}:`
  const prefix = `${sp.account}:`;
  const creds = await keytar.findCredentials(sp.service);
  const matches = creds.filter(c => c.account.startsWith(prefix));

  if (matches.length === 0) {
    console.error(`No matching secrets in keychain for prefix: ${sp.service}:${sp.account}`);
    process.exit(3);
  }

  for (const c of matches) {
    const keyName = c.account.slice(prefix.length);
    // Only set reasonable env names
    if (!/^[A-Z_][A-Z0-9_]*$/.test(keyName)) {
      console.error(`Skip invalid env key from keychain account "${c.account}" (derived keyName="${keyName}")`);
      continue;
    }
    env[keyName] = c.password;
  }
}

const child = spawn(cmd, cmdArgs, { stdio: 'inherit', env, shell: false });
child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
