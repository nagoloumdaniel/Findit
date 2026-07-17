import { loadRootEnv } from "@findit/config";

/*
 * Les tests d'intégration construisent les vrais modules Nest, et `PrismaModule`
 * lit DATABASE_URL dès sa fabrique. Sans le `.env` de la racine, ils
 * échoueraient sur une variable manquante au lieu de porter sur leur objet.
 *
 * Le chargement se fait ici, dans chaque processus de test, et non dans la
 * configuration Vitest : c'est ici que `process.env` est réellement lu.
 */
loadRootEnv();
