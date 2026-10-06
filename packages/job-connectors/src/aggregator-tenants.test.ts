import { describe, expect, it } from "vitest";

import { isAggregatorTenant } from "./aggregator-tenants.js";

describe("isAggregatorTenant", () => {
  it("reconnaît un locataire qui publie les offres des autres", () => {
    // Mesuré : lever/jobgether a rendu 3 501 des 4 251 offres d'une collecte.
    expect(isAggregatorTenant("lever", "jobgether")).toBe(true);
    expect(isAggregatorTenant("lever", "JobGether")).toBe(true);
  });

  it("laisse passer un vrai employeur", () => {
    expect(isAggregatorTenant("lever", "theodo")).toBe(false);
    expect(isAggregatorTenant("greenhouse", "jobgether")).toBe(false);
    expect(isAggregatorTenant("greenhouse", "doctolib")).toBe(false);
  });
});
