import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Logo } from "./logo";

describe("Logo", () => {
  it("stays decorative because the page heading already carries the name", () => {
    const html = renderToStaticMarkup(<Logo />);

    expect(html).toBe('<span class="logo" aria-hidden="true"></span>');
  });

  it("references no image file, so only the themed CSS rule triggers a download", () => {
    const html = renderToStaticMarkup(<Logo />);

    expect(html).not.toContain("logonoir.png");
    expect(html).not.toContain("logoblanc.png");
  });
});
