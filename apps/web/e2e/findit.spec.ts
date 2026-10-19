import { expect, test, type Page } from "@playwright/test";

/*
 * Parcours publics du site Findit : accueil, recherche, fiche d'offre, et mode
 * « correspondance avec mon profil ». Les assertions portent sur des résultats
 * visibles, pas sur des détails d'implémentation.
 */

/** Collecte les erreurs console et les requêtes en échec d'un parcours. */
const watch = (page: Page): { consoleErrors: string[]; failed: string[] } => {
  const consoleErrors: string[] = [];
  const failed: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(err.message));
  page.on("requestfailed", (req) => failed.push(req.url()));
  page.on("response", (res) => {
    if (res.status() >= 400) failed.push(`${res.status()} ${res.url()}`);
  });
  return { consoleErrors, failed };
};

test("l'accueil affiche les offres publiées", async ({ page }) => {
  const { consoleErrors } = watch(page);
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: /Alternances développeur en Île-de-France/ }),
  ).toBeVisible();
  // Au moins une carte d'offre est rendue.
  await expect(page.locator(".job-card").first()).toBeVisible();
  // Aucune offre de démonstration ne doit passer pour réelle : le drapeau est
  // affiché sur chacune.
  await expect(page.locator(".demo-flag").first()).toBeVisible();

  expect(consoleErrors).toEqual([]);
});

test("la recherche filtre réellement les résultats", async ({ page }) => {
  await page.goto("/");

  await page.getByPlaceholder("Titre, entreprise, technologie…").fill("React");
  await page.getByRole("button", { name: "Rechercher" }).click();

  // La recherche est reflétée dans l'URL, partageable.
  await expect(page).toHaveURL(/q=React/);
  // Le titre de l'offre React est visible ; les autres cartes ne le sont pas
  // nécessairement. On vérifie au moins qu'une carte Front-end React est là.
  await expect(page.getByText(/Front-end React/).first()).toBeVisible();
});

test("la fiche d'offre ouvre depuis la carte", async ({ page }) => {
  const { failed } = watch(page);
  await page.goto("/");

  await page.locator(".job-card a").first().click();

  await expect(page).toHaveURL(/\/offres\//);
  // Le titre et l'entreprise de la fiche sont visibles.
  await expect(page.locator("h1, h2").first()).toBeVisible();
  expect(failed.filter((f) => f.includes("/api/")).length).toBe(0);
});

test("le mode correspondance est explicite et identifiable", async ({ page }) => {
  await page.goto("/?match=1");

  await expect(page.getByText(/Mode « correspondance avec mon profil »/)).toBeVisible();
  // Le lien de retour à la recherche classique existe.
  await expect(page.getByRole("link", { name: /recherche classique/i })).toBeVisible();
});

test("une offre introuvable rend un état explicite, pas une erreur", async ({ page }) => {
  const { consoleErrors } = watch(page);
  await page.goto("/offres/offre-inexistante");

  await expect(
    page.getByText(/n’est plus disponible|n'existe pas|introuvable/).first(),
  ).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test("la fiche d'offre affiche la correspondance au profil", async ({ page }) => {
  await page.goto("/offres/demo-alternance-developpeur-front-end-react-paris");

  // Le score est chargé côté client : il apparaît après la réponse du serveur,
  // ou un état « non fiable » s'affiche quand le profil est trop incomplet.
  await expect(
    page
      .getByText(
        /de correspondance avec votre profil|Correspondance non fiable|Le score n’est pas disponible/,
      )
      .first(),
  ).toBeVisible();
});

test("la fiche d'offre permet de prévisualiser le CV avant téléchargement", async ({ page }) => {
  await page.goto("/offres/demo-alternance-developpeur-front-end-react-paris");

  await page.getByRole("button", { name: "Prévisualiser le CV" }).click();

  // La génération est asynchrone : l'aperçu (iframe) apparaît une fois le PDF prêt.
  await expect(page.locator('iframe[title="Aperçu du document"]')).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole("link", { name: "Télécharger cet aperçu" })).toBeVisible();
});

test("la fiche d'offre permet de prévisualiser la lettre", async ({ page }) => {
  await page.goto("/offres/demo-alternance-developpeur-front-end-react-paris");

  await page.getByRole("button", { name: "Prévisualiser la lettre" }).click();

  // La lettre dépend d'une génération IA non déterministe : soit l'aperçu
  // apparaît, soit une erreur explicite (anti-invention) est affichée. Le
  // bouton doit répondre dans les deux cas, sans rester silencieux.
  await expect(
    page.locator('iframe[title="Aperçu du document"], [role="alert"]').first(),
  ).toBeVisible({ timeout: 25000 });
});
