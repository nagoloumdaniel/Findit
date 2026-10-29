import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

import { SITE_DESCRIPTION, SITE_NAME } from "../lib/site";

/*
 * Image de partage 1200x630, composée à partir du seul logo versionné
 * (`public/logoblanc.png`), du nom du produit et de sa description, sur les
 * couleurs du thème sombre (`--color-ink-950`, `--color-gold-600`). Aucune
 * capture ni visuel d'interface : rien n'est inventé. Rendue au build.
 */
export const alt = `${SITE_NAME} - offres d'emploi en France`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage(): Promise<ImageResponse> {
  const logo = await readFile(join(process.cwd(), "public", "logoblanc.png"));
  const logoSrc = `data:image/png;base64,${logo.toString("base64")}`;

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "0 96px",
        background: "#0b0b0c",
        color: "#ffffff",
      }}
    >
      <div style={{ display: "flex", alignItems: "center" }}>
        <img src={logoSrc} width={132} height={132} alt="" />
        <div style={{ fontSize: 132, fontWeight: 700, letterSpacing: -4, marginLeft: 8 }}>
          indit
        </div>
      </div>
      <div style={{ width: 96, height: 6, background: "#b08d24", marginTop: 48 }} />
      <div
        style={{ fontSize: 40, lineHeight: 1.35, marginTop: 40, maxWidth: 900, color: "#d4d4d8" }}
      >
        {SITE_DESCRIPTION}
      </div>
    </div>,
    size,
  );
}
