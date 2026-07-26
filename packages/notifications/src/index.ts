export { formatNewJobsMessage } from "./telegram-format.js";
export type { NotifiableJob, TelegramMessage } from "./telegram-format.js";

export { TelegramSender } from "./telegram-sender.js";
export type { TelegramConfig, SendResult } from "./telegram-sender.js";

export { notifyNewJobs, notificationKey } from "./notify.js";
export type { NotifiableJobWithId, NotifyOptions, NotifySummary } from "./notify.js";

export {
  buildHelpReply,
  buildLatestReply,
  buildStartReply,
  buildStatusReply,
  parseTelegramCommand,
  pollTelegramCommands,
} from "./telegram-commands.js";
export type {
  CommandLatestJob,
  CommandStatus,
  PollOutcome,
  TelegramCommand,
  TelegramCommandDeps,
} from "./telegram-commands.js";
