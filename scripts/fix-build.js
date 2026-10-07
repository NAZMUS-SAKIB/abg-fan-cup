const fs = require('fs');
const path = require('path');
const pkgPath = path.join('backend', 'package.json');
const j = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
j.scripts.build = 'rimraf dist && tsc -p tsconfig.build.json --incremental false';
// Prefer rimraf if available; else use node fs without rimraf dependency
j.scripts.build = "node -e \"require('fs').rmSync('dist',{recursive:true,force:true})\" && tsc -p tsconfig.build.json --incremental false";
fs.writeFileSync(pkgPath, JSON.stringify(j, null, 2) + '\n');
console.log('build script:', j.scripts.build);

let gi = fs.readFileSync('.gitignore', 'utf8');
if (!gi.includes('tsbuildinfo')) {
  gi += '\n*.tsbuildinfo\n';
  fs.writeFileSync('.gitignore', gi);
}