import { describe, expect, it } from "vitest";

import { jobQuerySchema } from "./job-query.js";

describe("jobQuerySchema", () => {
  it("defaults to the last 24 hours across the whole scope", () => {
    const query = jobQuerySchema.parse({});

    expect(query.freshness).toBe("LAST_24H");
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

  it("rejects a contract outside alternance and internship", () => {
    expect(() => jobQuerySchema.parse({ contract: "CDI" })).toThrow();
    expect(jobQuerySchema.parse({ contract: "INTERNSHIP" }).contract).toBe("INTERNSHIP");
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

  it("requires a search term long enough to be meaningful", () => {
    expect(() => jobQuerySchema.parse({ q: "a" })).toThrow();
    expect(jobQuerySchema.parse({ q: "  react  " }).q).toBe("react");
  });
});
