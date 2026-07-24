import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { AiOutputError, AiUnavailableError } from "./errors.js";
import { createOllamaModel, type FetchLike } from "./ollama-client.js";

const Cv = z.object({ nom: z.string(), competences: z.array(z.string()) });

/** Faux transport : rend une réponse fixée, sans réseau. Doublure de test. */
const respondWith = (payload: unknown, status = 200): FetchLike =>
  vi.fn(
    (): Promise<Response> =>
      Promise.resolve(
        new Response(JSON.stringify(payload), {
          status,
          headers: { "content-type": "application/json" },
        }),
      ),
  );

const modelWith = (fetchLike: FetchLike) =>
  createOllamaModel({ baseUrl: "http://localhost:11434", model: "qwen2.5:7b", fetch: fetchLike });

describe("createOllamaModel.generateStructured", () => {
  it("rend l'objet validé quand la sortie colle au schéma", async () => {
    const transport = respondWith({
      message: { content: JSON.stringify({ nom: "Jean Dupont", competences: ["TypeScript"] }) },
    });
    const model = modelWith(transport);

    const out = await model.generateStructured({ schema: Cv, prompt: "CV : Jean Dupont, TypeScript." });

    expect(out).toEqual({ nom: "Jean Dupont", competences: ["TypeScript"] });
    expect(transport).toHaveBeenCalledWith(
      "http://localhost:11434/api/chat",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("lève AiOutputError quand la sortie n'est pas du JSON", async () => {
    const model = modelWith(respondWith({ message: { content: "pas du json {" } }));
    await expect(model.generateStructured({ schema: Cv, prompt: "x" })).rejects.toBeInstanceOf(
      AiOutputError,
    );
  });

  it("lève AiOutputError quand le JSON ne respecte pas le schéma", async () => {
    const model = modelWith(respondWith({ message: { content: JSON.stringify({ nom: 42 }) } }));
    await expect(model.generateStructured({ schema: Cv, prompt: "x" })).rejects.toBeInstanceOf(
      AiOutputError,
    );
  });

  it("lève AiUnavailableError quand le serveur répond en erreur", async () => {
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

describe("createOllamaModel.generateText", () => {
  it("rend le texte brut du modèle", async () => {
    const model = modelWith(respondWith({ message: { content: "Bonjour, voici ma lettre." } }));
    await expect(model.generateText({ prompt: "écris une lettre" })).resolves.toBe(
      "Bonjour, voici ma lettre.",
    );
  });
});
