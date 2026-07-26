import { z } from "zod";

import { AiOutputError, AiUnavailableError } from "./errors.js";

/**
 * Transport HTTP, extrait en paramètre pour que le test injecte un faux `fetch`
 * sans réseau. En production, c'est le `fetch` global de Node.
 */
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export type OllamaModelConfig = {
  /** Racine du serveur Ollama, ex. `http://localhost:11434`. Jamais exposée au navigateur. */
  baseUrl: string;
  /** Nom du modèle Ollama, ex. `qwen2.5:7b`. */
  model: string;
  /** Transport, pour le test. Par défaut le `fetch` global. */
  fetch?: FetchLike;
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

export type OllamaModel = {
  /** Rend un objet validé contre `schema`, ou lève. Rien d'inventé ne passe. */
  generateStructured: <T>(request: StructuredRequest<T>) => Promise<T>;
  /** Rend du texte libre (lettre, phrase). Pas de schéma à valider. */
  generateText: (request: TextRequest) => Promise<string>;
};

type ChatMessage = { role: "system" | "user"; content: string };

const CHAT_PATH = "/api/chat";

const buildMessages = (system: string | undefined, prompt: string): ChatMessage[] => {
  const messages: ChatMessage[] = [];
  if (system !== undefined) {
    messages.push({ role: "system", content: system });
  }
  messages.push({ role: "user", content: prompt });
  return messages;
};

/*
 * llama.cpp compile le schéma JSON en grammaire de décodage et ne sait pas
 * compiler certaines regex - notamment les lookaheads des contraintes e-mail
 * et URL de Zod - ce qui fait échouer toute la requête (400 « failed to parse
 * grammar »). Les bornes `minLength`/`maxLength` cassent de la même façon,
 * vérifié contre le serveur réel : une grande borne fait exploser la grammaire
 * déroulée. Ces mots-clés sont donc retirés du schéma *envoyé* ; la
 * revalidation Zod côté application, elle, garde toutes les contraintes.
 * Les clés d'un objet `properties` sont des noms de champs, pas des mots-clés :
 * elles ne sont jamais retirées.
 */
const UNSUPPORTED_KEYWORDS = new Set(["pattern", "format", "minLength", "maxLength"]);

const stripUnsupportedKeywords = (node: unknown, parentKey?: string): unknown => {
  if (Array.isArray(node)) {
    return node.map((item) => stripUnsupportedKeywords(item));
  }
  if (typeof node !== "object" || node === null) {
    return node;
  }
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (parentKey !== "properties" && UNSUPPORTED_KEYWORDS.has(key)) {
      continue;
    }
    cleaned[key] = stripUnsupportedKeywords(value, key);
  }
  return cleaned;
};

/** Lit `payload.message.content` sans faire confiance à la forme reçue. */
const readContent = (payload: unknown): string | null => {
  if (typeof payload !== "object" || payload === null || !("message" in payload)) {
    return null;
  }
  const message: unknown = payload.message;
  if (typeof message !== "object" || message === null || !("content" in message)) {
    return null;
  }
  const content: unknown = message.content;
  return typeof content === "string" && content.trim() !== "" ? content : null;
};

/**
 * Client d'un modèle Ollama local. Deux usages : sortie structurée validée
 * (extraction, analyse) et texte libre (génération). Le serveur tourne sur la
 * machine ; aucune donnée ne quitte le poste.
 */
export const createOllamaModel = (config: OllamaModelConfig): OllamaModel => {
  const transport: FetchLike = config.fetch ?? ((url, init) => fetch(url, init));
  const endpoint = new URL(CHAT_PATH, config.baseUrl).toString();

  const chat = async (body: Record<string, unknown>): Promise<string> => {
    let response: Response;
    try {
      response = await transport(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: config.model, stream: false, ...body }),
      });
    } catch (cause) {
      throw new AiUnavailableError(`Le serveur Ollama (${endpoint}) est injoignable.`, { cause });
    }

    if (!response.ok) {
      throw new AiUnavailableError(`Le serveur Ollama a répondu ${String(response.status)}.`);
    }

    const payload: unknown = await response.json();
    const content = readContent(payload);
    if (content === null) {
      throw new AiOutputError("Réponse Ollama sans texte exploitable.");
    }
    return content;
  };

  return {
    async generateStructured<T>(request: StructuredRequest<T>): Promise<T> {
      // Le schéma JSON contraint le décodage du modèle côté Ollama ; on revalide
      // ensuite côté nous, car une contrainte n'est pas une garantie.
      const format = stripUnsupportedKeywords(z.toJSONSchema(request.schema));
      const content = await chat({
        format,
        options: { temperature: request.temperature ?? 0 },
        messages: buildMessages(request.system, request.prompt),
      });

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
      return chat({
        options: { temperature: request.temperature ?? 0.4 },
        messages: buildMessages(request.system, request.prompt),
      });
    },
  };
};
