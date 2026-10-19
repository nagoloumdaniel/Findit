import { containsAlias, normalizeText } from "./normalize.js";

export type TechKind = "language" | "framework" | "database" | "cloud" | "tool" | "concept";

export interface TechEntry {
  /** Identifiant stable, sert de clé de comparaison entre CV et offre. */
  id: string;
  /** Libellé affiché tel quel dans les raisons du score. */
  label: string;
  kind: TechKind;
  /** Formes normalisées sous lesquelles la technologie s'écrit réellement. */
  aliases: string[];
}

/**
 * Vocabulaire volontairement restreint aux technologies écrites telles quelles
 * dans les offres : le score ne repose que sur des correspondances lisibles,
 * jamais sur une interprétation. Un alias trop ambigu en français est exclu
 * plutôt que risqué (« vue » seul, « go » seul, « net » seul, « r », « c »).
 */
export const TECH_DICTIONARY: TechEntry[] = [
  { id: "javascript", label: "JavaScript", kind: "language", aliases: ["javascript", "js"] },
  { id: "typescript", label: "TypeScript", kind: "language", aliases: ["typescript", "ts"] },
  { id: "python", label: "Python", kind: "language", aliases: ["python"] },
  { id: "java", label: "Java", kind: "language", aliases: ["java"] },
  { id: "php", label: "PHP", kind: "language", aliases: ["php"] },
  { id: "csharp", label: "C#", kind: "language", aliases: ["c#", "csharp"] },
  { id: "cpp", label: "C++", kind: "language", aliases: ["c++", "cpp"] },
  { id: "go", label: "Go", kind: "language", aliases: ["golang"] },
  { id: "rust", label: "Rust", kind: "language", aliases: ["rust"] },
  { id: "ruby", label: "Ruby", kind: "language", aliases: ["ruby"] },
  { id: "kotlin", label: "Kotlin", kind: "language", aliases: ["kotlin"] },
  { id: "swift", label: "Swift", kind: "language", aliases: ["swift"] },
  { id: "dart", label: "Dart", kind: "language", aliases: ["dart"] },
  { id: "scala", label: "Scala", kind: "language", aliases: ["scala"] },
  { id: "sql", label: "SQL", kind: "language", aliases: ["sql"] },
  { id: "html", label: "HTML", kind: "language", aliases: ["html", "html5"] },
  { id: "css", label: "CSS", kind: "language", aliases: ["css", "css3"] },
  { id: "sass", label: "Sass", kind: "language", aliases: ["sass", "scss"] },

  { id: "react", label: "React", kind: "framework", aliases: ["react", "reactjs", "react.js"] },
  {
    id: "react-native",
    label: "React Native",
    kind: "framework",
    aliases: ["react native", "react-native"],
  },
  { id: "angular", label: "Angular", kind: "framework", aliases: ["angular", "angularjs"] },
  { id: "vue", label: "Vue.js", kind: "framework", aliases: ["vue.js", "vuejs", "vue 3", "vue 2"] },
  { id: "svelte", label: "Svelte", kind: "framework", aliases: ["svelte", "sveltekit"] },
  { id: "nextjs", label: "Next.js", kind: "framework", aliases: ["next.js", "nextjs"] },
  { id: "nuxt", label: "Nuxt", kind: "framework", aliases: ["nuxt", "nuxtjs", "nuxt.js"] },
  { id: "nodejs", label: "Node.js", kind: "framework", aliases: ["node.js", "nodejs", "node"] },
  {
    id: "express",
    label: "Express",
    kind: "framework",
    aliases: ["express", "express.js", "expressjs"],
  },
  { id: "nestjs", label: "NestJS", kind: "framework", aliases: ["nestjs", "nest.js"] },
  { id: "fastify", label: "Fastify", kind: "framework", aliases: ["fastify"] },
  { id: "django", label: "Django", kind: "framework", aliases: ["django"] },
  { id: "flask", label: "Flask", kind: "framework", aliases: ["flask"] },
  { id: "fastapi", label: "FastAPI", kind: "framework", aliases: ["fastapi"] },
  { id: "laravel", label: "Laravel", kind: "framework", aliases: ["laravel"] },
  { id: "symfony", label: "Symfony", kind: "framework", aliases: ["symfony"] },
  { id: "spring", label: "Spring", kind: "framework", aliases: ["spring", "spring boot"] },
  { id: "rails", label: "Ruby on Rails", kind: "framework", aliases: ["rails", "ruby on rails"] },
  { id: "dotnet", label: ".NET", kind: "framework", aliases: [".net", "dotnet", "asp.net"] },
  { id: "flutter", label: "Flutter", kind: "framework", aliases: ["flutter"] },
  {
    id: "tailwind",
    label: "Tailwind CSS",
    kind: "framework",
    aliases: ["tailwind", "tailwindcss"],
  },
  { id: "bootstrap", label: "Bootstrap", kind: "framework", aliases: ["bootstrap"] },
  { id: "jquery", label: "jQuery", kind: "framework", aliases: ["jquery"] },

  {
    id: "postgresql",
    label: "PostgreSQL",
    kind: "database",
    aliases: ["postgresql", "postgres", "postgre"],
  },
  { id: "mysql", label: "MySQL", kind: "database", aliases: ["mysql"] },
  { id: "mariadb", label: "MariaDB", kind: "database", aliases: ["mariadb"] },
  { id: "mongodb", label: "MongoDB", kind: "database", aliases: ["mongodb", "mongo"] },
  { id: "redis", label: "Redis", kind: "database", aliases: ["redis"] },
  { id: "sqlite", label: "SQLite", kind: "database", aliases: ["sqlite"] },
  {
    id: "sqlserver",
    label: "SQL Server",
    kind: "database",
    aliases: ["sql server", "sqlserver"],
  },
  { id: "oracle", label: "Oracle", kind: "database", aliases: ["oracle"] },
  {
    id: "elasticsearch",
    label: "Elasticsearch",
    kind: "database",
    aliases: ["elasticsearch", "elastic search"],
  },
  { id: "prisma", label: "Prisma", kind: "database", aliases: ["prisma"] },

  { id: "docker", label: "Docker", kind: "cloud", aliases: ["docker"] },
  { id: "kubernetes", label: "Kubernetes", kind: "cloud", aliases: ["kubernetes", "k8s"] },
  { id: "aws", label: "AWS", kind: "cloud", aliases: ["aws", "amazon web services"] },
  { id: "azure", label: "Azure", kind: "cloud", aliases: ["azure"] },
  {
    id: "gcp",
    label: "Google Cloud",
    kind: "cloud",
    aliases: ["gcp", "google cloud"],
  },
  { id: "terraform", label: "Terraform", kind: "cloud", aliases: ["terraform"] },
  { id: "linux", label: "Linux", kind: "cloud", aliases: ["linux", "ubuntu", "debian"] },
  { id: "nginx", label: "Nginx", kind: "cloud", aliases: ["nginx"] },

  { id: "git", label: "Git", kind: "tool", aliases: ["git"] },
  { id: "github", label: "GitHub", kind: "tool", aliases: ["github"] },
  { id: "gitlab", label: "GitLab", kind: "tool", aliases: ["gitlab"] },
  { id: "jira", label: "Jira", kind: "tool", aliases: ["jira"] },
  { id: "figma", label: "Figma", kind: "tool", aliases: ["figma"] },
  { id: "jest", label: "Jest", kind: "tool", aliases: ["jest"] },
  { id: "vitest", label: "Vitest", kind: "tool", aliases: ["vitest"] },
  { id: "cypress", label: "Cypress", kind: "tool", aliases: ["cypress"] },
  { id: "playwright", label: "Playwright", kind: "tool", aliases: ["playwright"] },
  { id: "webpack", label: "Webpack", kind: "tool", aliases: ["webpack"] },
  { id: "vite", label: "Vite", kind: "tool", aliases: ["vite"] },
  { id: "wordpress", label: "WordPress", kind: "tool", aliases: ["wordpress"] },

  {
    id: "rest",
    label: "API REST",
    kind: "concept",
    aliases: ["rest", "restful", "api rest", "rest api"],
  },
  { id: "graphql", label: "GraphQL", kind: "concept", aliases: ["graphql"] },
  { id: "websocket", label: "WebSocket", kind: "concept", aliases: ["websocket", "websockets"] },
  {
    id: "ci-cd",
    label: "CI/CD",
    kind: "concept",
    aliases: ["ci/cd", "ci cd", "integration continue"],
  },
  { id: "agile", label: "Agile/Scrum", kind: "concept", aliases: ["agile", "scrum", "kanban"] },
  { id: "tdd", label: "TDD", kind: "concept", aliases: ["tdd", "test driven"] },
  {
    id: "microservices",
    label: "Microservices",
    kind: "concept",
    aliases: ["microservices", "micro services", "microservice"],
  },
  { id: "oop", label: "Programmation orientée objet", kind: "concept", aliases: ["poo", "oop"] },
];

const byAlias = new Map<string, TechEntry>();
for (const entry of TECH_DICTIONARY) {
  for (const alias of entry.aliases) {
    byAlias.set(alias, entry);
  }
}

/**
 * Rattache une compétence déclarée dans le CV à une entrée du dictionnaire.
 * L'égalité est exacte après normalisation : « Node.JS » devient « node.js »
 * et se rattache, mais une phrase entière ne se rattache pas par accident.
 */
export const canonicalizeSkill = (rawName: string): TechEntry | null => {
  const normalized = normalizeText(rawName);
  return byAlias.get(normalized) ?? null;
};

/** Toutes les entrées du dictionnaire écrites telles quelles dans un texte. */
export const detectSkillsInText = (rawText: string): TechEntry[] => {
  const normalized = normalizeText(rawText);
  if (normalized.length === 0) {
    return [];
  }
  return TECH_DICTIONARY.filter((entry) =>
    entry.aliases.some((alias) => containsAlias(normalized, alias)),
  );
};
