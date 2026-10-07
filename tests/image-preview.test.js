import { test } from "node:test";
import assert from "node:assert/strict";
import { isPreviewableImage } from "../src/lib/files.js";

const stored = (fields) => ({ id: "a1", filePath: "images/x", fileUrl: "", ...fields });

test("images with a stored path are previewable, including HEIC", () => {
  assert.equal(isPreviewableImage(stored({ fileName: "still.jpg", fileType: "image/jpeg" })), true);
  assert.equal(isPreviewableImage(stored({ fileName: "IMG_0001.HEIC", fileType: "" })), true);
  assert.equal(isPreviewableImage(stored({ fileName: "photo", fileType: "image/heif" })), true);
});

test("non-images, SVGs and files with nowhere to load from are not previewable", () => {
  assert.equal(isPreviewableImage(stored({ fileName: "deck.pdf", fileType: "application/pdf" })), false);
  assert.equal(isPreviewableImage(stored({ fileName: "cut.mp4", fileType: "video/mp4" })), false);
  assert.equal(isPreviewableImage(stored({ fileName: "logo.svg", fileType: "image/svg+xml" })), false);
  assert.equal(isPreviewableImage({ id: "a2", fileName: "still.png", fileType: "image/png", filePath: "", fileUrl: "" }), false);
  assert.equal(isPreviewableImage(null), false);
});
