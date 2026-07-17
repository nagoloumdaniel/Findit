import { z } from "zod";

/// Un identifiant de CV est un UUID. Le motif refuse toute autre forme d'URL.
export const resumeIdSchema = z.object({
  id: z.string().uuid(),
});
export type ResumeIdParam = z.infer<typeof resumeIdSchema>;
