-- La plateforme s'ouvre à tous les domaines : un métier hors développement
-- nommé n'est plus rejeté, il est classé OTHER.
ALTER TYPE "RoleCategory" ADD VALUE IF NOT EXISTS 'OTHER';
