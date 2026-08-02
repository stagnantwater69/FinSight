import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { assessImageQuality, SHARPNESS_FLOOR } from "../../src/lib/imageQuality";

/**
 * Built from generated images rather than corpus files, so the suite runs
 * anywhere — the corpus images are gitignored because some are real receipts.
 * What is asserted here is the RELATIONSHIP the detector depends on (a blurred
 * copy scores below its sharp original), not absolute numbers, which would
 * pin the test to one version of sharp's resampling.
 */

/** Text-like horizontal bars: the strong edges a receipt's print produces. */
async function printedPage(): Promise<Buffer> {
  const width = 600;
  const height = 800;
  const pixels = Buffer.alloc(width * height, 255);
  for (let y = 40; y < height - 40; y += 20) {
    for (let row = 0; row < 6; row++) {
      const yy = y + row;
      if (yy >= height) break;
      pixels.fill(20, yy * width + 60, yy * width + width - 60);
    }
  }
  return sharp(pixels, { raw: { width, height, channels: 1 } }).png().toBuffer();
}

describe("assessImageQuality", () => {
  it("scores a sharp printed page well above the floor", async () => {
    const quality = await assessImageQuality(await printedPage());
    expect(quality).not.toBeNull();
    expect(quality!.sharpness).toBeGreaterThan(SHARPNESS_FLOOR);
    expect(quality!.tooBlurredToTrust).toBe(false);
  });

  /**
   * The property the whole feature rests on: blurring an image must lower its
   * score. If this ever stops holding, the threshold means nothing.
   */
  it("scores a blurred copy below its sharp original", async () => {
    const original = await printedPage();
    const blurred = await sharp(original).blur(12).png().toBuffer();

    const sharpScore = (await assessImageQuality(original))!.sharpness;
    const blurredScore = (await assessImageQuality(blurred))!.sharpness;

    expect(blurredScore).toBeLessThan(sharpScore);
  });

  it("calls a heavily blurred page too blurred to trust", async () => {
    const blurred = await sharp(await printedPage()).blur(25).png().toBuffer();
    const quality = await assessImageQuality(blurred);
    expect(quality!.tooBlurredToTrust).toBe(true);
  });

  it("reports brightness, and reports it lower for a darkened image", async () => {
    const original = await printedPage();
    const dark = await sharp(original).linear(0.3, 0).png().toBuffer();

    const bright = (await assessImageQuality(original))!.brightness;
    const dimmed = (await assessImageQuality(dark))!.brightness;

    expect(bright).toBeGreaterThan(dimmed);
    expect(dimmed).toBeGreaterThanOrEqual(0);
  });

  /**
   * A quality hint must never be the thing that breaks an upload — it is
   * advice, and advice that throws is worse than no advice.
   */
  it("returns null rather than throwing on bytes that are not an image", async () => {
    expect(await assessImageQuality(Buffer.from("not an image at all"))).toBeNull();
  });

  /**
   * Pins the calibration this threshold came from. Corpus images that read
   * cleanly score 878 and above; the one genuinely unreadable photograph
   * scores 637. A floor outside that gap is either flagging good photographs
   * or catching nothing.
   */
  it("keeps the floor inside the gap the corpus measured", () => {
    expect(SHARPNESS_FLOOR).toBeGreaterThan(637);
    expect(SHARPNESS_FLOOR).toBeLessThan(878);
  });
});
