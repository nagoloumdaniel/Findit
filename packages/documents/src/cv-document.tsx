import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ReactNode } from "react";

import type {
  CvDocumentData,
  CvEducation,
  CvExperience,
  CvIdentity,
  CvProject,
} from "./cv-data.js";

/*
 * Modèle de CV pré-conçu : une colonne A4 sobre, polices PDF intégrées
 * (Helvetica), aucune ressource externe. Le design vit ici, pas dans l'IA :
 * le rendu est déterministe et chaque champ affiché vient des données reçues.
 */
const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9.5,
    color: "#1c1c1c",
    paddingTop: 42,
    paddingBottom: 42,
    paddingHorizontal: 48,
    lineHeight: 1.35,
  },
  name: { fontSize: 19, fontFamily: "Helvetica-Bold" },
  headline: { fontSize: 11, color: "#444444", marginTop: 2 },
  contactLine: { fontSize: 8.5, color: "#555555", marginTop: 6 },
  section: { marginTop: 14 },
  sectionTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 1.2,
    color: "#1a3550",
    borderBottomWidth: 0.8,
    borderBottomColor: "#1a3550",
    paddingBottom: 2,
    marginBottom: 6,
  },
  entry: { marginBottom: 8 },
  entryHeader: { flexDirection: "row", justifyContent: "space-between" },
  entryTitle: { fontFamily: "Helvetica-Bold" },
  entryMeta: { color: "#555555" },
  bullet: { flexDirection: "row", marginTop: 1 },
  bulletMark: { width: 10 },
  bulletText: { flex: 1 },
  skillsLine: { color: "#444444", marginTop: 2 },
});

const clean = (values: (string | undefined)[]): string[] =>
  values.filter((value): value is string => value !== undefined && value.trim() !== "");

/** « 2024 – 2026 », ou la seule borne connue ; null quand on ne sait rien. */
const period = (start: string | undefined, end: string | undefined): string | null => {
  const parts = clean([start, end]);
  if (parts.length === 0) {
    return null;
  }
  return parts.length === 2 ? `${parts[0] ?? ""} – ${parts[1] ?? ""}` : (parts[0] ?? null);
};

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <View style={styles.section}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {children}
  </View>
);

const Header = ({ identity, links }: { identity: CvIdentity; links: CvDocumentData["links"] }) => {
  const contact = clean([identity.email, identity.phone, identity.location, identity.availability]);
  const linkLine = links.map((link) => `${link.label} : ${link.url}`);
  return (
    <View>
      {identity.fullName !== undefined && <Text style={styles.name}>{identity.fullName}</Text>}
      {identity.title !== undefined && <Text style={styles.headline}>{identity.title}</Text>}
      {contact.length > 0 && <Text style={styles.contactLine}>{contact.join("  ·  ")}</Text>}
      {linkLine.length > 0 && <Text style={styles.contactLine}>{linkLine.join("  ·  ")}</Text>}
    </View>
  );
};

const ExperienceEntry = ({ experience }: { experience: CvExperience }) => {
  const heading = clean([experience.title, experience.company]).join(" — ");
  const dates = period(experience.startDate, experience.endDate);
  return (
    <View style={styles.entry} wrap={false}>
      <View style={styles.entryHeader}>
        {heading !== "" && <Text style={styles.entryTitle}>{heading}</Text>}
        {dates !== null && <Text style={styles.entryMeta}>{dates}</Text>}
      </View>
      {experience.location !== undefined && (
        <Text style={styles.entryMeta}>{experience.location}</Text>
      )}
      {experience.description !== undefined && <Text>{experience.description}</Text>}
      {experience.achievements.map((achievement) => (
        <View key={achievement} style={styles.bullet}>
          <Text style={styles.bulletMark}>–</Text>
          <Text style={styles.bulletText}>{achievement}</Text>
        </View>
      ))}
      {experience.skills.length > 0 && (
        <Text style={styles.skillsLine}>Compétences : {experience.skills.join(", ")}</Text>
      )}
    </View>
  );
};

const ProjectEntry = ({ project }: { project: CvProject }) => (
  <View style={styles.entry} wrap={false}>
    <View style={styles.entryHeader}>
      {project.name !== undefined && <Text style={styles.entryTitle}>{project.name}</Text>}
    </View>
    {project.description !== undefined && <Text>{project.description}</Text>}
    {project.url !== undefined && <Text style={styles.entryMeta}>{project.url}</Text>}
    {project.skills.length > 0 && (
      <Text style={styles.skillsLine}>Compétences : {project.skills.join(", ")}</Text>
    )}
  </View>
);

const EducationEntry = ({ education }: { education: CvEducation }) => {
  const heading = clean([education.degree, education.field]).join(" — ");
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
        {dates !== null && <Text style={styles.entryMeta}>{dates}</Text>}
      </View>
      {heading !== "" && place !== "" && <Text style={styles.entryMeta}>{place}</Text>}
      {education.description !== undefined && <Text>{education.description}</Text>}
    </View>
  );
};

export const CvDocument = ({ data }: { data: CvDocumentData }) => (
  <Document>
    <Page size="A4" style={styles.page}>
      {data.identity !== undefined && <Header identity={data.identity} links={data.links} />}
      {data.summary !== undefined && (
        <Section title="Profil">
          <Text>{data.summary}</Text>
        </Section>
      )}
      {data.skills.length > 0 && (
        <Section title="Compétences">
          <Text>{data.skills.map((skill) => skill.name).join("  ·  ")}</Text>
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
            <Text key={`${certification.name}-${String(index)}`}>
              {clean([certification.name, certification.issuer, certification.date]).join(" — ")}
            </Text>
          ))}
        </Section>
      )}
    </Page>
  </Document>
);
