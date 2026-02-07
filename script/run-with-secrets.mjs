#!/usr/bin/env node
/**
 * run-with-secrets.mjs — fetch secrets from keytar, inject into env, run a command.
 *
 * Usage:
 *   ./script/run-with-secrets.mjs --map <service>:<account>:<ENV_NAME> [--map ...] -- <cmd> [args...]
 *
 * Example:
 *   ./script/run-with-secrets.mjs \
 *     --map openai:steven:OPENAI_API_KEY \
 *     --map stripe:work:STRIPE_API_KEY \
 *     -- node ./some-script.mjs
 */

import keytar from 'keytar';
import { spawn } from 'node:child_process';

function usage(exitCode = 1) {
  console.error(`\nUsage:\n  run-with-secrets.mjs --map <service>:<account>:<ENV_NAME> [--map ...] -- <cmd> [args...]\n`.trimStart());
  process.exit(exitCode);
}

const argv = process.argv.slice(2);
const maps = [];
let i = 0;
for (; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--') { i++; break; }
  if (a === '--map') {
    const v = argv[++i];
    if (!v) usage();
    const parts = v.split(':');
    if (parts.length < 3) usage();
    const envName = parts.pop();
    const account = parts.pop();
    const service = parts.join(':');
    maps.push({ service, account, envName });
    continue;
  }
  if (a === '-h' || a === '--help') usage(0);
  console.error(`Unknown arg: ${a}`);
  usage();
}

const cmd = argv[i];
const cmdArgs = argv.slice(i + 1);
if (!cmd) usage();

// Fetch secrets
const env = { ...process.env };
for (const m of maps) {
  const v = await keytar.getPassword(m.service, m.account);
  if (v == null) {
    console.error(`Missing secret in keychain: service=${m.service} account=${m.account} (for env ${m.envName})`);
    process.exit(3);
  }
  env[m.envName] = v;
}

const child = spawn(cmd, cmdArgs, {
  stdio: 'inherit',
  env,
  shell: false,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
