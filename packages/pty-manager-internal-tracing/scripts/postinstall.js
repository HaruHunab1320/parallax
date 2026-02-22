const fs = require('fs');
const path = require('path');

const platform = `${process.platform}-${process.arch}`;

// spawn-helper is in node-pty's prebuilds directory
const possiblePaths = [
  // When installed as dependency (node_modules/pty-manager/node_modules/node-pty)
  path.join(__dirname, '..', 'node_modules', 'node-pty', 'prebuilds', platform, 'spawn-helper'),
  // When in monorepo with hoisted deps
  path.join(__dirname, '..', '..', 'node-pty', 'prebuilds', platform, 'spawn-helper'),
  // When installed at root level
  path.join(__dirname, '..', '..', '..', 'node-pty', 'prebuilds', platform, 'spawn-helper'),
];

let fixed = false;
for (const helper of possiblePaths) {
  if (fs.existsSync(helper)) {
    try {
      fs.chmodSync(helper, 0o755);
      console.log(`[pty-manager] Fixed spawn-helper permissions at ${helper}`);
      fixed = true;
      break;
    } catch (err) {
      // May not have permission, continue to next path
    }
  }
}

if (!fixed && process.platform !== 'win32') {
  // Only warn on Unix-like systems where this matters
  console.log(`[pty-manager] spawn-helper not found for ${platform} (this is normal on some setups)`);
}
