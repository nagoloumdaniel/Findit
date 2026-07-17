import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Logo } from "./logo";

describe("Logo", () => {
  it("completes the glyph into the name", () => {
    const html = renderToStaticMarkup(<Logo />);

    expect(html).toContain('<span class="logo">');
    expect(html).toContain('<span class="brand-name">indit</span>');
  });

  it("stays decorative, because « indit » read aloud would say less than nothing", () => {
    const html = renderToStaticMarkup(<Logo />);

    expect(html).toBe(
      '<span class="brand" aria-hidden="true"><span class="logo"></span><span class="brand-name">indit</span></span>',
    );
  });

  it("references no image file, so only the themed CSS rule triggers a download", () => {
    const html = renderToStaticMarkup(<Logo />);

    expect(html).not.toContain("logonoir.png");
    expect(html).not.toContain("logoblanc.png");
  });
});
