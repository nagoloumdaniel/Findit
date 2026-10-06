import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { AiOutputError, AiUnavailableError } from "./errors.js";
import { createDeepSeekModel, type FetchLike } from "./deepseek-client.js";

const Cv = z.object({ nom: z.string(), competences: z.array(z.string()) });

/** Faux transport : rend une réponse fixée, sans réseau. Doublure de test. */
const respondWith = (payload: unknown, status = 200): FetchLike =>
  vi.fn((): Promise<Response> =>
    Promise.resolve(
      new Response(JSON.stringify(payload), {
        status,
        headers: { "content-type": "application/json" },
      }),
    ),
  );

const modelWith = (fetchLike: FetchLike) =>
  createDeepSeekModel({ apiKey: "cle-de-test", model: "deepseek-flash", fetch: fetchLike });

describe("createDeepSeekModel.generateStructured", () => {
  it("rend l'objet validé quand la sortie colle au schéma", async () => {
    const transport = respondWith({
      content: [
        { type: "text", text: JSON.stringify({ nom: "Jean Dupont", competences: ["TypeScript"] }) },
      ],
    });
    const model = modelWith(transport);

    const out = await model.generateStructured({
      schema: Cv,
      prompt: "CV : Jean Dupont, TypeScript.",
    });

    expect(out).toEqual({ nom: "Jean Dupont", competences: ["TypeScript"] });
    expect(transport).toHaveBeenCalledWith(
      "https://api.deepseek.com/anthropic/v1/messages",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("envoie le schéma Zod dans la consigne système", async () => {
    const transport = respondWith({
      content: [{ type: "text", text: JSON.stringify({ nom: "Jean", competences: [] }) }],
    });
    const model = modelWith(transport);

    await model.generateStructured({ schema: Cv, prompt: "x" });

    const init = vi.mocked(transport).mock.calls[0]?.[1];
    if (init === undefined || typeof init.body !== "string") {
      throw new Error("Le transport n'a pas reçu de corps de requête.");
    }
    const sent = JSON.parse(init.body) as { system: string };
    expect(sent.system).toContain("nom");
    expect(sent.system).toContain("competences");
  });

  it("porte la clé dans l'en-tête x-api-key", async () => {
    const transport = respondWith({
      content: [{ type: "text", text: JSON.stringify({ nom: "Jean", competences: [] }) }],
    });
    const model = modelWith(transport);

    await model.generateStructured({ schema: Cv, prompt: "x" });

    const init = vi.mocked(transport).mock.calls[0]?.[1];
    expect(init?.headers).toMatchObject({ "x-api-key": "cle-de-test" });
  });

  it("lève AiOutputError quand la sortie n'est pas du JSON", async () => {
    const model = modelWith(respondWith({ content: [{ type: "text", text: "pas du json {" }] }));
    await expect(model.generateStructured({ schema: Cv, prompt: "x" })).rejects.toBeInstanceOf(
      AiOutputError,
    );
  });

  it("lève AiOutputError quand le JSON ne respecte pas le schéma", async () => {
    const model = modelWith(
      respondWith({ content: [{ type: "text", text: JSON.stringify({ nom: 42 }) }] }),
    );
    await expect(model.generateStructured({ schema: Cv, prompt: "x" })).rejects.toBeInstanceOf(
      AiOutputError,
    );
  });

  it("lève AiOutputError quand la réponse n'a aucun bloc texte", async () => {
    const model = modelWith(respondWith({ content: [] }));
    await expect(model.generateStructured({ schema: Cv, prompt: "x" })).rejects.toBeInstanceOf(
      AiOutputError,
    );
  });

  it("lève AiUnavailableError quand l'API répond en erreur", async () => {
    const model = modelWith(respondWith({}, 500));
    await expect(model.generateStructured({ schema: Cv, prompt: "x" })).rejects.toBeInstanceOf(
      AiUnavailableError,
    );
  });

  it("lève AiUnavailableError quand le transport échoue", async () => {
    const model = modelWith(
      vi.fn((): Promise<Response> => Promise.reject(new Error("connexion refusée"))),
    );
    await expect(model.generateStructured({ schema: Cv, prompt: "x" })).rejects.toBeInstanceOf(
      AiUnavailableError,
    );
  });
});

describe("createDeepSeekModel.generateText", () => {
  it("rend le texte brut du modèle", async () => {
    const model = modelWith(
      respondWith({ content: [{ type: "text", text: "Bonjour, voici ma lettre." }] }),
    );
    await expect(model.generateText({ prompt: "écris une lettre" })).resolves.toBe(
      "Bonjour, voici ma lettre.",
    );
  });

  it("concatène les blocs texte", async () => {
    const model = modelWith(
      respondWith({
        content: [
          { type: "text", text: "Bonjour" },
          { type: "text", text: "voici ma lettre." },
        ],
      }),
    );
    await expect(model.generateText({ prompt: "x" })).resolves.toBe("Bonjour\nvoici ma lettre.");
  });
});

describe("createDeepSeekModel", () => {
  it("lève une erreur explicite quand la clé est absente", () => {
    expect(() => createDeepSeekModel({ apiKey: "", model: "deepseek-flash" })).toThrow(
      /DEEPSEEK_API_KEY/,
    );
  });
});
