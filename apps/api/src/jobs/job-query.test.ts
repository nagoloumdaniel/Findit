import { describe, expect, it } from "vitest";

import { freshnessQuerySchema, jobQuerySchema, jobSlugSchema } from "./job-query.js";

describe("jobQuerySchema", () => {
  it("defaults to the last 5 days across the whole scope", () => {
    const query = jobQuerySchema.parse({});

    // Toute la fenêtre de publication par défaut (choix du propriétaire) ;
    // 24 heures reste un resserrement possible.
    expect(query.freshness).toBe("LAST_5D");
    expect(query.role).toBeUndefined();
    expect(query.department).toBeUndefined();
    expect(query.contract).toBeUndefined();
    expect(query.sort).toBe("DATE");
    expect(query.page).toBe(1);
    expect(query.pageSize).toBe(20);
  });

  it("offers no window beyond the extended one", () => {
    expect(() => jobQuerySchema.parse({ freshness: "LAST_7D" })).toThrow();
    expect(() => jobQuerySchema.parse({ freshness: "168h" })).toThrow();
  });

  it("rejects a department outside Île-de-France", () => {
    expect(() => jobQuerySchema.parse({ department: "69" })).toThrow();
    expect(jobQuerySchema.parse({ department: "93" }).department).toBe("93");
  });

  it("rejects a role outside the validated scope", () => {
    expect(() => jobQuerySchema.parse({ role: "DEVOPS" })).toThrow();
    expect(jobQuerySchema.parse({ role: "DATA_ENGINEER" }).role).toBe("DATA_ENGINEER");
  });

  it("rejects a contract outside the six supported categories", () => {
    expect(() => jobQuerySchema.parse({ contract: "VIE" })).toThrow();
    expect(jobQuerySchema.parse({ contract: "INTERNSHIP" }).contract).toBe("INTERNSHIP");
    expect(jobQuerySchema.parse({ contract: "CDI" }).contract).toBe("CDI");
  });

  it("coerces paging and caps the page size", () => {
    expect(jobQuerySchema.parse({ page: "3", pageSize: "50" })).toMatchObject({
      page: 3,
      pageSize: 50,
    });
    expect(() => jobQuerySchema.parse({ pageSize: "51" })).toThrow();
    expect(() => jobQuerySchema.parse({ page: "0" })).toThrow();
  });

  it("reads the official-source filter as a boolean", () => {
    expect(jobQuerySchema.parse({ officialOnly: "true" }).officialOnly).toBe(true);
    expect(jobQuerySchema.parse({ officialOnly: "false" }).officialOnly).toBe(false);
  });

  it("accepte un filtre de salaire et le tri par rémunération", () => {
    expect(
      jobQuerySchema.parse({ salaryMin: "30000", salaryMax: "60000", sort: "SALARY" }),
    ).toMatchObject({
      salaryMin: 30000,
      salaryMax: 60000,
      sort: "SALARY",
    });
    expect(() => jobQuerySchema.parse({ salaryMin: "-1" })).toThrow();
    expect(() => jobQuerySchema.parse({ salaryMax: "abc" })).toThrow();
  });

  it("requires a search term long enough to be meaningful", () => {
    expect(() => jobQuerySchema.parse({ q: "a" })).toThrow();
    expect(jobQuerySchema.parse({ q: "  react  " }).q).toBe("react");
  });

  it("accepte une recherche ciblée sur le titre ou l'entreprise", () => {
    expect(jobQuerySchema.parse({ title: "développeur" }).title).toBe("développeur");
    expect(jobQuerySchema.parse({ company: "Acme" }).company).toBe("Acme");
    expect(() => jobQuerySchema.parse({ title: "a" })).toThrow();
  });
});

describe("freshnessQuerySchema", () => {
  it("defaults to the last 5 days and offers no wider window", () => {
    expect(freshnessQuerySchema.parse({}).freshness).toBe("LAST_5D");
    expect(freshnessQuerySchema.parse({ freshness: "LAST_24H" }).freshness).toBe("LAST_24H");
    expect(() => freshnessQuerySchema.parse({ freshness: "LAST_7D" })).toThrow();
  });
});

describe("jobSlugSchema", () => {
  it("accepts a lowercase hyphenated slug", () => {
    expect(jobSlugSchema.parse({ slug: "alternance-dev-front-end-75" }).slug).toBe(
      "alternance-dev-front-end-75",
    );
  });

  it("rejects anything that is not a plain slug", () => {
    expect(() => jobSlugSchema.parse({ slug: "Alternance-Dev" })).toThrow();
    expect(() => jobSlugSchema.parse({ slug: "dev/../../etc" })).toThrow();
    expect(() => jobSlugSchema.parse({ slug: "dev job" })).toThrow();
    expect(() => jobSlugSchema.parse({ slug: "-dev" })).toThrow();
    expect(() => jobSlugSchema.parse({ slug: "" })).toThrow();
  });
});
