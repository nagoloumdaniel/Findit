# Passation - Web Intelligence Agent

Document destiné à un agent qui reprend le travail. Il dit ce qu'est le projet,
comment on y travaille, ce qui est **réellement** fait, ce qui reste, et les
pièges déjà payés.

À jour au 2026-10-06. **Pivot majeur** : Findit (agrégateur d'offres d'alternance
à scrapers figés + espace candidat privé) devient le **Web Intelligence Agent**
(agent IA de collecte web). Le dépôt et les paquets gardent le nom `findit` /
`@findit/*`. Le cahier des charges et la roadmap font foi :
[CAHIER_DES_CHARGES.md](CAHIER_DES_CHARGES.md) et [roadmap.md](roadmap.md).

## 1. Décisions tranchées (2026-10-06)

- **Espace privé candidat supprimé sauf matching/scoring de CV** : profil,
  lettres, suivi de candidatures, rendu PDF, `/espace`, `WorkspaceGuard`
  supprimés ; le matching et le scoring de CV (score CV ↔ offre) sont
  **conservés**, pilotés par DeepSeek (cahier des charges, section 4.11).
- **LLM = DeepSeek API uniquement** (plus d'Ollama local). `@findit/ai` est le
  client DeepSeek réel (`createDeepSeekModel`), importé par le worker, l'API
  matching, `@findit/extract` et `@findit/matching` ; il n'est plus orphelin.
- **MVP V1 d'abord** : Scheduler + Search + Crawl + Extract + LLM classification +
  Deduplication + PostgreSQL + Dashboard, sur 10 à 20 sources.
- **Offres d'écoles exclues** : `looksLikeSchool` (`@findit/extract`) et
  `detectSchoolRisk` (`@findit/job-classification`) écartent écoles et
  organismes de formation.

## 2. État réel (2026-10-06)

### Fait et vérifié

- **Pipeline de l'agent implémenté** dans `packages/orchestrator/src/run-agent.ts`
  (`runAgent(objective, deps)`) : génération de requêtes (`@findit/agent`),
  recherche web Brave (`@findit/job-connectors`), scoring des sources, mémoire
  « URL déjà vue », crawl borné (`@findit/crawler` : HTTP + repli Playwright,
  robots.txt, profondeur/pages/déjà visité), extraction page par page par
  DeepSeek (`@findit/extract`), validation (`isValidOffer`), déduplication par
  titre normalisé, persistance (`@findit/persist`). Les erreurs sont consignées
  dans `AgentError` ; les statuts sont RUNNING / SUCCEEDED / FAILED / STOPPED.
- **Consigne de contrat dans l'extraction** : `SYSTEM_PROMPT` de
  `packages/extract/src/extract.ts` ne retient que l'alternance et le stage, et
  garde une offre dont le contrat n'est pas nommé (la validation tranche).
  Mesure avant/après, même run borné : offres extraites 226 → 5, tokens de sortie
  ~13 k → 2,4 k, coût 12 866 → 5 419 µ$, rejets 178 → 5.
- **Où l'alternance vit vraiment — mesuré, classe de source par classe.** Même
  pipeline d'ingestion, trois familles de sources :

  | Famille                                                      | Découvertes | Acceptées                        | Coût mesuré          |
  | ------------------------------------------------------------ | ----------- | -------------------------------- | -------------------- |
  | Boards d'entreprises (agent : Lever, Greenhouse)             | 4 251       | **0**                            | 0                    |
  | France Travail, 8 métiers, filtre alternance                 | 13          | 2 (mises à jour, **0 nouvelle**) | 0                    |
  | Job boards scrape (Indeed, WTTJ, HelloWork), 8 offres chacun | 23          | **12**                           | 14 200 µ$ (0,0142 $) |

  Un seul cycle de boards a fait passer la base de **18 à 23 offres**. HelloWork
  accepte 7 offres sur 8, Indeed 3 sur 8, WTTJ 2 sur 7 ; partout ailleurs le taux
  est nul. Conclusion : le levier d'alternance est le cycle des job boards scrape,
  pas l'élargissement des recherches d'ATS — élargir France Travail de 1 à 8
  métiers n'a rendu aucune offre nouvelle.
  **Réserves** : mesure à 8 offres par board, alors que les plafonds par défaut
  sont 30 (WTTJ), 40 (HelloWork) et 100 (Indeed) — le rendement et le coût à ces
  plafonds ne sont pas mesurés. Le cycle tourne une fois par jour
  (`SCRAPED_COLLECTION_CRON=0 6 * * *`), avec un plafond de 0,15 $ par cycle et
  4,5 $ par mois.

- **France Travail n'est pas le levier** : une seule recherche (« développeur »)
  suffit à ratisser le métier, l'API filtrant elle-même `natureContrat=alternance`
  et l'Île-de-France. Élargir à huit métiers a rendu 13 offres, dont 2 déjà connues.
- **Agrégateurs déguisés en entreprises écartés** : un locataire d'ATS qui publie
  les offres des autres n'est pas un employeur. `isAggregatorTenant`
  (`packages/job-connectors/src/aggregator-tenants.ts`) porte une liste courte et
  citée — `lever/jobgether` — justifiée par la mesure : 3 501 des 4 251 offres
  d'une collecte de 10 sources. L'agent ne l'enregistre plus et le journal dit
  `source · agrégateur ignoré · lever/jobgether` ; vérifié sur la base réelle
  (95 → 95 sources, aucune écriture).
  **Fait le 2026-10-07** : la ligne `jobgether` enregistrée avant le filtre a été
  retirée du registre — cible unique vérifiée avant suppression, **95 → 94
  sources**, plus aucune source `jobgether`. Le reste du cycle ne paiera donc plus
  ses 3 501 offres par passe. L'entreprise `jobgether` demeure en base, sans
  source : elle ne déclenche aucune collecte.
- **Le journal parle de « source », plus de « source enregistrée »** : la phrase
  vient désormais de l'appelant, qui seul sait s'il a enregistré, ignoré ou
  reconnu. Sinon une source écartée s'affichait comme enregistrée.
- **Les sources fraîchement découvertes sont bien collectées — et le périmètre est
  bien la cause du rendement nul.** Mesure réelle sur les 10 `CompanySource` que
  l'agent venait de créer : **10 collectes sur 10, aucun échec**, **4 251 offres**
  découvertes, **0 acceptée**. Le journal du pipeline (4 251 lignes) dit pourquoi :
  - **3 899** — « Aucun contrat du périmètre n'est nommé : ni alternance, ni stage. »
  - 154 freelance, 99 executive, 29 CDI, 8 contractor, 6 CDD, 4 employee, 2 intern
    (contrat lu hors périmètre) ;
  - **3** refus à l'étape localisation.
    Autrement dit : la chaîne agent → registre → connecteur fonctionne de bout en
    bout, et **91 % des offres publiées par ces entreprises ne nomment aucun contrat
    du périmètre**. Le « 0 inséré » n'est pas un défaut de code : c'est la structure
    du marché atteint. Le levier est le choix des sources, pas le filtrage.
- **Un locataire d'ATS peut être un agrégateur** : `lever/jobgether` a rendu à lui
  seul 3 501 des 4 251 offres (dette : filtrer les locataires qui sont eux-mêmes
  des job boards avant de les enregistrer comme entreprises).
- **L'agent alimente le registre** (décision de périmètre du 2026-10-06) :
  `runAgent` accepte un point d'entrée `discoverSource`, appelé en phase 1 pour
  chaque source retenue par le scoring ; le worker l'implémente
  (`apps/worker/src/collection/register-discovery.ts`) en reconnaissant l'URL
  (`recognizeTarget`) puis en enregistrant l'entreprise (`registerDiscoveredSource`).
  Une entreprise d'ATS à jeton entre au registre, et son connecteur en recollecte
  tout le flux — sans que l'agent ait à payer l'extraction.
  **Mesure réelle** : 84 → 94 `CompanySource` (+10) en un run de 812 µ$, là où
  25 runs d'agent précédents n'en avaient créé aucune.
- **Ce qui n'est PAS enregistrable, et pourquoi** : seuls Greenhouse, Lever et
  Workday se collectent **par jeton** (`TOKEN_CONNECTOR_ATS`). Workable collecte
  par **requête** : lui donner une entreprise n'aurait pas de sens, et l'ajouter
  aux `site:` de la découverte brûlerait du quota pour des cibles jetées. Les
  hôtes inconnus relèvent du registre dynamique, qui exige de lire `robots.txt`.
- **Le journal distingue « nouvelle » de « déjà connue »** : `registerDiscoveredSource`
  rend désormais `created`. Sans cela, l'agent annonçait « enregistrée » 36 fois
  pour 10 sources réellement créées — la même entreprise revue à chaque tour.
- **Dette connue — Greenhouse a deux hôtes** : le registre est unique par
  `(entreprise, domaine)`, or `boards.greenhouse.io` et `job-boards.greenhouse.io`
  sont deux domaines. Mesuré : `doctolib` porte deux `CompanySource`, une par hôte,
  donc une collecte en double (absorbée ensuite par la déduplication des offres).
  Le corriger demande de normaliser l'hôte du connecteur, côté registre.
- **Pages que la source annonce en erreur écartées** : les boards Greenhouse
  reviennent du moteur sous la forme `?error=true` (offre supprimée) et
  consommaient résolution de redirection et crawl sans jamais porter d'offre. Le
  filtre ne retient que `error=true` et `error=1`, écrits par la source — rien de
  deviné. Fréquence mesurée contre Brave : **1 résultat sur 8** sur une requête
  `site:job-boards.greenhouse.io "alternance"`, 0 sur les trois autres essayées.
  Gain réel mais rare, et le dernier run réel n'en a rencontré aucune : la preuve
  est le test, pas la mesure.
- **Prompt de sélection compacté (numéros au lieu d'URL)** : le modèle recopiait les
  adresses complètes, payées en entrée **et** en sortie. Il reçoit maintenant une
  liste numérotée (`3. [90] jobs.lever.co — Alternance développeur`) et répond
  `{"choix":[3,1]}`. Mesure sur un run borné : sélections **862 → 575 µ$** (−33 %),
  rendement identique (2 offres extraites, 0 insérée). Les numéros hors liste, les
  doublons et les non-entiers sont ignorés ; une sortie hors schéma rend l'ordre du
  score. Nuance vérifiée par audit indépendant : le **run** ne baisse que de 100 µ$
  (1 687 → 1 587), parce que le plan (700 → 747) et l'extraction (125 → 265) varient
  d'un run à l'autre — le planificateur est inchangé, c'est la sortie du modèle qui
  n'est pas reproductible au token près. Le gain structurel est celui de la
  sélection ; un run isolé ne le montre pas entier.
- **Run de contrôle après les correctifs** (planificateur + sélecteur + porte de
  conformité + résolution de redirection, mêmes bornes) : 3 tours, 5 pages,
  **aucun doublon de page**, 2 offres extraites, 0 insérée, coût **1 687 µ$** —
  contre 2 493 µ$ au run précédent et 5 419 µ$ avant le ciblage. Les décisions
  pèsent 1 562 µ$ des 1 687, dont 862 µ$ de sélection : le modèle choisit juste,
  mais c'est le poste de dépense principal.
- **Run de contrôle après les trois dernières briques** (requêtes citées + découverte ciblée + porte de conformité), même bornes : 3 tours, 8 pages,
  **0 offre extraite**, aucun refus de conformité, coût **1 028 µ$** — contre
  5 419 µ$ avant le ciblage. Le détail : 4 racines de board traversées
  (`liste ATS`), 4 pages d'offre écartées (`hors contrat`, donc CDI). La chaîne
  est devenue bon marché, conforme et précise ; **le rendement reste nul parce
  que, dans le périmètre autorisé, les pages atteintes sont des CDI**. Les offres
  d'alternance et de stage vivent surtout sur les job boards enregistrés, que le
  cycle natif collecte déjà via leurs connecteurs.
- **Le modèle choisit les sources à crawler** (section 5, `selector.ts`) : le tour
  se fait en deux temps — recherche et scoring, puis choix des sources, puis crawl
  et extraction. Seules des URL candidates peuvent revenir, le nombre est plafonné,
  et toute sortie vide ou hors schéma rend l'ordre du score. Mesuré sur un run
  borné : 3 sélections, 6 pages visitées, 2 offres extraites, 0 insérée, **2 025 µ$**
  dont la moitié dans les décisions. Sans plafond de candidates, la seule première
  sélection coûtait 1 012 µ$ sur 29 sources — d'où la limite aux 12 meilleures.
- **Clé de mémoire normalisée, corrigée après revue adversariale** : la mémoire
  comparait l'URL exacte, donc `?utm=…` ou un slash final faisait re-crawler la même
  page (mesuré : trois fois sur un run). La clé ignore désormais casse, `www.`,
  fragment, slash final et **paramètres de suivi** (`utm_*`, `gclid`, `fbclid`,
  `msclkid`, `lever-source`) — mais **conserve la requête**, car elle porte souvent
  l'identité de la page. Le premier jet l'effaçait : `?page=1` et `?page=2` avaient
  alors la même clé, la seconde page était sautée, et la mémoire étant persistante
  sans expiration la perte était définitive. Trouvé par revue adversariale, pas par
  un test.
- **Pages déjà visitées jamais repayées** : la mémoire persistante est consultée
  aussi pour chaque page, pas seulement pour la source. Sans cela, une page revue
  par un crawl était recomptée et ré-extraite d'un run à l'autre — trou signalé par
  une vérification indépendante.
- **Une page rendue deux fois par un même crawl n'est plus payée deux fois** :
  mesuré sur un run réel, `jobs.lever.co/theodo` et `jobs.lever.co/theodo?`
  sortaient du même résultat et étaient comptées et extraites toutes les deux. Le
  doublon est maintenant écarté par la même clé normalisée. Conséquence visible
  dans les tests : le run de budget compte 5 pages distinctes là où la doublure
  rendait 5 fois les mêmes.
- **Redirections résolues avant le crawl** : `resolveFinalUrl`
  (`packages/crawler/src/resolve.ts`) fait un HEAD — une GET d'un octet si le
  serveur refuse HEAD — et rend l'URL finale sans lire la page. L'agent s'en sert
  avant chaque crawl, donc un alias déjà vu est écarté **sans être payé**.
  Vérifié sur le réel : `/carrieres`, `/carrieres/`, `/company/careers` et
  `ivalua.com/company/careers/` mènent tous à `https://www.ivalua.com/company/careers/`.
  Coût ajouté : une requête d'en-têtes par source candidate, contre un crawl
  complet évité quand c'est un alias connu. C'est ce qui ferme le sens qui restait
  ouvert.
- **Pages non traitées plus jamais mémorisées** : la mémoire inscrivait toutes les
  pages rendues par le crawler, y compris celles jetées par la borne de budget du
  tour ; leurs offres étaient ensuite sautées pour toujours. L'inscription se fait
  maintenant page par page, une fois qu'elle entre dans le budget.
- **Le crawler reçoit ce qui reste au tour** : il pouvait lire jusqu'à
  `maxPagesPerSource` (20) pages pour un tour qui n'en comptait qu'une ou deux. Le
  test `wideCrawl` le démontrait : 15 pages lues pour 6 comptées.
- **Alias de redirection : prouvé, à moitié corrigé.** Mesuré sur Ivalua, cinq
  adresses mènent à la même page : `/company/careers/`, `/company/careers`,
  `/carrieres/`, `/carrieres` et `ivalua.com/company/careers/`. La clé normalisée
  règle les variantes d'écriture, et l'agent mémorise désormais aussi l'URL
  **finale** de chaque page atteinte : une source qui pointerait ensuite sur cette
  URL finale est écartée. **Ce qui reste payant** : l'alias découvert APRÈS la page
  finale, puisque rien ne relie encore `/carrieres` à `/company/careers` avant de
  l'avoir crawlé. Le corriger demande de résoudre la redirection avant de crawler ;
  l'agent ne le fait pas aujourd'hui.
- **Le contrat entre guillemets dans les requêtes** : mesuré contre Brave sur
  `jobs.lever.co`, `développeur alternance` ramenait 1 titre du périmètre sur 10,
  `développeur "alternance"` en ramenait 6 ; `-CDI` n'apportait rien, et
  `stage OR alternance` restait à 3/10. La règle est dans le prompt du
  planificateur (`planner.ts`) et dans le générateur déterministe
  (`search-queries.ts`) ; vérifié sur le modèle réel : 10 requêtes, toutes citant
  le contrat.
- **Porte de conformité des sources découvertes** : l'agent consulte le registre
  avant de crawler (`decideDiscoveredSourceAccess`,
  `packages/job-connectors/src/board-access.ts`, branchée par le worker et
  `run-agent-once.ts`). Un job board connu sans connecteur actif est refusé et le
  refus est journalisé (`source refusée · … · NO_CONNECTOR`). Vérifié sur le
  registre réel : LinkedIn et Glassdoor fermés, Indeed et HelloWork ouverts.
  Auparavant, l'agent crawait n'importe quel domaine rendu par Brave — LinkedIn et
  Glassdoor compris, qu'aucun connecteur ne couvre. `docs/legal-compliance.md`
  reste l'autorité ; la liste des domaines y est bornée.
- **Découverte ciblée sur les pages d'offre** : la racine d'un board d'ATS
  (`isAtsBoardListing`, `packages/agent/src/scoring.ts`) est traversée mais pas
  extraite — ses pages d'offre le sont. Mesure sur un run borné de 8 pages :
  coût **782 µ$ au lieu de 5 419**, mais **1 offre extraite et 0 insérée** : les
  pages d'offre atteintes étaient des CDI, écartées par la porte de contrat. Le
  coût est réglé, le rendement dépend maintenant de la qualité des sources et des
  requêtes.
- **« 0 insérée » n'est pas une panne, c'est mesuré** : sur un run à 178 rejets,
  **156 étaient des CDI hors périmètre**, 12 des métiers hors périmètre (Bras
  droit CEO, communication…), 6 des dates absentes, 2 des freelances, 1 une date
  trop ancienne, 1 un titre. Les sources atteintes sont des **boards d'entreprise
  qui listent tous les contrats** : la porte de contrat ouvre la page parce qu'un
  stage y figure, puis l'extraction rend tout le board. Le levier n'est donc pas
  la validation, il est en amont : viser les offres du périmètre plutôt que les
  boards entiers.
- **Reprise en cascade (CDC §4.7) livrée** dans
  `packages/orchestrator/src/recovery.ts` : par page, relecture bornée d'une page
  vide (`AgentMemory` ne re-crawle pas, mais la relecture repasse par le
  crawler), extraction déterministe des `schema.org JobPosting` en JSON-LD
  (`extractStructuredOffers`) avant le LLM, relance des seuls échecs, et abandon
  journalisé dans `AgentError` avec `retried = true`. Bornes :
  `maxRecoveries` (5) et `maxAttemptsPerStep` / `maxTotalAttempts` du moteur.
- **Coûts visibles au dashboard** : `AgentService.analytics()` agrège le coût des
  runs et les tokens des actions `EXTRACT` (`modelCost`), la page Analytics les
  affiche par jour, et la page Agent donne le coût de chaque run. Les tokens
  n'ont pas de colonne : ils sont lus dans le détail de l'action
  (`parseUsageFromDetail`), avec un test qui épingle le format.
- **Localisation et date corrigées après mesure** : `resolveLocation` lit le code
  postal français (« 92000 Nanterre, France » → 92, alors que la clé de commune
  « 92000 nanterre » ne correspondait à rien et faisait refuser l'offre comme
  vague) ; `parsePublishedAt` exige une forme ISO, sinon la date est illisible
  plutôt qu'interprétée à l'américaine.
- **Suivi de l'usage du modèle** : `@findit/ai` lit `usage.input_tokens` /
  `usage.output_tokens` de chaque réponse, les cumule (`model.usage()`) et les
  facture à la page dans l'action `EXTRACT` (`AgentAction.costMicroUsd`, puis
  `AgentRun.costMicroUsd`). Le coût n'est calculé que si
  `DEEPSEEK_INPUT_USD_PER_MTOK` / `DEEPSEEK_OUTPUT_USD_PER_MTOK` sont fournis ;
  les tokens sont tracés dans tous les cas. Vérifié sur le réel : un appel
  `deepseek-flash` a rendu 11 tokens d'entrée, 1 de sortie, 1 appel.
- **Porte déterministe avant le modèle** (`packages/extract/src/contract.ts`,
  `mentionsPerimeterContract`) : une page hors 2xx est écartée, et une page qui
  ne nomme aucun contrat du périmètre n'appelle pas le modèle. Mesuré sur un run
  réel : 127 offres extraites d'un board hors périmètre, 101 rejetées faute de
  contrat, zéro insérée — la porte supprime ces appels. Elle se remplace par
  `pageGate`.
- **Migration `20261006120000_agent_and_remove_private` écrite** : DROP des tables
  privées (CandidateProfile, Resume, SourceResume, JobMatch, CoverLetter,
  Application, ApplicationEvent, ResumeAnalysis, SourceCoverLetter,
  SourceResumeMatch + 4 enums) et CREATE de Source, AgentRun, AgentAction,
  AgentError, AgentMemory, SearchQuery, CrawlJob, CrawlPage, Extraction, Contact.
  Le schéma Prisma ne contient plus aucun modèle `User`.
- **Web** (`apps/web`, Next.js 16, port 3100) : `/`, `/offres/[slug]`,
  `/dashboard` et ses sections `{agent, analytics, config, crawls, jobs, logs,
matching, sources}`. Pas de `/espace`, pas de `/candidatures`.
- **API** (`apps/api`, NestJS sur Fastify, port 4000) : `GET /health`,
  `GET /api/jobs{,/stats,/filters,/:slug}`, `GET /api/agent/{runs,stats,
analytics,sources,runs/:id}`, `POST /api/matching/score`. Pas d'authentification.
- **Worker** (`apps/worker`, NestJS + BullMQ) : concurrence 1, trois
  planifications — ATS natifs (`JOB_COLLECTION_CRON`, `0 */4 * * *`), job boards
  Apify (`SCRAPED_COLLECTION_CRON`, `0 6 * * *`, si `SCRAPED_SOURCES_ENABLED` +
  jeton Apify), agent (`AGENT_COLLECTION_CRON`, `0 8 * * *`, si
  `AGENT_RUN_ENABLED`). S'y ajoutent les notifications Telegram. Un run unique
  hors BullMQ existe dans `apps/worker/run-agent-once.ts`.
- **Docs** : cahier des charges et roadmap réécrits (pivot + MVP V1).
- **Tests** : `pnpm test --force` (run frais) le 2026-10-06 → **38/38 tâches
  Turborepo réussies, 580 tests verts**. Détail par paquet : job-connectors 190,
  job-normalization 51, job-pipeline 43, crawler 37, agent 36, api 32,
  job-classification 26, worker 26, config 24, notifications 22, extract 18,
  web 16, ai 15, job-deduplication 13, shared 10, persist 10, matching 7,
  orchestrator 2, database 1, ui 1. Un « vert » Turborepo peut venir du cache :
  forcer (`--force`) pour une preuve fraîche.
- **Git** : branche `main`, 134 commits, dernier `d44dd4b` (2026-10-06 17:28).

### Reste à faire

- **Authentification absente** (Q-2 ouverte).
- **Connecteurs spécialisés en repli** (section 4.7, étape 3) non câblés dans
  l'agent : la relecture bornée, l'extraction `JobPosting` JSON-LD et l'abandon
  journalisé sont livrés, mais l'agent n'invoque pas les connecteurs ATS/job
  boards comme stratégie de secours.
- **Boucle d'outils partielle (section 5)** : le modèle choisit les recherches
  (`createLlmQueryPlanner`, `packages/orchestrator/src/planner.ts`, schéma Zod,
  borné à `maxQueries`, repli déterministe sur tout échec), **voit ce que le tour
  a produit** (requêtes exécutées, sources notées, offres retenues, pages
  visitées) et décide via `refine` s'il en faut un autre — `null` arrête. Chaque
  plan est consigné (`AgentAction` DISCOVER, coût compris) avec son numéro de
  tour. Bornes : `maxPlanRounds` (3), plus une **part du budget de pages par
  tour** (`maxPages / maxPlanRounds`) et les bornes de temps. Restent fixes : le
  choix du crawl, de l'extraction et de l'arrêt.
  Mesures : un plan qui commence par des requêtes génériques envoie le crawl sur
  des agrégateurs (403) — le prompt impose donc les `site:` d'abord (80 offres
  extraites en 6 pages, 3 928 µ$). Sans part de budget par tour, le premier tour
  prenait les 8 pages et `refine` n'était jamais appelé ; avec elle, le même run a
  fait 3 tours, le modèle affinant vers les `site:` ATS (12 866 µ$).
- **CSS mort retiré le 2026-10-06** : `apps/web/src/app/globals.css` a perdu ses 24
  règles `.workspace*` et 44 autres classes de l'ancien espace privé
  (`resume-*`, `letter-*`, `application-*`, `match-*`, `triage-*`, `cv-search*`,
  `chip*`), soit 320 lignes. Vérifié : plus aucune référence, accolades équilibrées
  (167/167), `pnpm build` compile le CSS.
- **Application de la migration à la base en ligne** : le rôle applicatif n'est
  pas propriétaire du schéma ; appliquer la migration structurelle via la
  connexion propriétaire, puis `migrate resolve`. L'état en ligne n'est pas
  vérifiable depuis ce dépôt et n'est pas affirmé ici.
- **Questions ouvertes** : Q-1 (hébergement), Q-2 (auth), Q-3 (sources MVP),
  listées en section 15 du cahier des charges.

## 3. Règles de travail (non négociables)

1. **Français**, réponses courtes, sans remplissage. Précision technique intacte.
2. **Une brique à la fois, sur ordre explicite.** Livrer, montrer, attendre.
3. **Vérifier sur le réel** : base, API, modèle réels. Aucun mock non signalé.
4. **Rien d'inventé** : une donnée manquante ou une sortie invalide lève une erreur.
5. **Commit et push seulement sur demande.** Historique linéaire sur `main`.
6. **Le registre de conformité fait foi** ([docs/legal-compliance.md](docs/legal-compliance.md)).
7. **Ne jamais toucher au port 3000** : il appartient à un autre projet. Le site est sur 3100.

## 4. Architecture

Monorepo **pnpm workspaces + Turborepo**. Node `>=24.18 <25`, pnpm `11.13.1`.

- `apps/web` - Next.js 16, port 3100 (site public + dashboard).
- `apps/api` - NestJS sur Fastify, port 4000 (offres, agent, matching).
- `apps/worker` - NestJS + BullMQ (scheduler, collecte, agent).

Les 17 paquets de `packages/` :

- `agent` - requêtes de recherche, scoring des sources, stores run/mémoire.
- `ai` - client DeepSeek (`createDeepSeekModel`) et erreurs associées.
- `config` - schémas d'environnement, `loadRootEnv()`.
- `crawler` - crawl borné HTTP + rendu Playwright, robots.txt, liens/pagination.
- `database` - client Prisma + migrations + seed.
- `extract` - extraction structurée des offres par page, exclusion des écoles.
- `job-classification` - classification (contrat, rôle) et détection d'écoles.
- `job-connectors` - connecteurs ATS/job boards, Brave, registre, garde de budget.
- `job-deduplication` - similarité et décision de doublon.
- `job-normalization` - HTML → texte, titres normalisés, localisation.
- `job-pipeline` - décision d'ingestion, slug, persistance pipeline.
- `matching` - structuration de CV et score CV ↔ offre (DeepSeek).
- `notifications` - Telegram (format, envoi, commandes).
- `orchestrator` - boucle `runAgent` (search → crawl → extract → persist).
- `persist` - persistance des offres retenues par le run.
- `shared` - périmètre des offres partagé.
- `ui` - composants partagés (`PageShell`).

## 5. Environnement

```bash
pnpm install
pnpm infra:up           # postgres + redis via docker compose
pnpm db:migrate
pnpm dev                # turbo, toutes les apps
```

`.env` vit à la racine ; `loadRootEnv()` de `@findit/config` le retrouve. Le LLM
DeepSeek se configure via la clé de plateforme (voir §6).

## 6. Outillage DeepSeek

Claude Code est branché sur un compte DeepSeek
(`@deepseek-ai/dsh-subagent-claude-code`, profil `desktop` par défaut). Deux
scripts du dépôt, vérifiés présents :

- [scripts/update-claude-subagent.cjs](scripts/update-claude-subagent.cjs) :
  aligne le bundle sous-agent sur la version de DeepSeek Harness après une mise à
  jour (`node scripts/update-claude-subagent.cjs`, ou `--check` pour constater).
- [scripts/compare-deepseek-models.cjs](scripts/compare-deepseek-models.cjs) :
  compare `deepseek-flash` et `deepseek-v4-pro` sur quatre questions de
  raisonnement, à contexte identique
  (`node scripts/compare-deepseek-models.cjs <clé> [filtre] [--dry]`).

Non vérifiable depuis le dépôt, donc à reconfirmer côté plateforme : l'alias des
noms de modèles Claude (`claude-opus-*` → `deepseek-v4-pro`,
`claude-sonnet-*`/`claude-haiku-*` → `deepseek-flash`), la prise en charge de la
vision, et le fait que la clé de compte n'est pas une clé API.

## 7. Pièges déjà payés

- **`.env` non lu** : appeler `loadRootEnv()` avant toute lecture de `process.env`.
- **`next build` cassé par `NODE_ENV`** : `apps/web/run-next.mjs` retire `NODE_ENV` du `.env`.
- **Injection NestJS silencieusement cassée** : écrire `@Inject(MonService)` explicite.
- **Champs JSON Prisma** : stocker des objets validés par Zod, jamais de sortie IA brute.
- **Port 4000 occupé** : `Get-NetTCPConnection -LocalPort 4000`.
- **Le rôle applicatif n'est pas propriétaire du schéma** (base en ligne) : une
  migration structurelle échoue ; l'appliquer avec la connexion propriétaire, puis
  `migrate resolve`. Cela vaut pour la migration `20261006120000`.
- **Hook de pré-push local** : `.githooks/pre-push` rejoue `format:check`,
  `typecheck`, `lint` et `test`.
- **Un « vert » peut venir du cache Turborepo** : forcer (`--force`) et une tâche par
  invocation pour une preuve.
- **Node de la machine v24.10.0** alors que le dépôt exige `>= 24.18 < 25`.
- **Un test peut flotter sous charge** : relancer en run frais avant de conclure.

## 8. Vérifier son travail

```bash
pnpm format:check
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```
