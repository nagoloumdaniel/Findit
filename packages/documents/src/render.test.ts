import { extractText } from "unpdf";
import { describe, expect, it } from "vitest";

import { isValidHexColor } from "./colors.js";
import type { CvDocumentData, CvTemplate } from "./cv-data.js";
import { renderCvDocx, renderCvPdf } from "./render.js";

/** PNG 1x1 transparent, en data URL, pour exercer l'option photo. */
const PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

const fullData: CvDocumentData = {
  identity: {
    fullName: "Lucas Bernard",
    email: "lucas.bernard.dev@example.com",
    phone: "06 12 34 56 78",
    location: "Paris",
    title: "Développeur front-end junior",
    availability: "Alternance 3 semaines / 1 semaine",
  },
  summary: "Développeur junior orienté web, à l'aise en React et TypeScript.",
  experiences: [
    {
      title: "Développeur front-end (stage)",
      company: "WebAgence",
      location: "Paris",
      startDate: "2025",
      endDate: "2025",
      description: "Développement d'interfaces React avec TypeScript.",
      achievements: [
        "Intégration responsive en HTML/CSS.",
        "Mise en place de composants accessibles.",
        "Rédaction de tests unitaires.",
      ],
      skills: ["React", "TypeScript", "CSS", "Git"],
    },
  ],
  projects: [
    {
      name: "Portfolio personnel",
      description: "Application React construite avec Vite.",
      url: "https://exemple.dev",
      skills: ["React", "Vite"],
    },
  ],
  education: [
    {
      school: "Lycée Turgot",
      degree: "BTS SIO",
      field: "SLAM",
      location: "Paris",
      startDate: "2024",
      endDate: "2026",
    },
  ],
  skills: [{ name: "JavaScript" }, { name: "TypeScript" }, { name: "React" }],
  languages: [
    { name: "Français", level: "natif" },
    { name: "Anglais", level: "B2" },
  ],
  certifications: [{ name: "Certification exemple", issuer: "Organisme", date: "2025" }],
  links: [{ label: "GitHub", url: "https://github.com/exemple" }],
};

const emptyData: CvDocumentData = {
  experiences: [],
  projects: [],
  education: [],
  skills: [],
  languages: [],
  certifications: [],
  links: [],
};

const pdfText = async (data: CvDocumentData, template?: CvTemplate): Promise<string> => {
  const buffer = await renderCvPdf(data, template === undefined ? undefined : { template });
  const { text } = await extractText(new Uint8Array(buffer), { mergePages: true });
  return text;
};

describe("renderCvPdf", () => {
  it("renders a real PDF whose text carries the facts", async () => {
    const buffer = await renderCvPdf(fullData);
    // Un PDF commence par « %PDF- » : on vérifie le format, pas une doublure.
    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");

    const text = await pdfText(fullData);
    expect(text).toContain("Lucas Bernard");
    expect(text).toContain("Développeur front-end junior");
    expect(text).toContain("WebAgence");
    expect(text).toContain("BTS SIO");
    expect(text).toContain("Anglais (B2)");
    expect(text).toContain("https://github.com/exemple");
  });

  it("renders the three templates as non-empty PDF buffers", async () => {
    const templates: CvTemplate[] = ["classique", "moderne", "compact"];
    for (const template of templates) {
      const buffer = await renderCvPdf(fullData, { template });
      expect(buffer.length).toBeGreaterThan(0);
      expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    }
  });

  it("keeps absent facts absent: no section title without content, no placeholder", async () => {
    const text = await pdfText(emptyData);
    expect(text).not.toContain("Expériences");
    expect(text).not.toContain("Compétences");
    expect(text).not.toContain("Formation");
    expect(text).not.toContain("undefined");
    expect(text).not.toContain("null");
  });

  it("is deterministic on content: same data, same extracted text", async () => {
    const first = await pdfText(fullData);
    const second = await pdfText(fullData);
    expect(second).toBe(first);
  });

  it("does not invent a period when dates are unknown", async () => {
    const text = await pdfText({
      ...emptyData,
      experiences: [{ title: "Développeur", achievements: [], skills: [] }],
    });
    expect(text).toContain("Développeur");
    expect(text).not.toContain("-");
  });

  it("renders the photo option with and without a data URL", async () => {
    const withPhoto = await renderCvPdf(fullData, { showPhoto: true, photoDataUrl: PNG_DATA_URL });
    expect(withPhoto.length).toBeGreaterThan(0);
    // Sans photoDataUrl, showPhoto ne doit pas faire planter le rendu.
    const withoutPhoto = await renderCvPdf(fullData, { showPhoto: true });
    expect(withoutPhoto.length).toBeGreaterThan(0);
  });

  it("preserves accented French text", async () => {
    const accented: CvDocumentData = {
      ...emptyData,
      identity: { fullName: "François René" },
      summary: "Développeur à l'aise avec les accents français : été, café, déjà, où, être.",
      experiences: [
        {
          title: "Développeur d'applications",
          company: "Éditions du Chêne",
          achievements: ["Réalisation d'une interface élégante."],
          skills: [],
        },
      ],
    };
    const text = await pdfText(accented);
    expect(text).toContain("François René");
    expect(text).toContain("Éditions du Chêne");
    expect(text).toContain("été");
    expect(text).toContain("café");
  });
});

describe("isValidHexColor", () => {
  it("accepts #rrggbb and rejects anything else", () => {
    expect(isValidHexColor("#d4af37")).toBe(true);
    expect(isValidHexColor("#D4AF37")).toBe(true);
    expect(isValidHexColor("#123456")).toBe(true);
    expect(isValidHexColor("d4af37")).toBe(false);
    expect(isValidHexColor("#d4af3")).toBe(false);
    expect(isValidHexColor("#d4af377")).toBe(false);
    expect(isValidHexColor("rouge")).toBe(false);
  });
});

describe("renderCvDocx", () => {
  it("renders a non-empty DOCX buffer", async () => {
    const buffer = await renderCvDocx(fullData);
    expect(buffer.length).toBeGreaterThan(0);
    // Un DOCX est une archive ZIP : elle commence par « PK ».
    expect(buffer.subarray(0, 2).toString("latin1")).toBe("PK");
  });

  it("renders a DOCX for each template and with a photo", async () => {
    const templates: CvTemplate[] = ["classique", "moderne", "compact"];
    for (const template of templates) {
      const buffer = await renderCvDocx(fullData, { template });
      expect(buffer.length).toBeGreaterThan(0);
      expect(buffer.subarray(0, 2).toString("latin1")).toBe("PK");
    }
    const withPhoto = await renderCvDocx(fullData, { showPhoto: true, photoDataUrl: PNG_DATA_URL });
    expect(withPhoto.subarray(0, 2).toString("latin1")).toBe("PK");
  });

  it("renders a DOCX with an invalid accent color without crashing", async () => {
    const buffer = await renderCvDocx(fullData, { accentColor: "pas-une-couleur" });
    expect(buffer.length).toBeGreaterThan(0);
  });
});
