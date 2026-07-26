import type { LetterView } from "../../lib/workspace-api";

/*
 * La lettre s'affiche en entier pour relecture avant tout usage : objet,
 * paragraphes, faits déclarés utilisés et points signalés fragiles par la
 * génération. Rien n'est résumé ni réécrit ici.
 */
export const LetterCard = ({ letter }: { letter: LetterView }) => (
  <div className="letter-card">
    <p className="letter-subject">Objet : {letter.subject}</p>
    {letter.paragraphs.map((paragraph) => (
      <p key={paragraph} className="letter-paragraph">
        {paragraph}
      </p>
    ))}
    {letter.usedFacts.length > 0 && (
      <p className="match-line">
        Faits utilisés :{" "}
        {letter.usedFacts.map((fact) => (
          <span key={fact} className="chip">
            {fact}
          </span>
        ))}
      </p>
    )}
    {letter.warnings.length > 0 && (
      <p className="resume-warnings">À vérifier : {letter.warnings.join(" ")}</p>
    )}
    <p className="letter-note">
      Relire avant usage : le modèle de PDF ajoute l'adresse et la politesse.
    </p>
  </div>
);
