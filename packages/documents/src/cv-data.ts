/*
 * Données que le modèle de CV sait afficher. La forme est structurellement
 * compatible avec les faits structurés du CV source : le modèle ne rend que ce
 * qui existe, un champ absent reste absent — rien n'est inventé au rendu.
 */

export type CvIdentity = {
  fullName?: string | undefined;
  email?: string | undefined;
  phone?: string | undefined;
  location?: string | undefined;
  title?: string | undefined;
  availability?: string | undefined;
};

export type CvExperience = {
  title?: string | undefined;
  company?: string | undefined;
  location?: string | undefined;
  startDate?: string | undefined;
  endDate?: string | undefined;
  description?: string | undefined;
  achievements: string[];
  skills: string[];
};

export type CvProject = {
  name?: string | undefined;
  description?: string | undefined;
  url?: string | undefined;
  skills: string[];
};

export type CvEducation = {
  school?: string | undefined;
  degree?: string | undefined;
  field?: string | undefined;
  location?: string | undefined;
  startDate?: string | undefined;
  endDate?: string | undefined;
  description?: string | undefined;
};

export type CvSkill = {
  name: string;
  category?: string | undefined;
};

export type CvLanguage = {
  name: string;
  level?: string | undefined;
};

export type CvCertification = {
  name: string;
  issuer?: string | undefined;
  date?: string | undefined;
};

export type CvLink = {
  label: string;
  url: string;
};

export type CvDocumentData = {
  identity?: CvIdentity | undefined;
  summary?: string | undefined;
  experiences: CvExperience[];
  projects: CvProject[];
  education: CvEducation[];
  skills: CvSkill[];
  languages: CvLanguage[];
  certifications: CvCertification[];
  links: CvLink[];
};
