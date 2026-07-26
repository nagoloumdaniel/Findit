import { Document, Link, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ReactNode } from "react";

import type {
  CvDocumentData,
  CvEducation,
  CvExperience,
  CvIdentity,
  CvProject,
  CvSkill,
} from "./cv-data.js";

/*
 * Modèle de CV pré-conçu : une colonne A4 compacte pensée pour tenir sur une
 * page, Helvetica intégrée, encre sombre et accent bleu. Le design vit ici,
 * pas dans l'IA : le rendu est déterministe et chaque champ affiché vient des
 * données reçues.
 *
 * Choix appris de vrais rendus :
 * - jamais de tiret long : le séparateur est toujours « - » ;
 * - les dates vivent à droite, bornées à 38 % de la ligne, pour qu'une date
 *   longue passe à la ligne au lieu d'écraser le titre ;
 * - les adresses web sont de vrais liens cliquables, même écrites sans
 *   protocole dans le CV ;
 * - pas de libellés de remplissage : la ligne de stack s'affiche sans préfixe.
 */
const BLUE = "#1d4ed8";
const INK = "#111827";
const MUTED = "#4b5563";
const FAINT = "#6b7280";
const RULE = "#c7d2e8";

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: INK,
    paddingTop: 36,
    paddingBottom: 36,
    paddingHorizontal: 46,
    lineHeight: 1.32,
  },

  name: { fontSize: 19, fontFamily: "Helvetica-Bold", letterSpacing: -0.3, lineHeight: 1.05 },
  headline: { fontSize: 10.5, color: BLUE, marginTop: 2, fontFamily: "Helvetica-Bold" },
  contactLine: { fontSize: 8, color: MUTED, marginTop: 4 },
  linksLine: { fontSize: 8, marginTop: 2 },
  headerLink: { color: BLUE, textDecoration: "none" },
  headerRule: { borderBottomWidth: 1.1, borderBottomColor: BLUE, marginTop: 9 },

  section: { marginTop: 11 },
  sectionTitle: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 1.6,
    color: BLUE,
    marginBottom: 2,
  },
  sectionRule: { borderBottomWidth: 0.6, borderBottomColor: RULE, marginBottom: 6 },

  prose: { textAlign: "justify" },

  skillRow: { flexDirection: "row", marginBottom: 1.5 },
  skillLabel: { width: 100, fontFamily: "Helvetica-Bold", fontSize: 8, paddingTop: 0.5 },
  skillValues: { flex: 1, fontSize: 8.5 },

  entry: { marginBottom: 6.5 },
  entryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
  },
  entryTitle: { fontFamily: "Helvetica-Bold", fontSize: 9.5, flexShrink: 1 },
  entryDates: {
    color: FAINT,
    fontSize: 8,
    maxWidth: "38%",
    textAlign: "right",
    paddingTop: 1,
  },
  entryPlace: { color: MUTED, fontSize: 8 },
  entryBody: { marginTop: 1.5 },
  bullet: { flexDirection: "row", marginTop: 1 },
  bulletMark: { width: 8, color: BLUE },
  bulletText: { flex: 1 },
  stackLine: { color: MUTED, fontSize: 8, marginTop: 1.5 },
  urlLink: { color: BLUE, fontSize: 8, marginTop: 1, textDecoration: "none" },

  inline: { marginBottom: 1 },
});

const clean = (values: (string | undefined)[]): string[] =>
  values.filter((value): value is string => value !== undefined && value.trim() !== "");

/** « 2024 - 2026 », ou la seule borne connue ; null quand on ne sait rien. */
const period = (start: string | undefined, end: string | undefined): string | null => {
  const parts = clean([start, end]);
  if (parts.length === 0) {
    return null;
  }
  return parts.length === 2 ? `${parts[0] ?? ""} - ${parts[1] ?? ""}` : (parts[0] ?? null);
};

/** Une adresse écrite sans protocole reste cliquable : le lien le complète. */
const toHref = (url: string): string => (/^https?:\/\//i.test(url) ? url : `https://${url}`);

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <View style={styles.section}>
    <Text style={styles.sectionTitle}>{title}</Text>
    <View style={styles.sectionRule} />
    {children}
  </View>
);

const Header = ({ identity, links }: { identity: CvIdentity; links: CvDocumentData["links"] }) => {
  const contact = clean([identity.location, identity.phone, identity.availability]);
  return (
    <View>
      {identity.fullName !== undefined && <Text style={styles.name}>{identity.fullName}</Text>}
      {identity.title !== undefined && <Text style={styles.headline}>{identity.title}</Text>}
      {(contact.length > 0 || identity.email !== undefined) && (
        <Text style={styles.contactLine}>
          {contact.join("  ·  ")}
          {identity.email !== undefined && (
            <>
              {contact.length > 0 ? "  ·  " : ""}
              <Link src={`mailto:${identity.email}`} style={styles.headerLink}>
                {identity.email}
              </Link>
            </>
          )}
        </Text>
      )}
      {links.length > 0 && (
        <Text style={styles.linksLine}>
          {links.map((link, index) => (
            <Text key={link.url}>
              {index > 0 ? "  ·  " : ""}
              <Link src={toHref(link.url)} style={styles.headerLink}>
                {link.url}
              </Link>
            </Text>
          ))}
        </Text>
      )}
      <View style={styles.headerRule} />
    </View>
  );
};

/** Ordre et libellés d'affichage des catégories de compétences. */
const SKILL_GROUPS: { category: string; label: string }[] = [
  { category: "programming_language", label: "Langages" },
  { category: "framework", label: "Frameworks" },
  { category: "database", label: "Bases de données" },
  { category: "cloud_tool", label: "Cloud & DevOps" },
  { category: "dev_tool", label: "Outils" },
  { category: "soft_skill", label: "Savoir-être" },
  { category: "language", label: "Langues" },
  { category: "other", label: "Autres" },
];

/*
 * Groupé par catégorie quand l'extraction en fournit, sinon une ligne simple :
 * le modèle affiche la structure disponible, il n'en fabrique pas.
 */
const Skills = ({ skills }: { skills: CvSkill[] }) => {
  const categorized = skills.filter((skill) => skill.category !== undefined);
  if (categorized.length < skills.length / 2) {
    return <Text>{skills.map((skill) => skill.name).join("  ·  ")}</Text>;
  }

  const leftovers = skills.filter(
    (skill) =>
      skill.category === undefined ||
      !SKILL_GROUPS.some((group) => group.category === skill.category),
  );

  return (
    <View>
      {SKILL_GROUPS.map((group) => {
        const members = skills.filter((skill) => skill.category === group.category);
        if (members.length === 0) {
          return null;
        }
        return (
          <View key={group.category} style={styles.skillRow}>
            <Text style={styles.skillLabel}>{group.label}</Text>
            <Text style={styles.skillValues}>{members.map((skill) => skill.name).join(", ")}</Text>
          </View>
        );
      })}
      {leftovers.length > 0 && (
        <View style={styles.skillRow}>
          <Text style={styles.skillLabel}>Divers</Text>
          <Text style={styles.skillValues}>{leftovers.map((skill) => skill.name).join(", ")}</Text>
        </View>
      )}
    </View>
  );
};

const ExperienceEntry = ({ experience }: { experience: CvExperience }) => {
  const heading = clean([experience.title, experience.company]).join(" - ");
  const dates = period(experience.startDate, experience.endDate);
  return (
    <View style={styles.entry} wrap={false}>
      <View style={styles.entryHeader}>
        {heading !== "" && <Text style={styles.entryTitle}>{heading}</Text>}
        {dates !== null && <Text style={styles.entryDates}>{dates}</Text>}
      </View>
      {experience.location !== undefined && (
        <Text style={styles.entryPlace}>{experience.location}</Text>
      )}
      {experience.description !== undefined && (
        <Text style={[styles.prose, styles.entryBody]}>{experience.description}</Text>
      )}
      {experience.achievements.map((achievement) => (
        <View key={achievement} style={styles.bullet}>
          <Text style={styles.bulletMark}>-</Text>
          <Text style={styles.bulletText}>{achievement}</Text>
        </View>
      ))}
      {experience.skills.length > 0 && (
        <Text style={styles.stackLine}>{experience.skills.join(" · ")}</Text>
      )}
    </View>
  );
};

const ProjectEntry = ({ project }: { project: CvProject }) => (
  <View style={styles.entry} wrap={false}>
    {project.name !== undefined && (
      <View style={styles.entryHeader}>
        <Text style={styles.entryTitle}>{project.name}</Text>
      </View>
    )}
    {project.description !== undefined && (
      <Text style={[styles.prose, project.name !== undefined ? styles.entryBody : {}]}>
        {project.description}
      </Text>
    )}
    {project.url !== undefined && (
      <Link src={toHref(project.url)} style={styles.urlLink}>
        {project.url}
      </Link>
    )}
    {project.skills.length > 0 && (
      <Text style={styles.stackLine}>{project.skills.join(" · ")}</Text>
    )}
  </View>
);

const EducationEntry = ({ education }: { education: CvEducation }) => {
  const heading = clean([education.degree, education.field]).join(" - ");
  const dates = period(education.startDate, education.endDate);
  const place = clean([education.school, education.location]).join(", ");
  return (
    <View style={styles.entry} wrap={false}>
      <View style={styles.entryHeader}>
        {heading !== "" ? (
          <Text style={styles.entryTitle}>{heading}</Text>
        ) : (
          place !== "" && <Text style={styles.entryTitle}>{place}</Text>
        )}
        {dates !== null && <Text style={styles.entryDates}>{dates}</Text>}
      </View>
      {heading !== "" && place !== "" && <Text style={styles.entryPlace}>{place}</Text>}
      {education.description !== undefined && (
        <Text style={[styles.prose, styles.entryBody]}>{education.description}</Text>
      )}
    </View>
  );
};

export const CvDocument = ({ data }: { data: CvDocumentData }) => (
  <Document>
    <Page size="A4" style={styles.page}>
      {data.identity !== undefined && <Header identity={data.identity} links={data.links} />}
      {data.summary !== undefined && (
        <Section title="Profil">
          <Text style={styles.prose}>{data.summary}</Text>
        </Section>
      )}
      {data.skills.length > 0 && (
        <Section title="Compétences">
          <Skills skills={data.skills} />
        </Section>
      )}
      {data.experiences.length > 0 && (
        <Section title="Expériences">
          {data.experiences.map((experience, index) => (
            <ExperienceEntry
              key={`${experience.title ?? ""}-${String(index)}`}
              experience={experience}
            />
          ))}
        </Section>
      )}
      {data.projects.length > 0 && (
        <Section title="Projets">
          {data.projects.map((project, index) => (
            <ProjectEntry key={`${project.name ?? ""}-${String(index)}`} project={project} />
          ))}
        </Section>
      )}
      {data.education.length > 0 && (
        <Section title="Formation">
          {data.education.map((education, index) => (
            <EducationEntry
              key={`${education.school ?? ""}-${String(index)}`}
              education={education}
            />
          ))}
        </Section>
      )}
      {data.languages.length > 0 && (
        <Section title="Langues">
          <Text>
            {data.languages
              .map((language) =>
                language.level === undefined
                  ? language.name
                  : `${language.name} (${language.level})`,
              )
              .join("  ·  ")}
          </Text>
        </Section>
      )}
      {data.certifications.length > 0 && (
        <Section title="Certifications">
          {data.certifications.map((certification, index) => (
            <Text key={`${certification.name}-${String(index)}`} style={styles.inline}>
              {clean([certification.name, certification.issuer, certification.date]).join(" - ")}
            </Text>
          ))}
        </Section>
      )}
    </Page>
  </Document>
);
