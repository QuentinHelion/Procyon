const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  await prisma.scanTemplate.upsert({
    where: { slug: "pingcastle-xml" },
    create: {
      name: "PingCastle (rapport XML)",
      slug: "pingcastle-xml",
      description:
        "Import depuis un fichier XML exporté par PingCastle (Healthcheck / rapport complet).",
      parserId: "pingcastle_xml",
      fileHint: "*.xml",
      isBuiltIn: true,
    },
    update: {},
  });

  await prisma.scanTemplate.upsert({
    where: { slug: "generic-csv" },
    create: {
      name: "CSV générique",
      slug: "generic-csv",
      description:
        "Colonnes : title, severity (INFO|LOW|MEDIUM|HIGH|CRITICAL), description (optionnel), externalRef (optionnel).",
      parserId: "generic_csv",
      fileHint: "*.csv",
      isBuiltIn: true,
    },
    update: {},
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
