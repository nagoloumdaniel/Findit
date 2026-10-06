import { z } from "zod";

import { AiOutputError, AiUnavailableError } from "./errors.js";

/**
 * Transport HTTP, extrait en paramètre pour que le test injecte un faux `fetch`
 * sans réseau. En production, c'est le `fetch` global de Node.
 */
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export type DeepSeekModelConfig = {
  /** Clé de plateforme DeepSeek, portée par l'en-tête `x-api-key`. Jamais exposée. */
  apiKey: string;
  /** Modèle DeepSeek. `deepseek-flash` par défaut, `deepseek-v4-pro` pour le raisonnement fort. */
  model: string;
  /** Transport, pour le test. Par défaut le `fetch` global. */
  fetch?: FetchLike;
  /** Plafond de tokens de la réponse. 4096 par défaut, requis par l'API. */
  maxTokens?: number;
};

export type StructuredRequest<T> = {
  /** Schéma attendu. Sert à contraindre le modèle *et* à valider sa sortie. */
  schema: z.ZodType<T>;
  /** Consigne utilisateur (le texte à traiter). */
  prompt: string;
  /** Cadre système facultatif (le rôle, les règles). */
  system?: string;
  /** 0 par défaut : on veut de l'extraction stable, pas de la créativité. */
  temperature?: number;
};

export type TextRequest = {
  prompt: string;
  system?: string;
  /** 0.4 par défaut : un peu de latitude pour un texte qui se lit bien. */
  temperature?: number;
};

export type DeepSeekModel = {
  /** Rend un objet validé contre `schema`, ou lève. Rien d'inventé ne passe. */
  generateStructured: <T>(request: StructuredRequest<T>) => Promise<T>;
  /** Rend du texte libre. Pas de schéma à valider. */
  generateText: (request: TextRequest) => Promise<string>;
};

type ChatMessage = { role: "user"; content: string };
type TextBlock = { type: "text"; text: unknown };

/*
 * DeepSeek expose un endpoint compatible Anthropic. L'en-tête `x-api-key` porte
 * la clé de plateforme (une clé de compte ne suffit pas, voir HANDOFF.md §6) et
 * `anthropic-version` est exigé par ce protocole.
 */
const ENDPOINT = "https://api.deepseek.com/anthropic/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MAX_TOKENS = 4096;

/** Reconnaît un bloc texte Anthropic sans faire confiance à la forme reçue. */
const isTextBlock = (block: unknown): block is TextBlock => {
  if (typeof block !== "object" || block === null) {
    return false;
  }
  const candidate = block as { type?: unknown };
  return candidate.type === "text";
};

/**
 * Lit `payload.content` (liste de blocs Anthropic) et rend le texte des blocs
 * `type: "text"` concaténés. Une réponse sans texte exploitable renvoie `null`,
 * jamais une chaîne inventée.
 */
const readContent = (payload: unknown): string | null => {
  if (typeof payload !== "object" || payload === null || !("content" in payload)) {
    return null;
  }
  const content = payload.content;
  if (!Array.isArray(content)) {
    return null;
  }

  const blocks: unknown[] = content;
  const texts: string[] = [];
  for (const block of blocks) {
    if (isTextBlock(block) && typeof block.text === "string") {
      texts.push(block.text);
    }
  }
  const joined = texts.join("\n").trim();
  return joined !== "" ? joined : null;
};

/**
 * Construit la consigne système de la sortie structurée. Le schéma JSON est
 * glissé dans le prompt système : l'endpoint Anthropic de DeepSeek n'a pas
 * d'équivalent du champ `format` d'Ollama. La revalidation Zod côté application
 * reste la vraie garantie.
 */
const structuredSystem = <T>(system: string | undefined, schema: z.ZodType<T>): string => {
  const jsonSchema = JSON.stringify(z.toJSONSchema(schema));
  const instruction =
    "Réponds uniquement avec un objet JSON conforme au schéma ci-dessous, sans texte autour. " +
    `Schéma : ${jsonSchema}`;
  if (system === undefined) {
    return instruction;
  }
  return `${system}\n\n${instruction}`;
};

/**
 * Client du modèle DeepSeek. Deux usages : sortie structurée validée
 * (extraction, analyse) et texte libre. La clé de plateforme est obligatoire.
 */
export const createDeepSeekModel = (config: DeepSeekModelConfig): DeepSeekModel => {
  // Échec rapide plutôt qu'un 401 incompréhensible plus tard : sans clé, rien ne
  // peut être tenté, et on le dit clairement dès la création du client.
  if (config.apiKey.trim() === "") {
    throw new Error("La clé API DeepSeek est absente : renseigner DEEPSEEK_API_KEY.");
  }

  const transport: FetchLike = config.fetch ?? ((url, init) => fetch(url, init));
  const maxTokens = config.maxTokens ?? DEFAULT_MAX_TOKENS;

  const chat = async (
    messages: ChatMessage[],
    temperature: number,
    system?: string,
  ): Promise<string> => {
    const body: Record<string, unknown> = {
      model: config.model,
      max_tokens: maxTokens,
      temperature,
      messages,
    };
    if (system !== undefined) {
      body.system = system;
    }

    let response: Response;
    try {
      response = await transport(ENDPOINT, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "anthropic-version": ANTHROPIC_VERSION,
          "x-api-key": config.apiKey,
        },
        body: JSON.stringify(body),
      });
    } catch (cause) {
      throw new AiUnavailableError(`L'API DeepSeek (${ENDPOINT}) est injoignable.`, { cause });
    }

    if (!response.ok) {
      throw new AiUnavailableError(`L'API DeepSeek a répondu ${String(response.status)}.`);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (cause) {
      throw new AiOutputError("L'API DeepSeek a renvoyé un corps illisible (pas du JSON).", {
        cause,
      });
    }

    const content = readContent(payload);
    if (content === null) {
      throw new AiOutputError("Réponse DeepSeek sans texte exploitable.");
    }
    return content;
  };

  return {
    async generateStructured<T>(request: StructuredRequest<T>): Promise<T> {
      // Le schéma est envoyé au modèle dans le prompt système, puis la sortie est
      // revalidée côté nous : une consigne n'est pas une garantie.
      const content = await chat(
        [{ role: "user", content: request.prompt }],
        request.temperature ?? 0,
        structuredSystem(request.system, request.schema),
      );

      let raw: unknown;
      try {
        raw = JSON.parse(content);
      } catch {
        throw new AiOutputError("La sortie du modèle n'est pas du JSON valide.");
      }

      const parsed = request.schema.safeParse(raw);
      if (!parsed.success) {
        throw new AiOutputError(
          `La sortie du modèle ne respecte pas le schéma attendu : ${parsed.error.message}`,
        );
      }
      return parsed.data;
    },

    async generateText(request: TextRequest): Promise<string> {
      return chat(
        [{ role: "user", content: request.prompt }],
        request.temperature ?? 0.4,
        request.system,
      );
    },
  };
};
