import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildZip, crc32 } from "../src/app/zip.js";

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);

let folder: string | undefined;

/** Writes the archive out and hands it to the system's unzip, which shares no code with what built it. */
async function unpacked(blob: Blob): Promise<{ readonly names: readonly string[]; readonly read: (name: string) => string }> {
  const dir = mkdtempSync(join(tmpdir(), "insta-luck-zip-"));
  folder = dir;
  const path = join(dir, "test.zip");
  writeFileSync(path, new Uint8Array(await blob.arrayBuffer()));
  execFileSync("unzip", ["-tq", path]);
  execFileSync("unzip", ["-q", path, "-d", join(dir, "out")]);
  return {
    names: execFileSync("unzip", ["-Z1", path], { encoding: "utf8" }).trim().split("\n"),
    read: (name) => readFileSync(join(dir, "out", name), "utf8")
  };
}

afterEach(() => {
  if (folder !== undefined) rmSync(folder, { recursive: true, force: true });
  folder = undefined;
});

describe("the ZIP", () => {
  it("computes the standard checksum", () => {
    expect(crc32(bytes("123456789"))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it("is a valid archive that another tool can open, with the same bytes in the same order", async () => {
    const zip = await unpacked(
      buildZip([
        { name: "insta-luck-nasa-01.jpg", bytes: bytes("first") },
        { name: "insta-luck-ABCDE-02.webp", bytes: bytes("second") }
      ])
    );
    expect(zip.names).toEqual(["insta-luck-nasa-01.jpg", "insta-luck-ABCDE-02.webp"]);
    expect(zip.read("insta-luck-nasa-01.jpg")).toBe("first");
    expect(zip.read("insta-luck-ABCDE-02.webp")).toBe("second");
  });

  it("is labelled as a ZIP", () => {
    expect(buildZip([{ name: "a.jpg", bytes: bytes("x") }]).type).toBe("application/zip");
  });

  it("stores binary data exactly, including an empty file", async () => {
    const all = Uint8Array.from({ length: 256 }, (_, index) => index);
    const blob = buildZip([
      { name: "all.bin", bytes: all },
      { name: "empty.bin", bytes: new Uint8Array() }
    ]);
    const zip = await unpacked(blob);
    expect(zip.names).toEqual(["all.bin", "empty.bin"]);
    expect(new Uint8Array(await blob.arrayBuffer()).length).toBeGreaterThan(all.length);
  });

  it("can't write outside the folder it's unpacked into", async () => {
    const zip = await unpacked(
      buildZip([
        { name: "../../evil.jpg", bytes: bytes("a") },
        { name: "/etc/passwd", bytes: bytes("b") },
        { name: "..\\..\\evil.jpg", bytes: bytes("c") },
        { name: "...", bytes: bytes("d") }
      ])
    );
    for (const name of zip.names) {
      expect(name).not.toMatch(/[/\\]/);
      expect(name.startsWith(".")).toBe(false);
    }
    expect(new Set(zip.names).size).toBe(4);
  });

  it("never lets one entry replace another", async () => {
    const zip = await unpacked(
      buildZip([
        { name: "frame.jpg", bytes: bytes("one") },
        { name: "frame.jpg", bytes: bytes("two") },
        { name: "frame.jpg", bytes: bytes("three") }
      ])
    );
    expect(zip.names).toEqual(["frame.jpg", "frame-2.jpg", "frame-3.jpg"]);
    expect(zip.read("frame-3.jpg")).toBe("three");
  });

  it("keeps a date from before the format's epoch inside the format", async () => {
    const zip = await unpacked(buildZip([{ name: "a.jpg", bytes: bytes("x") }], new Date("1970-01-01T00:00:00")));
    expect(zip.names).toEqual(["a.jpg"]);
  });
});
