import type { TelegramMessage } from "./telegram-format.js";

export interface TelegramConfig {
  /** Token du bot. Reste privé : jamais journalisé, jamais rendu. */
  readonly botToken: string;
  readonly chatId: string;
  /** Vrai : ne rien envoyer, seulement simuler. */
  readonly dryRun: boolean;
  readonly fetch: typeof globalThis.fetch;
}

export type SendResult =
  | { readonly outcome: "sent" }
  | { readonly outcome: "skipped"; readonly detail: string }
  | { readonly outcome: "failed"; readonly detail: string };

/**
 * Retire toute trace du token d'un texte d'erreur.
 *
 * Le token part dans l'URL de l'API Telegram. Une erreur pourrait la contenir ;
 * ce filtre garantit qu'aucun `detail` conservé ou journalisé ne le laisse
 * passer. La sécurité ne repose pas sur la discipline d'appel, mais sur ce
 * remplacement systématique.
 */
const redactToken = (text: string, token: string): string =>
  token === "" ? text : text.split(token).join("[token]");

/**
 * Envoie un message à Telegram, ou le simule.
 *
 * Le token est tenu dans un champ privé et n'apparaît jamais ailleurs que dans
 * l'URL de la requête, construite au dernier moment. Aucune méthode ne le rend,
 * et toute erreur passe par `redactToken` avant d'être conservée.
 */
export class TelegramSender {
  readonly #botToken: string;
  readonly #chatId: string;
  readonly #dryRun: boolean;
  readonly #fetch: typeof globalThis.fetch;

  constructor(config: TelegramConfig) {
    this.#botToken = config.botToken;
    this.#chatId = config.chatId;
    this.#dryRun = config.dryRun;
    this.#fetch = config.fetch;
  }

  get dryRun(): boolean {
    return this.#dryRun;
  }

  async send(message: TelegramMessage): Promise<SendResult> {
    if (this.#dryRun) {
      return { outcome: "skipped", detail: "Mode simulation : rien n'a été envoyé." };
    }

    const url = `https://api.telegram.org/bot${this.#botToken}/sendMessage`;

    try {
      const response = await this.#fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: this.#chatId,
          text: message.text,
          parse_mode: "HTML",
          disable_web_page_preview: true,
          reply_markup: message.replyMarkup,
        }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        return {
          outcome: "failed",
          detail: redactToken(
            `Telegram a répondu ${String(response.status)} : ${body.slice(0, 200)}`,
            this.#botToken,
          ),
        };
      }

      return { outcome: "sent" };
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Erreur inconnue.";
      return { outcome: "failed", detail: redactToken(detail, this.#botToken) };
    }
  }
}
