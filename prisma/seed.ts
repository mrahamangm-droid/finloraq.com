/**
 * Local/dev seed only — creates one demo admin user and one demo company
 * via the same createCompanyForUser() path the real onboarding UI uses, so
 * the seed can never drift from production behavior. Never run against a
 * production database with real customer data.
 */
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";
import { createCompanyForUser } from "../src/lib/onboarding";

const prisma = new PrismaClient();

async function main() {
  const email = "demo@finloraq.com";
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log("Demo user already exists, skipping seed.");
    return;
  }

  const passwordHash = await hashPassword("DemoPassword123!");
  const user = await prisma.user.create({
    data: { name: "Demo Admin", email, passwordHash },
  });

  const company = await createCompanyForUser({
    userId: user.id,
    name: "Finloraq Demo LLC",
    countryCode: "AE",
    baseCurrency: "AED",
  });

  console.log(`Seeded demo user ${email} / DemoPassword123! in company ${company.name}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
