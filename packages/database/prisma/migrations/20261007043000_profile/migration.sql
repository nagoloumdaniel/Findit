-- Profil personnel du proprietaire : table singleton, purement additive.
-- Une seule ligne, dont l'identifiant est toujours 'default' ; c'est la cle
-- primaire qui garantit l'unicite, sans colonne de garde supplementaire.
-- Le SQL est celui genere par Prisma (migrate diff), pas une approximation.

-- CreateTable
CREATE TABLE "Profile" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL DEFAULT '',
    "headline" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "city" TEXT,
    "links" JSONB NOT NULL DEFAULT '[]',
    "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "languages" JSONB NOT NULL DEFAULT '[]',
    "experiences" JSONB NOT NULL DEFAULT '[]',
    "cvText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);
