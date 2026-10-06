import { describe, expect, it, vi } from "vitest";

import {
  JOB_BOARD_EXCERPT_CHARS,
  excerptOf,
  loadJobBoardSourceNames,
  originOf,
} from "./job-origin.js";

describe("originOf", () => {
  const jobBoards = new Set(["welcome-to-the-jungle"]);

  it("reconnait une source de job board", () => {
    expect(originOf("welcome-to-the-jungle", jobBoards)).toBe("JOB_BOARD");
  });

  it("laisse une source officielle intacte", () => {
    expect(originOf("greenhouse", jobBoards)).toBe("OFFICIAL");
  });

  it("ne devine rien quand la source est inconnue", () => {
    // Le doute ne doit pas dépouiller une offre de sa description.
    expect(originOf(null, jobBoards)).toBe("OFFICIAL");
    expect(originOf(null, new Set())).toBe("OFFICIAL");
  });
});

describe("excerptOf", () => {
  it("rend un texte court tel quel, sans marque de coupure", () => {
    expect(excerptOf("  Développeur front-end à Paris.  ")).toBe("Développeur front-end à Paris.");
  });

  it("coupe sur un mot entier et annonce la coupure", () => {
    const text = "mot ".repeat(100).trim();

    const excerpt = excerptOf(text);

    expect(excerpt.endsWith("...")).toBe(true);
    expect(excerpt.length).toBeLessThanOrEqual(JOB_BOARD_EXCERPT_CHARS + 3);
    // La coupure tombe sur une frontière de mot : jamais au milieu d'un mot.
    expect(excerpt.slice(0, -3).endsWith("mot")).toBe(true);
  });

  it("coupe à la borne quand le texte n'a aucun espace", () => {
    const excerpt = excerptOf("a".repeat(400));

    expect(excerpt).toBe(`${"a".repeat(JOB_BOARD_EXCERPT_CHARS)}...`);
  });

  it("ne garde que des mots entiers, quitte à couper plus tôt", () => {
    // « deux » ne tient pas dans la borne : il est écarté en entier plutôt que
    // d'apparaître amputé.
    expect(excerptOf("un deux trois quatre", 7)).toBe("un...");
  });
});

describe("loadJobBoardSourceNames", () => {
  it("lit les job boards au registre, pas dans une liste écrite ici", async () => {
    const findMany = vi.fn().mockResolvedValue([{ name: "welcome-to-the-jungle" }]);
    const prisma = { connector: { findMany } };

    const names = await loadJobBoardSourceNames(prisma as never);

    expect(findMany).toHaveBeenCalledWith({
      where: { atsKind: "JOB_BOARD" },
      select: { name: true },
    });
    expect([...names]).toEqual(["welcome-to-the-jungle"]);
  });
});
