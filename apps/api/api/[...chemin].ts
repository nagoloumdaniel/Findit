import "reflect-metadata";

import helmet from "@fastify/helmet";
import { parseApiEnv } from "@findit/config";
import { NestFactory } from "@nestjs/core";
import { type NestFastifyApplication } from "@nestjs/platform-fastify";
import type { IncomingMessage, ServerResponse } from "node:http";

import { AppModule } from "../src/app.module.js";
import { createFastifyAdapter } from "../src/fastify-adapter.js";

/*
 * Point d'entrée Vercel.
 *
 * Le POURQUOI de ce fichier : Vercel n'exécute pas de serveur permanent, il
 * appelle une fonction par requête. On n'écoute donc aucun port : la requête
 * HTTP entrante est injectée directement dans l'instance Fastify via l'événement
 * `request`, exactement comme le ferait le serveur Node.
 *
 * Le POURQUOI du cache : une fonction serverless est réutilisée entre appels (y
 * compris entre plusieurs requêtes d'une même invocation chaude). Réinitialiser
 * Nest à chaque requête coûterait des dizaines de millisecondes de graphe de
 * modules et rouvrirait une connexion à la base à chaque fois.
 */

/** Signature d'une fonction Vercel Node : une requête Node, une réponse Node. */
type ServerlessHandler = (request: IncomingMessage, response: ServerResponse) => Promise<void>;

/*
 * Nest sert `/health` hors de `/api` (`HealthController`). Sur Vercel, la
 * fonction n'est atteignable que sous `/api/` : `vercel.json` réécrit donc
 * `/health` vers `/api/health`. La réécriture fait voir le chemin de destination
 * à la fonction, pas celui du navigateur — il faut donc rétablir ici le chemin
 * attendu par Nest, sinon `/health` arriverait sous `/api/health`, qu'aucune
 * route ne sert.
 */
const HEALTH_ROUTE = "/health";
const HEALTH_REWRITE_PATH = "/api/health";

let application: Promise<NestFastifyApplication> | undefined;

const createApplication = async (): Promise<NestFastifyApplication> => {
  /*
   * `parseApiEnv` lit les variables de la plateforme : sur Vercel il n'y a pas
   * de `.env` à la racine, et `loadRootEnv()` n'est donc pas appelée. Elle ne
   * lèverait pas pour autant — elle rend `null` quand le fichier est absent —
   * mais elle est inutile ici, et son résultat ne doit jamais écraser les
   * variables fournies par Vercel.
   */
  const env = parseApiEnv(process.env);
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, createFastifyAdapter());
  await app.register(helmet);
  app.enableCors({ origin: env.CORS_ORIGIN });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
};

const handler: ServerlessHandler = async (request, response) => {
  try {
    /*
     * On mémorise la promesse, pas l'application : deux requêtes qui arrivent
     * ensemble sur une instance froide partagent la même initialisation au lieu
     * d'en lancer deux. En cas d'échec, la promesse rejetée reste mémorisée :
     * les appels suivants échouent vite au lieu de reconstruire Nest en boucle.
     */
    application ??= createApplication();
    const app = await application;

    // Alias `/health` : voir le POURQUOI de `HEALTH_REWRITE_PATH` plus haut.
    const url = request.url ?? "";
    if (url === HEALTH_REWRITE_PATH || url.startsWith(`${HEALTH_REWRITE_PATH}?`)) {
      request.url = `${HEALTH_ROUTE}${url.slice(HEALTH_REWRITE_PATH.length)}`;
    }

    app.getHttpAdapter().getInstance().server.emit("request", request, response);
  } catch (error) {
    if (response.headersSent) {
      response.end();
      return;
    }

    /*
     * Une erreur d'initialisation (variable manquante, base injoignable) est
     * rendue en JSON lisible plutôt qu'en 500 opaque de la plateforme. Le
     * détail part dans les logs Vercel : il peut contenir une URL de connexion,
     * donc jamais dans la réponse.
     */
    response.statusCode = 500;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ message: "API indisponible." }));
    console.error(
      "Initialisation de l'API impossible :",
      error instanceof Error ? error.message : "inconnu",
    );
  }
};

export default handler;
