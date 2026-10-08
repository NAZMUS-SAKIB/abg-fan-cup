const fs = require('fs');
const src = fs.readFileSync(
  require('path').join(__dirname, '../prisma/schema.prisma'),
  'utf8',
);
const out = src.replace('provider = "postgresql"', 'provider = "sqlite"');
fs.writeFileSync(
  require('path').join(__dirname, '../prisma/schema.sqlite.prisma'),
  out,
);
console.log('schema.sqlite.prisma synced');
