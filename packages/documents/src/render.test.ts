import { extractText } from "unpdf";
import { describe, expect, it } from "vitest";

import type { CvDocumentData } from "./cv-data.js";
import { renderCvPdf } from "./render.js";

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
      achievements: ["Intégration responsive en HTML/CSS."],
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

const pdfText = async (data: CvDocumentData): Promise<string> => {
  const buffer = await renderCvPdf(data);
  const { text } = await extractText(new Uint8Array(buffer), { mergePages: true });
  return text;
};

describe("renderCvPdf", () => {
  it("renders a real PDF whose text carries the facts, traceably", async () => {
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
});
