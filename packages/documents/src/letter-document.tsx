import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import type { CoverLetterDocumentData } from "./letter-data.js";

/*
 * Modèle de lettre pré-conçu : A4 sobre, Helvetica intégrée, aucune ressource
 * externe. Les formules d'adresse et de politesse sont du modèle — texte
 * fixe et assumé — jamais de l'IA. Le rendu est déterministe.
 */
const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10.5,
    color: "#1c1c1c",
    paddingTop: 56,
    paddingBottom: 56,
    paddingHorizontal: 60,
    lineHeight: 1.45,
  },
  senderName: { fontSize: 13, fontFamily: "Helvetica-Bold" },
  senderContact: { fontSize: 9, color: "#555555" },
  recipientBlock: { marginTop: 18, alignItems: "flex-end" },
  recipient: { fontSize: 10.5 },
  cityAndDate: { marginTop: 14, textAlign: "right" },
  subject: { marginTop: 22, fontFamily: "Helvetica-Bold" },
  salutation: { marginTop: 16 },
  paragraph: { marginTop: 10, textAlign: "justify" },
  closing: { marginTop: 16 },
  signature: { marginTop: 24, fontFamily: "Helvetica-Bold" },
});

/** Formules fixes du modèle : de la papeterie, pas des faits. */
const SALUTATION = "Madame, Monsieur,";
const CLOSING =
  "Je vous prie d'agréer, Madame, Monsieur, l'expression de mes salutations distinguées.";

export const CoverLetterDocument = ({ data }: { data: CoverLetterDocumentData }) => (
  <Document>
    <Page size="A4" style={styles.page}>
      <View>
        {data.senderName !== undefined && <Text style={styles.senderName}>{data.senderName}</Text>}
        {data.senderContact.map((line) => (
          <Text key={line} style={styles.senderContact}>
            {line}
          </Text>
        ))}
      </View>
      <View style={styles.recipientBlock}>
        <Text style={styles.recipient}>{data.companyName}</Text>
        <Text style={styles.recipient}>Candidature : {data.jobTitle}</Text>
      </View>
      {data.cityAndDate !== undefined && <Text style={styles.cityAndDate}>{data.cityAndDate}</Text>}
      <Text style={styles.subject}>Objet : {data.subject}</Text>
      <Text style={styles.salutation}>{SALUTATION}</Text>
      {data.paragraphs.map((paragraph) => (
        <Text key={paragraph} style={styles.paragraph}>
          {paragraph}
        </Text>
      ))}
      <Text style={styles.closing}>{CLOSING}</Text>
      {data.senderName !== undefined && <Text style={styles.signature}>{data.senderName}</Text>}
    </Page>
  </Document>
);
