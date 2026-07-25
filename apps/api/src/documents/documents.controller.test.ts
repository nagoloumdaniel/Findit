import { ConflictException, NotFoundException, StreamableFile } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { DocumentsController } from "./documents.controller.js";
import { ResumeNotStructuredForDocumentError } from "./documents.service.js";

const params = { id: "3f1d3f44-0000-7000-8000-000000000001" };

const createController = (renderCv: unknown) => new DocumentsController({ renderCv } as never);

describe("DocumentsController.cv", () => {
  it("streams the PDF with its content type and suggested filename", async () => {
    const controller = createController(
      vi.fn().mockResolvedValue({ pdf: Buffer.from("%PDF-fake"), fileName: "cv-test.pdf" }),
    );

    const file = await controller.cv(params);

    expect(file).toBeInstanceOf(StreamableFile);
    expect(file.options.type).toBe("application/pdf");
    expect(file.options.disposition).toContain('filename="cv-test.pdf"');
  });

  it("maps a dead resume to 404", async () => {
    const controller = createController(vi.fn().mockResolvedValue(null));
    await expect(controller.cv(params)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("maps an unstructured resume to 409, with the remedy in the message", async () => {
    const controller = createController(
      vi.fn().mockRejectedValue(new ResumeNotStructuredForDocumentError()),
    );
    await expect(controller.cv(params)).rejects.toBeInstanceOf(ConflictException);
  });
});
