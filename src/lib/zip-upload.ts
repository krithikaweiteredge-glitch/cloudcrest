import JSZip from "jszip";

/**
 * ZIP support for document uploads. Applicants can pick one .zip holding all
 * their documents instead of choosing every file separately. The archive is
 * unpacked in the browser and each file inside is uploaded on its own, so the
 * backend (multer, 10 MB per file) needs no zip handling of its own.
 */

const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  txt: "text/plain",
};

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export function isZipFile(f: File): boolean {
  return /\.zip$/i.test(f.name) || f.type === "application/zip" || f.type === "application/x-zip-compressed";
}

/** OS junk that zip tools add: macOS resource forks, .DS_Store, Thumbs.db, dotfiles. */
function isJunkEntry(path: string): boolean {
  const base = path.split("/").pop() ?? "";
  return path.startsWith("__MACOSX/") || base.startsWith(".") || base.toLowerCase() === "thumbs.db";
}

async function extractZip(zipFile: File): Promise<File[]> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(zipFile);
  } catch {
    throw new Error(`"${zipFile.name}" could not be opened — make sure it is a valid .zip file.`);
  }
  const entries = Object.values(zip.files).filter((e) => !e.dir && !isJunkEntry(e.name));
  const out: File[] = [];
  for (const entry of entries) {
    const base = entry.name.split("/").pop()!;
    const ext = base.split(".").pop()?.toLowerCase() ?? "";
    const blob = await entry.async("blob");
    const file = new File([blob], base, { type: MIME_BY_EXT[ext] ?? "application/octet-stream" });
    // Zips inside zips are unpacked too.
    out.push(...(isZipFile(file) ? await extractZip(file) : [file]));
  }
  return out;
}

/**
 * Replaces every .zip in `files` with the files inside it; other files pass
 * through untouched. Throws if an archive is unreadable, empty, or holds a file
 * over the per-file upload limit.
 */
export async function expandZipFiles(files: FileList | File[] | null): Promise<File[]> {
  const list = files ? Array.from(files) : [];
  const out: File[] = [];
  for (const f of list) {
    if (!isZipFile(f)) {
      out.push(f);
      continue;
    }
    const inner = await extractZip(f);
    if (inner.length === 0) throw new Error(`"${f.name}" does not contain any documents.`);
    out.push(...inner);
  }
  const tooBig = out.find((f) => f.size > MAX_UPLOAD_BYTES);
  if (tooBig) throw new Error(`"${tooBig.name}" is larger than 10 MB. Please compress or split it.`);
  return out;
}

const STOP_WORDS = new Set(["of", "the", "and", "or", "if", "all", "a", "an", "to", "for", "in", "copy", "proof", "document", "documents", "card", "mo"]);

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, "")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

/**
 * Best checklist heading for a file pulled out of a zip, judged by the words
 * its file name shares with each heading (e.g. "pan_aadhaar_director1.pdf" →
 * "PAN & Aadhaar of all directors"). Returns undefined when nothing matches,
 * so the caller can file it under "Additional documents".
 */
export function matchDocLabel(fileName: string, labels: string[]): string | undefined {
  const nameTokens = tokens(fileName);
  let best: string | undefined;
  let bestScore = 0;
  for (const label of labels) {
    const labelTokens = tokens(label);
    const score = labelTokens.filter((lt) => nameTokens.some((nt) => nt === lt || (lt.length > 3 && nt.startsWith(lt)) || (nt.length > 3 && lt.startsWith(nt)))).length;
    if (score > bestScore) {
      best = label;
      bestScore = score;
    }
  }
  return best;
}
