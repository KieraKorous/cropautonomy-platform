import { describe, expect, it } from "vitest";
import { analyzePixels, classifyPixel, rgbToHsv } from "./classify";

describe("rgbToHsv", () => {
  it("converts primary-ish colors", () => {
    expect(rgbToHsv(0, 128, 0).h).toBeCloseTo(120, 0); // green hue
    expect(rgbToHsv(245, 245, 245).s).toBeCloseTo(0, 5); // white → no saturation
    expect(rgbToHsv(0, 0, 0).v).toBe(0); // black → no value
  });
});

describe("classifyPixel", () => {
  it("buckets plant-material colors", () => {
    expect(classifyPixel(30, 140, 40)).toBe("green");
    expect(classifyPixel(230, 220, 40)).toBe("yellow");
    expect(classifyPixel(110, 70, 30)).toBe("brown");
  });

  it("treats washed-out, dark, and gray pixels as other (background)", () => {
    expect(classifyPixel(245, 245, 245)).toBe("other"); // white
    expect(classifyPixel(10, 10, 10)).toBe("other"); // near-black
    expect(classifyPixel(130, 130, 128)).toBe("other"); // gray
  });
});

describe("analyzePixels", () => {
  it("computes class percentages and vegetation coverage over an RGBA buffer", () => {
    // 4 pixels: green, yellow, brown, white(other)
    const data = new Uint8ClampedArray([
      30, 140, 40, 255, // green
      230, 220, 40, 255, // yellow
      110, 70, 30, 255, // brown
      245, 245, 245, 255 // other
    ]);
    const result = analyzePixels(data);
    expect(result.sampledPixels).toBe(4);
    expect(result.greenPercent).toBe(25);
    expect(result.yellowPercent).toBe(25);
    expect(result.brownPercent).toBe(25);
    expect(result.otherPercent).toBe(25);
    expect(result.vegetationCoveragePercent).toBe(75);
  });

  it("ignores fully transparent pixels", () => {
    const data = new Uint8ClampedArray([
      30, 140, 40, 255, // green, counted
      0, 0, 0, 0 // transparent, skipped
    ]);
    const result = analyzePixels(data);
    expect(result.sampledPixels).toBe(1);
    expect(result.greenPercent).toBe(100);
  });
});
