import { parseFragment, type DefaultTreeAdapterTypes } from "parse5";

type ChildNode = DefaultTreeAdapterTypes.ChildNode;
type ParentNode = DefaultTreeAdapterTypes.ParentNode;

/**
 * Un bloc de texte, avec la nature que le balisage lui donnait. Rien n'est
 * deviné : `heading` vient d'un `<h1>`…`<h6>`, `listItem` d'un `<li>`. Cette
 * nature sert à retrouver les sections d'une offre — responsabilités, prérequis,
 * avantages — sans reparcourir le HTML.
 */
export interface TextBlock {
  readonly kind: "heading" | "paragraph" | "listItem";
  readonly text: string;
  /** Niveau du titre, de 1 à 6. Absent pour les autres blocs. */
  readonly level?: number;
}

/**
 * Éléments dont le contenu n'est pas du texte d'offre. `script` et `style`
 * portent du code ; sans cette liste, il finirait dans la description.
 */
const IGNORED_ELEMENTS = new Set(["script", "style", "noscript", "template", "head", "svg"]);

/**
 * Éléments qui séparent le texte. Le HTML des offres est écrit à la main par des
 * employeurs : on y trouve aussi bien des `<p>` que des `<div>` empilés.
 */
const BLOCK_ELEMENTS = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "dd",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "li",
  "main",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "ul",
]);

const HEADING_LEVELS = new Map([
  ["h1", 1],
  ["h2", 2],
  ["h3", 3],
  ["h4", 4],
  ["h5", 5],
  ["h6", 6],
]);

const isTextNode = (node: ChildNode): node is DefaultTreeAdapterTypes.TextNode =>
  node.nodeName === "#text";

const hasChildren = (node: ChildNode): node is ChildNode & ParentNode =>
  "childNodes" in node && Array.isArray(node.childNodes);

/**
 * Réduit les blancs à un espace unique. L'espace insécable en fait partie : il
 * est abondant dans le HTML des offres, et le laisser passer produirait des
 * chaînes qui ne se comparent pas à leur équivalent écrit normalement.
 */
const collapseWhitespace = (text: string): string => text.replace(/\s+/gu, " ").trim();

/**
 * Découpe le HTML d'une offre en blocs de texte, dans l'ordre de lecture.
 *
 * Le HTML est analysé par un vrai parseur plutôt que par des expressions
 * régulières : celui des offres est écrit à la main, avec des balises non
 * fermées et des imbrications improbables. Une expression régulière rendrait du
 * texte faux sur les cas tordus, et sans jamais le signaler.
 */
export const htmlToBlocks = (html: string): readonly TextBlock[] => {
  const blocks: TextBlock[] = [];
  let buffer = "";

  const flush = (kind: TextBlock["kind"] = "paragraph", level?: number): void => {
    const text = collapseWhitespace(buffer);
    buffer = "";

    if (text === "") {
      return;
    }

    blocks.push(level === undefined ? { kind, text } : { kind, text, level });
  };

  const walk = (node: ChildNode): void => {
    if (isTextNode(node)) {
      buffer += node.value;
      return;
    }

    const name = node.nodeName;

    if (IGNORED_ELEMENTS.has(name)) {
      return;
    }

    // `<br>` coupe la ligne sans ouvrir de bloc : c'est une fin, pas un début.
    if (name === "br") {
      flush();
      return;
    }

    const isBlock = BLOCK_ELEMENTS.has(name);
    if (isBlock) {
      // Ce qui précédait appartient au bloc précédent, pas à celui qui s'ouvre.
      flush();
    }

    if (hasChildren(node)) {
      for (const child of node.childNodes) {
        walk(child);
      }
    }

    if (isBlock) {
      const level = HEADING_LEVELS.get(name);
      const kind =
        name === "li" ? "listItem" : level === undefined ? ("paragraph" as const) : "heading";

      flush(kind, level);
    }
  };

  const fragment = parseFragment(html);
  for (const child of fragment.childNodes) {
    walk(child);
  }
  flush();

  return blocks;
};

const isHeading = (block: TextBlock): boolean => block.kind === "heading";

/**
 * Recolle les blocs en texte lisible. Un titre est détaché du texte qui le suit,
 * et une puce reste sur sa ligne : la mise en forme d'origine portait du sens,
 * et l'aplatir en un seul paragraphe le perdrait.
 */
export const blocksToText = (blocks: readonly TextBlock[]): string => {
  const lines: string[] = [];

  blocks.forEach((block, index) => {
    const previous = blocks[index - 1];

    if (previous !== undefined && (isHeading(block) || isHeading(previous))) {
      lines.push("");
    }

    lines.push(block.text);
  });

  return lines.join("\n");
};

/** Le HTML d'une offre, rendu en texte fidèle. */
export const htmlToText = (html: string): string => blocksToText(htmlToBlocks(html));
