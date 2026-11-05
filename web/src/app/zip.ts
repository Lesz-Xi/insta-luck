/**
 * A ZIP of images, built in the browser so the server holds nothing new. Entries
 * are stored, not compressed: JPEG and WebP are already compressed, so deflating
 * them again would cost time and save almost nothing. That also keeps this small
 * enough to read, with no library. A sheet is bounded well below the format's
 * 4 GB and 65,535-entry limits.
 */
export interface ZipEntry {
  readonly name: string;
  readonly bytes: Uint8Array;
}

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_DIRECTORY = 0x06054b50;
const VERSION = 20;
const UTF8_NAMES = 0x0800;
const STORED = 0;

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** ZIP keeps time in the local clock, to two seconds, and starts at 1980. */
function dosDateTime(date: Date): { readonly time: number; readonly day: number } {
  const year = Math.max(date.getFullYear(), 1980);
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    day: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  };
}

/**
 * Entry names come from the server, but an archive outlives this page: a name
 * can't be allowed to climb out of the folder it's unpacked into, or to overwrite
 * another entry.
 */
function safeNames(names: readonly string[]): readonly string[] {
  const used = new Set<string>();
  return names.map((name) => {
    const clean = name.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "") || "frame";
    const dot = clean.lastIndexOf(".");
    const [stem, extension] = dot > 0 ? [clean.slice(0, dot), clean.slice(dot)] : [clean, ""];
    let candidate = clean;
    for (let copy = 2; used.has(candidate); copy += 1) candidate = `${stem}-${copy}${extension}`;
    used.add(candidate);
    return candidate;
  });
}

function header(size: number): { readonly bytes: Uint8Array; readonly view: DataView } {
  const bytes = new Uint8Array(size);
  return { bytes, view: new DataView(bytes.buffer) };
}

export function buildZip(entries: readonly ZipEntry[], modified: Date = new Date()): Blob {
  const encoder = new TextEncoder();
  const { time, day } = dosDateTime(modified);
  const names = safeNames(entries.map((entry) => entry.name));
  const parts: Uint8Array[] = [];
  const directory: Uint8Array[] = [];
  let offset = 0;

  entries.forEach((entry, index) => {
    const name = encoder.encode(names[index] ?? "");
    const checksum = crc32(entry.bytes);
    const size = entry.bytes.byteLength;

    const local = header(30);
    local.view.setUint32(0, LOCAL_HEADER, true);
    local.view.setUint16(4, VERSION, true);
    local.view.setUint16(6, UTF8_NAMES, true);
    local.view.setUint16(8, STORED, true);
    local.view.setUint16(10, time, true);
    local.view.setUint16(12, day, true);
    local.view.setUint32(14, checksum, true);
    local.view.setUint32(18, size, true);
    local.view.setUint32(22, size, true);
    local.view.setUint16(26, name.byteLength, true);
    parts.push(local.bytes, name, entry.bytes);

    const central = header(46);
    central.view.setUint32(0, CENTRAL_HEADER, true);
    central.view.setUint16(4, VERSION, true);
    central.view.setUint16(6, VERSION, true);
    central.view.setUint16(8, UTF8_NAMES, true);
    central.view.setUint16(10, STORED, true);
    central.view.setUint16(12, time, true);
    central.view.setUint16(14, day, true);
    central.view.setUint32(16, checksum, true);
    central.view.setUint32(20, size, true);
    central.view.setUint32(24, size, true);
    central.view.setUint16(28, name.byteLength, true);
    central.view.setUint32(42, offset, true);
    directory.push(central.bytes, name);

    offset += local.bytes.byteLength + name.byteLength + size;
  });

  const directorySize = directory.reduce((sum, part) => sum + part.byteLength, 0);
  const end = header(22);
  end.view.setUint32(0, END_OF_DIRECTORY, true);
  end.view.setUint16(8, entries.length, true);
  end.view.setUint16(10, entries.length, true);
  end.view.setUint32(12, directorySize, true);
  end.view.setUint32(16, offset, true);

  return new Blob([...parts, ...directory, end.bytes] as BlobPart[], { type: "application/zip" });
}
