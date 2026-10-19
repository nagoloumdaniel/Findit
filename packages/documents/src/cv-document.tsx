import { Document, Image, Link, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ReactNode } from "react";

import type {
  CvDocumentData,
  CvEducation,
  CvExperience,
  CvIdentity,
  CvProject,
  CvSkill,
  CvTemplate,
} from "./cv-data.js";
import { clean, period, toHref } from "./format.js";
import { groupSkills } from "./skills.js";

/*
 * Modèles de CV pré-conçus : une colonne A4, Helvetica intégrée, encre sombre
 * et accent configurable (or par défaut). Le design vit ici, pas dans l'IA : le
 * rendu est déterministe et chaque champ affiché vient des données reçues.
 *
 * Choix appris de vrais rendus :
 * - jamais de tiret long : le séparateur est toujours « - » ;
 * - les dates vivent à droite, bornées à 38 % de la ligne, pour qu'une date
 *   longue passe à la ligne au lieu d'écraser le titre ;
 * - les adresses web sont de vrais liens cliquables, même écrites sans
 *   protocole dans le CV ;
 * - pas de libellés de remplissage : la ligne de stack s'affiche sans préfixe ;
 * - une seule colonne et du texte sélectionnable, jamais une image du contenu.
 */
const INK = "#111827";
const MUTED = "#4b5563";
const FAINT = "#6b7280";
const RULE = "#d1d5db";

/** Valeurs typographiques et de mise en page propres à chaque modèle. */
type CvTheme = {
  fontSize: number;
  lineHeight: number;
  paddingVertical: number;
  paddingHorizontal: number;
  nameSize: number;
  nameLetterSpacing: number;
  headlineSize: number;
  contactSize: number;
  linksSize: number;
  sectionTitleSize: number;
  sectionTitleLetterSpacing: number;
  sectionMargin: number;
  sectionRuleMargin: number;
  entryMargin: number;
  entryTitleSize: number;
  entryPlaceSize: number;
  bulletMarkWidth: number;
  skillLabelWidth: number;
  skillValueSize: number;
  headerRuleMargin: number;
  inlineMargin: number;
  urlSize: number;
};

const THEMES: Record<CvTemplate, CvTheme> = {
  classique: {
    fontSize: 9,
    lineHeight: 1.32,
    paddingVertical: 36,
    paddingHorizontal: 46,
    nameSize: 19,
    nameLetterSpacing: -0.3,
    headlineSize: 10.5,
    contactSize: 8,
    linksSize: 8,
    sectionTitleSize: 8,
    sectionTitleLetterSpacing: 1.6,
    sectionMargin: 11,
    sectionRuleMargin: 6,
    entryMargin: 6.5,
    entryTitleSize: 9.5,
    entryPlaceSize: 8,
    bulletMarkWidth: 8,
    skillLabelWidth: 100,
    skillValueSize: 8.5,
    headerRuleMargin: 9,
    inlineMargin: 1,
    urlSize: 8,
  },
  moderne: {
    fontSize: 9.5,
    lineHeight: 1.5,
    paddingVertical: 44,
    paddingHorizontal: 52,
    nameSize: 22,
    nameLetterSpacing: -0.4,
    headlineSize: 11.5,
    contactSize: 8.5,
    linksSize: 8.5,
    sectionTitleSize: 9,
    sectionTitleLetterSpacing: 2.2,
    sectionMargin: 17,
    sectionRuleMargin: 8,
    entryMargin: 9.5,
    entryTitleSize: 10.5,
    entryPlaceSize: 8.5,
    bulletMarkWidth: 10,
    skillLabelWidth: 110,
    skillValueSize: 9,
    headerRuleMargin: 12,
    inlineMargin: 1.5,
    urlSize: 8.5,
  },
  compact: {
    fontSize: 8,
    lineHeight: 1.22,
    paddingVertical: 26,
    paddingHorizontal: 40,
    nameSize: 16,
    nameLetterSpacing: -0.2,
    headlineSize: 9,
    contactSize: 7.5,
    linksSize: 7.5,
    sectionTitleSize: 7.5,
    sectionTitleLetterSpacing: 1.2,
    sectionMargin: 7,
    sectionRuleMargin: 4,
    entryMargin: 4.5,
    entryTitleSize: 8.5,
    entryPlaceSize: 7.5,
    bulletMarkWidth: 7,
    skillLabelWidth: 90,
    skillValueSize: 8,
    headerRuleMargin: 7,
    inlineMargin: 0.5,
    urlSize: 7.5,
  },
};

const themeFor = (template: CvTemplate): CvTheme => THEMES[template];

const buildStyles = (theme: CvTheme, accent: string) =>
  StyleSheet.create({
    page: {
      fontFamily: "Helvetica",
      fontSize: theme.fontSize,
      color: INK,
      paddingTop: theme.paddingVertical,
      paddingBottom: theme.paddingVertical,
      paddingHorizontal: theme.paddingHorizontal,
      lineHeight: theme.lineHeight,
    },
    name: {
      fontSize: theme.nameSize,
      fontFamily: "Helvetica-Bold",
      letterSpacing: theme.nameLetterSpacing,
      lineHeight: 1.05,
    },
    headline: {
      fontSize: theme.headlineSize,
      color: accent,
      marginTop: 2,
      fontFamily: "Helvetica-Bold",
    },
    contactLine: { fontSize: theme.contactSize, color: MUTED, marginTop: 4 },
    linksLine: { fontSize: theme.linksSize, marginTop: 2 },
    headerLink: { color: accent, textDecoration: "none" },
    headerRule: {
      borderBottomWidth: 1.1,
      borderBottomColor: accent,
      marginTop: theme.headerRuleMargin,
    },
    headerRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
    headerText: { flex: 1 },
    photo: { width: 64, height: 64, borderRadius: 32, objectFit: "cover" },
    section: { marginTop: theme.sectionMargin },
    sectionTitle: {
      fontSize: theme.sectionTitleSize,
      fontFamily: "Helvetica-Bold",
      textTransform: "uppercase",
      letterSpacing: theme.sectionTitleLetterSpacing,
      color: accent,
      marginBottom: 2,
    },
    sectionRule: {
      borderBottomWidth: 0.6,
      borderBottomColor: RULE,
      marginBottom: theme.sectionRuleMargin,
    },
    prose: { textAlign: "justify" },
    skillRow: { flexDirection: "row", marginBottom: 1.5 },
    skillLabel: {
      width: theme.skillLabelWidth,
      fontFamily: "Helvetica-Bold",
      fontSize: theme.sectionTitleSize,
      paddingTop: 0.5,
    },
    skillValues: { flex: 1, fontSize: theme.skillValueSize },
    entry: { marginBottom: theme.entryMargin },
    entryHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 10,
    },
    entryTitle: {
      fontFamily: "Helvetica-Bold",
      fontSize: theme.entryTitleSize,
      flexShrink: 1,
    },
    entryDates: {
      color: FAINT,
      fontSize: theme.entryPlaceSize,
      maxWidth: "38%",
      textAlign: "right",
      paddingTop: 1,
    },
    entryPlace: { color: MUTED, fontSize: theme.entryPlaceSize },
    entryBody: { marginTop: 1.5 },
    bullet: { flexDirection: "row", marginTop: 1 },
    bulletMark: { width: theme.bulletMarkWidth, color: accent },
    bulletText: { flex: 1 },
    stackLine: { color: MUTED, fontSize: theme.contactSize, marginTop: 1.5 },
    urlLink: { color: accent, fontSize: theme.urlSize, marginTop: 1, textDecoration: "none" },
    inline: { marginBottom: theme.inlineMargin },
  });

type CvStyles = ReturnType<typeof buildStyles>;

const Section = ({
  title,
  styles,
  children,
}: {
  title: string;
  styles: CvStyles;
  children: ReactNode;
}) => (
  <View style={styles.section}>
    <Text style={styles.sectionTitle}>{title}</Text>
    <View style={styles.sectionRule} />
    {children}
  </View>
);

const Header = ({
  identity,
  links,
  styles,
  photoDataUrl,
}: {
  identity: CvIdentity;
  links: CvDocumentData["links"];
  styles: CvStyles;
  photoDataUrl: string | null;
}) => {
  const contact = clean([identity.location, identity.phone, identity.availability]);
  const textBlock = (
    <View style={styles.headerText}>
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
    </View>
  );

  return (
    <View>
      {photoDataUrl !== null ? (
        <View style={styles.headerRow}>
          {textBlock}
          <Image src={photoDataUrl} style={styles.photo} />
        </View>
      ) : (
        textBlock
      )}
      <View style={styles.headerRule} />
    </View>
  );
};

const Skills = ({ skills, styles }: { skills: CvSkill[]; styles: CvStyles }) => {
  const groups = groupSkills(skills);
  if (groups === null) {
    return <Text>{skills.map((skill) => skill.name).join("  ·  ")}</Text>;
  }
  return (
    <View>
      {groups.map((group) => (
        <View key={group.category} style={styles.skillRow}>
          <Text style={styles.skillLabel}>{group.label}</Text>
          <Text style={styles.skillValues}>{group.names.join(", ")}</Text>
        </View>
      ))}
    </View>
  );
};

const ExperienceEntry = ({
  experience,
  styles,
}: {
  experience: CvExperience;
  styles: CvStyles;
}) => {
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

const ProjectEntry = ({ project, styles }: { project: CvProject; styles: CvStyles }) => (
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

const EducationEntry = ({ education, styles }: { education: CvEducation; styles: CvStyles }) => {
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

export type CvDocumentProps = {
  data: CvDocumentData;
  template: CvTemplate;
  accentColor: string;
  showPhoto: boolean;
  photoDataUrl: string | null;
};

export const CvDocument = ({
  data,
  template,
  accentColor,
  showPhoto,
  photoDataUrl,
}: CvDocumentProps) => {
  const styles = buildStyles(themeFor(template), accentColor);
  const photo = showPhoto && photoDataUrl !== null ? photoDataUrl : null;
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {data.identity !== undefined && (
          <Header
            identity={data.identity}
            links={data.links}
            styles={styles}
            photoDataUrl={photo}
          />
        )}
        {data.summary !== undefined && (
          <Section title="Profil" styles={styles}>
            <Text style={styles.prose}>{data.summary}</Text>
          </Section>
        )}
        {data.skills.length > 0 && (
          <Section title="Compétences" styles={styles}>
            <Skills skills={data.skills} styles={styles} />
          </Section>
        )}
        {data.experiences.length > 0 && (
          <Section title="Expériences" styles={styles}>
            {data.experiences.map((experience, index) => (
              <ExperienceEntry
                key={`${experience.title ?? ""}-${String(index)}`}
                experience={experience}
                styles={styles}
              />
            ))}
          </Section>
        )}
        {data.projects.length > 0 && (
          <Section title="Projets" styles={styles}>
            {data.projects.map((project, index) => (
              <ProjectEntry
                key={`${project.name ?? ""}-${String(index)}`}
                project={project}
                styles={styles}
              />
            ))}
          </Section>
        )}
        {data.education.length > 0 && (
          <Section title="Formation" styles={styles}>
            {data.education.map((education, index) => (
              <EducationEntry
                key={`${education.school ?? ""}-${String(index)}`}
                education={education}
                styles={styles}
              />
            ))}
          </Section>
        )}
        {data.languages.length > 0 && (
          <Section title="Langues" styles={styles}>
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
          <Section title="Certifications" styles={styles}>
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
};
