import "dotenv/config";

import { createPrismaClient } from "../src/client.js";

/*
 * Données de démonstration.
 *
 * Toutes les offres créées ici portent `isDemo: true` et sont rattachées à des
 * entreprises fictives. Elles ne correspondent à aucun employeur réel et
 * l'interface doit les signaler comme telles.
 *
 * Le jeu de démonstration prévu par la spécification comprend aussi des offres
 * qui doivent être rejetées : un CDI, un poste DevOps, une offre sans date de
 * publication et une offre hors Île-de-France. Aucune ne peut être créée : le
 * modèle les rend impossibles.
 *
 *   - CDI et DevOps ne sont pas des valeurs des enums ContractType et
 *     RoleCategory.
 *   - `publishedAt` est NOT NULL, donc une offre sans date fiable n'est pas
 *     stockable.
 *   - Une contrainte de contrôle limite `departmentCode` à l'Île-de-France.
 *
 * Ces cas relèvent donc des tests du pipeline de collecte, pas d'un jeu de
 * données : ils ne franchissent jamais l'écriture en base.
 */

const HOUR = 60 * 60 * 1000;
const now = Date.now();
const at = (hoursAgo: number): Date => new Date(now - hoursAgo * HOUR);
/// Toute offre expire au plus tard 72 h après sa publication.
const expiryFor = (publishedAt: Date): Date => new Date(publishedAt.getTime() + 72 * HOUR);

const main = async (): Promise<void> => {
  const connectionString = process.env["DATABASE_URL"];

  if (!connectionString) {
    throw new Error("DATABASE_URL est requis pour insérer les données de démonstration.");
  }

  const prisma = createPrismaClient(connectionString);

  try {
    /*
     * Le seed est rejouable : il ne supprime que ce qu'il a lui-même créé et ne
     * touche jamais à une offre réelle.
     */
    const demoJobs = await prisma.job.findMany({ where: { isDemo: true }, select: { id: true } });
    const demoJobIds = demoJobs.map((job) => job.id);

    await prisma.jobSkill.deleteMany({ where: { jobId: { in: demoJobIds } } });
    await prisma.jobSource.deleteMany({ where: { jobId: { in: demoJobIds } } });
    await prisma.job.deleteMany({ where: { isDemo: true } });
    await prisma.company.deleteMany({ where: { slug: { startsWith: "demo-" } } });

    const [react, typescript, node, postgres, swift] = await Promise.all([
      prisma.skill.upsert({
        where: { slug: "react" },
        update: {},
        create: { slug: "react", name: "React", kind: "FRAMEWORK" },
      }),
      prisma.skill.upsert({
        where: { slug: "typescript" },
        update: {},
        create: { slug: "typescript", name: "TypeScript", kind: "PROGRAMMING_LANGUAGE" },
      }),
      prisma.skill.upsert({
        where: { slug: "nodejs" },
        update: {},
        create: { slug: "nodejs", name: "Node.js", kind: "FRAMEWORK" },
      }),
      prisma.skill.upsert({
        where: { slug: "postgresql" },
        update: {},
        create: { slug: "postgresql", name: "PostgreSQL", kind: "DATABASE" },
      }),
      prisma.skill.upsert({
        where: { slug: "swift" },
        update: {},
        create: { slug: "swift", name: "Swift", kind: "PROGRAMMING_LANGUAGE" },
      }),
    ]);

    const orbit = await prisma.company.create({
      data: {
        slug: "demo-orbit-studio",
        name: "Orbit Studio (démo)",
        normalizedName: "orbit studio",
        website: "https://demo.invalid/orbit",
        careerUrl: "https://demo.invalid/orbit/carrieres",
      },
    });

    const meridien = await prisma.company.create({
      data: {
        slug: "demo-meridien-data",
        name: "Méridien Data (démo)",
        normalizedName: "meridien data",
        website: "https://demo.invalid/meridien",
        careerUrl: "https://demo.invalid/meridien/jobs",
      },
    });

    const published2h = at(2);
    const published9h = at(9);
    const published20h = at(20);
    const published48h = at(48);
    const published96h = at(96);

    /*
     * Publiée il y a 2 h et vue sur trois plateformes. La page carrière porte le
     * rang le plus élevé : elle reste la source privilégiée et les deux
     * agrégateurs restent visibles.
     */
    await prisma.job.create({
      data: {
        isDemo: true,
        slug: "demo-alternance-developpeur-front-end-react-paris",
        title: "Alternance — Développeur Front-end React H/F",
        normalizedTitle: "developpeur front-end react",
        roleCategory: "FRONTEND",
        companyId: orbit.id,
        description:
          "Offre de démonstration. Participation au développement d'une interface de réservation en React et TypeScript, au sein d'une équipe produit.",
        responsibilities: [
          "Développer des composants d'interface accessibles",
          "Participer aux revues de code",
        ],
        requirements: ["Bases solides en JavaScript", "Première expérience avec React"],
        benefits: ["Deux jours de télétravail", "Titres-restaurant"],
        contractType: "ALTERNANCE",
        workMode: "HYBRID",
        city: "Paris",
        departmentCode: "75",
        postalCode: "75011",
        salaryMin: 1100,
        salaryMax: 1500,
        salaryPeriod: "MONTH",
        studyLevel: "Bac+3 à Bac+5",
        duration: "12 à 24 mois",
        publishedAt: published2h,
        firstSeenAt: published2h,
        lastSeenAt: new Date(now),
        expiresAt: expiryFor(published2h),
        canonicalUrl: "https://demo.invalid/orbit/carrieres/front-end-react",
        applyUrl: "https://demo.invalid/orbit/carrieres/front-end-react/postuler",
        schoolRiskScore: 4,
        schoolRiskReasons: [],
        fraudRiskScore: 2,
        fraudRiskReasons: [],
        dataQualityScore: 95,
        confidenceScore: 93,
        status: "PUBLISHED",
        sources: {
          create: [
            {
              name: "Page carrière Orbit Studio",
              url: "https://demo.invalid/orbit/carrieres/front-end-react",
              priority: 100,
              checkedAt: new Date(now),
            },
            {
              name: "LinkedIn",
              url: "https://demo.invalid/linkedin/jobs/view/demo-front-react",
              priority: 60,
              checkedAt: new Date(now),
            },
            {
              name: "Indeed",
              url: "https://demo.invalid/indeed/viewjob?jk=demo-front-react",
              priority: 40,
              checkedAt: new Date(now),
            },
          ],
        },
        skills: {
          create: [
            { skillId: react.id, requirement: "REQUIRED" },
            { skillId: typescript.id, requirement: "PREFERRED" },
          ],
        },
      },
    });

    await prisma.job.create({
      data: {
        isDemo: true,
        slug: "demo-alternance-developpeur-back-end-node-la-defense",
        title: "Alternance Développeur Back-end Node.js",
        normalizedTitle: "developpeur back-end node.js",
        roleCategory: "BACKEND",
        companyId: meridien.id,
        description:
          "Offre de démonstration. Conception et maintenance d'API internes en Node.js sur une base PostgreSQL.",
        responsibilities: ["Concevoir des endpoints REST", "Écrire les tests d'intégration"],
        requirements: ["Notions de SQL", "Curiosité pour la qualité logicielle"],
        benefits: ["Mentorat technique"],
        contractType: "ALTERNANCE",
        workMode: "ONSITE",
        city: "Courbevoie",
        departmentCode: "92",
        postalCode: "92400",
        salaryText: "Selon la grille légale de l'alternance",
        studyLevel: "Bac+4",
        publishedAt: published9h,
        firstSeenAt: published9h,
        lastSeenAt: new Date(now),
        expiresAt: expiryFor(published9h),
        canonicalUrl: "https://demo.invalid/meridien/jobs/back-end-node",
        schoolRiskScore: 6,
        schoolRiskReasons: [],
        fraudRiskScore: 3,
        fraudRiskReasons: [],
        dataQualityScore: 82,
        confidenceScore: 80,
        status: "PUBLISHED",
        sources: {
          create: [
            {
              name: "Page carrière Méridien Data",
              url: "https://demo.invalid/meridien/jobs/back-end-node",
              priority: 100,
              checkedAt: new Date(now),
            },
          ],
        },
        skills: {
          create: [
            { skillId: node.id, requirement: "REQUIRED" },
            { skillId: postgres.id, requirement: "REQUIRED" },
          ],
        },
      },
    });

    /// Un stage, pour que le filtre de contrat ait deux valeurs réelles.
    await prisma.job.create({
      data: {
        isDemo: true,
        slug: "demo-stage-developpeur-mobile-ios-montreuil",
        title: "Stage Développeur Mobile iOS",
        normalizedTitle: "developpeur mobile ios",
        roleCategory: "MOBILE",
        companyId: orbit.id,
        description:
          "Offre de démonstration. Contribution à une application iOS grand public écrite en Swift.",
        responsibilities: ["Implémenter des écrans", "Corriger des anomalies"],
        requirements: ["Bases en Swift"],
        benefits: [],
        contractType: "INTERNSHIP",
        workMode: "HYBRID",
        city: "Montreuil",
        departmentCode: "93",
        publishedAt: published20h,
        firstSeenAt: published20h,
        lastSeenAt: new Date(now),
        expiresAt: expiryFor(published20h),
        canonicalUrl: "https://demo.invalid/orbit/carrieres/stage-ios",
        schoolRiskScore: 8,
        schoolRiskReasons: [],
        fraudRiskScore: 2,
        fraudRiskReasons: [],
        dataQualityScore: 71,
        confidenceScore: 70,
        status: "PUBLISHED",
        sources: {
          create: [
            {
              name: "Page carrière Orbit Studio",
              url: "https://demo.invalid/orbit/carrieres/stage-ios",
              priority: 100,
              checkedAt: new Date(now),
            },
          ],
        },
        skills: { create: [{ skillId: swift.id, requirement: "REQUIRED" }] },
      },
    });

    /// Publiée il y a 48 h : ne doit sortir qu'avec le filtre trois jours.
    await prisma.job.create({
      data: {
        isDemo: true,
        slug: "demo-alternance-developpeur-full-stack-massy",
        title: "Alternance Développeur Full-stack",
        normalizedTitle: "developpeur full-stack",
        roleCategory: "FULLSTACK",
        companyId: meridien.id,
        description:
          "Offre de démonstration. Développement d'un outil interne, du modèle de données à l'interface.",
        responsibilities: ["Développer des fonctionnalités de bout en bout"],
        requirements: ["Bases en JavaScript et SQL"],
        benefits: [],
        contractType: "ALTERNANCE",
        workMode: "REMOTE",
        city: "Massy",
        departmentCode: "91",
        publishedAt: published48h,
        firstSeenAt: published48h,
        lastSeenAt: new Date(now),
        expiresAt: expiryFor(published48h),
        canonicalUrl: "https://demo.invalid/meridien/jobs/full-stack",
        schoolRiskScore: 5,
        schoolRiskReasons: [],
        fraudRiskScore: 2,
        fraudRiskReasons: [],
        dataQualityScore: 68,
        confidenceScore: 66,
        status: "PUBLISHED",
        sources: {
          create: [
            {
              name: "Page carrière Méridien Data",
              url: "https://demo.invalid/meridien/jobs/full-stack",
              priority: 100,
              checkedAt: new Date(now),
            },
          ],
        },
        skills: {
          create: [
            { skillId: typescript.id, requirement: "PREFERRED" },
            { skillId: postgres.id, requirement: "PREFERRED" },
          ],
        },
      },
    });

    /*
     * Publiée il y a 96 h. Marquée EXPIRED et son expiration est dépassée : elle
     * ne doit jamais apparaître, quel que soit le filtre. Elle est présente pour
     * que ce comportement soit vérifiable.
     */
    await prisma.job.create({
      data: {
        isDemo: true,
        slug: "demo-alternance-data-analyst-expiree-cergy",
        title: "Alternance Data Analyst",
        normalizedTitle: "data analyst",
        roleCategory: "DATA_ANALYST",
        companyId: meridien.id,
        description: "Offre de démonstration expirée. Ne doit apparaître dans aucun filtre.",
        responsibilities: [],
        requirements: [],
        benefits: [],
        contractType: "ALTERNANCE",
        workMode: "ONSITE",
        city: "Cergy",
        departmentCode: "95",
        publishedAt: published96h,
        firstSeenAt: published96h,
        lastSeenAt: at(30),
        expiresAt: expiryFor(published96h),
        canonicalUrl: "https://demo.invalid/meridien/jobs/data-analyst-expiree",
        schoolRiskScore: 5,
        schoolRiskReasons: [],
        fraudRiskScore: 2,
        fraudRiskReasons: [],
        dataQualityScore: 64,
        confidenceScore: 60,
        status: "EXPIRED",
        sources: {
          create: [
            {
              name: "Page carrière Méridien Data",
              url: "https://demo.invalid/meridien/jobs/data-analyst-expiree",
              priority: 100,
              checkedAt: at(30),
            },
          ],
        },
      },
    });

    /*
     * Récente mais mise en quarantaine : la classification n'est pas certaine.
     * Elle ne doit pas être publiée automatiquement.
     */
    await prisma.job.create({
      data: {
        isDemo: true,
        slug: "demo-alternance-data-engineer-quarantaine-saclay",
        title: "Alternance Data Engineer",
        normalizedTitle: "data engineer",
        roleCategory: "DATA_ENGINEER",
        companyId: meridien.id,
        description:
          "Offre de démonstration en quarantaine. Classification incertaine, donc non publiée.",
        responsibilities: [],
        requirements: [],
        benefits: [],
        contractType: "ALTERNANCE",
        workMode: "ONSITE",
        city: "Saclay",
        departmentCode: "91",
        publishedAt: published9h,
        firstSeenAt: published9h,
        lastSeenAt: new Date(now),
        expiresAt: expiryFor(published9h),
        canonicalUrl: "https://demo.invalid/meridien/jobs/data-engineer-ambigu",
        schoolRiskScore: 44,
        schoolRiskReasons: ["Le nom de l'employeur réel n'est pas identifiable"],
        fraudRiskScore: 12,
        fraudRiskReasons: [],
        dataQualityScore: 48,
        confidenceScore: 41,
        status: "QUARANTINED",
        sources: {
          create: [
            {
              name: "Découverte par moteur de recherche",
              url: "https://demo.invalid/meridien/jobs/data-engineer-ambigu",
              priority: 20,
              checkedAt: new Date(now),
            },
          ],
        },
      },
    });

    const published = await prisma.job.count({ where: { isDemo: true, status: "PUBLISHED" } });
    const total = await prisma.job.count({ where: { isDemo: true } });

    console.log(
      `Données de démonstration insérées : ${total} offres, dont ${published} publiées, ` +
        `1 expirée et 1 en quarantaine qui ne doivent jamais s'afficher.`,
    );
    console.log("Toutes portent isDemo = true et n'existent chez aucun employeur réel.");
  } finally {
    await prisma.$disconnect();
  }
};

await main();
