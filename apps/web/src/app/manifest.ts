import type { MetadataRoute } from "next";

import { SITE_DESCRIPTION, SITE_NAME } from "../lib/site";

/// Manifeste minimal : nom, couleurs des deux thèmes et le logo déjà versionné.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    lang: "fr",
    start_url: "/",
    display: "browser",
    background_color: "#0b0b0c",
    theme_color: "#0b0b0c",
    icons: [{ src: "/logoblanc.png", sizes: "164x164", type: "image/png" }],
  };
}
