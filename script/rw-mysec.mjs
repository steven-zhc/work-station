#!/usr/bin/env node
/**
 * rw-mysec.mjs — read secrets from keytar and run a command with env injected.
 *
 * Usage:
 *   ./script/rw-mysec.mjs <specs> -- <cmd> [args...]
 *
 * Where <specs> is a comma-separated list of:
 *   <service>:<account>:<KEY_NAME>
 *
 * Each secret is stored under (service, account:KEY_NAME) and is injected as env KEY_NAME.
 *
 * Example:
 *   ./script/rw-mysec.mjs \
 *     vercel:nextloom.ai:GITHUB_TOKEN,vercel:nextloom.ai:DEPLOY_TOKEN \
 *     -- node ./my-app.mjs
 */

import keytar from 'keytar';
import { spawn } from 'node:child_process';

function usage(exitCode = 1) {
  console.error(`\nUsage:\n  rw-mysec.mjs <service>:<account>:<KEY_NAME>[,...] -- <cmd> [args...]\n`.trimStart());
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

const specs = specStr
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)
  .map(s => {
    const parts = s.split(':');
    if (parts.length < 3) throw new Error(`Invalid spec: ${s}`);
    const keyName = parts.pop();
    const account = parts.pop();
    const service = parts.join(':');
    return { service, account, keyName };
  });

const env = { ...process.env };
for (const sp of specs) {
  const accountKey = `${sp.account}:${sp.keyName}`;
  const v = await keytar.getPassword(sp.service, accountKey);
  if (v == null) {
    console.error(`Missing secret in keychain: ${sp.service}:${sp.account}:${sp.keyName}`);
    process.exit(3);
  }
  env[sp.keyName] = v;
}

const child = spawn(cmd, cmdArgs, { stdio: 'inherit', env, shell: false });
child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
