import { resolveAccentColor } from "./colors.js";
import type { CvRenderOptions, CvTemplate } from "./cv-data.js";

/** Options de rendu CV après application des valeurs par défaut. */
export type ResolvedCvOptions = {
  template: CvTemplate;
  accentColor: string;
  showPhoto: boolean;
  photoDataUrl: string | null;
};

/** Applique les valeurs par défaut et valide la couleur d'accent. */
export const resolveCvOptions = (options: CvRenderOptions | undefined): ResolvedCvOptions => ({
  template: options?.template ?? "classique",
  accentColor: resolveAccentColor(options?.accentColor),
  showPhoto: options?.showPhoto ?? false,
  photoDataUrl: options?.photoDataUrl ?? null,
});
