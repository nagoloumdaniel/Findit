import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PageShell } from "./page-shell.js";

describe("PageShell", () => {
  it("renders its content inside the shared page container", () => {
    const html = renderToStaticMarkup(
      <PageShell>
        <p>Findit</p>
      </PageShell>,
    );

    expect(html).toBe('<main class="page-shell"><p>Findit</p></main>');
  });
});
