/**
 * Runs `prisma generate` from the package root.
 * cPanel / nodevenv often sets cwd to .../nodevenv/.../lib during npm lifecycle hooks.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const schemaPath = path.join(root, 'prisma', 'schema.prisma');

if (!fs.existsSync(schemaPath)) {
  console.log('[postinstall] prisma/schema.prisma not found — skip prisma generate');
  process.exit(0);
}

const result = spawnSync(
  'npx',
  ['--yes', 'prisma@^5.22.0', 'generate'],
  {
    cwd: root,
    stdio: 'inherit',
    shell: true,
    env: process.env,
  }
);

process.exit(result.status === null ? 1 : result.status);
