import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const UNIVERSITIES = [
  'Bangladesh University',
  'BRAC University',
  'Daffodil International University',
  'Fareast University',
  'Independent University Bangladesh',
  'North South University',
  'Sonargaon University',
  'United International University',
  'University of Liberal Arts Bangladesh',
  'University of Scholars',
];

async function main() {
  for (let i = 0; i < UNIVERSITIES.length; i++) {
    const name = UNIVERSITIES[i];
    const uni = await prisma.university.upsert({
      where: { name },
      update: { sortOrder: i },
      create: { name, sortOrder: i },
    });
    await prisma.voteCount.upsert({
      where: { universityId: uni.id },
      update: {},
      create: { universityId: uni.id, count: 0 },
    });
  }

  const passwordHash = await bcrypt.hash('nsp2026', 12);
  await prisma.admin.upsert({
    where: { username: 'admin' },
    update: { passwordHash },
    create: { username: 'admin', passwordHash },
  });

  // 10 Nov 2026 23:59:59 Asia/Dhaka (UTC+6)
  const votingEndsAt = new Date('2026-11-10T17:59:59.000Z');
  await prisma.setting.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, votingEndsAt },
  });

  console.log('Seed complete: universities + admin/nsp2026 + votingEndsAt');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });