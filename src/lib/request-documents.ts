/**
 * Matching between a registration's required-document checklist and the files
 * actually attached to it.
 *
 * Both the customer view (profile/requests) and the staff view (admin) render
 * the same "uploaded vs pending" list, so they share this module — the two used
 * to carry separate copies of the logic and could disagree about the same
 * registration.
 *
 * A file is tied to a checklist row by the heading it was uploaded against,
 * which the backend stores on `docLabel` (and, for rows filed before that
 * column existed, encodes in the name as "Heading :: filename"). Matching is by
 * that heading only. Nothing is matched by guessing from keywords in the file
 * name, and a leftover file is never assigned to a leftover requirement to make
 * the numbers look better: an unlabelled file shows up under "Additional files"
 * and the requirement it did not name stays Pending.
 */

export type ChecklistDoc = {
  id: number | string;
  name: string;
  docLabel?: string | null;
  storagePath?: string;
  sizeBytes?: number | null;
  createdAt?: string | Date;
  [key: string]: unknown;
};

export type ChecklistMatch = {
  /** Required heading → the file(s) filed against it, newest first. */
  matches: Record<string, ChecklistDoc[]>;
  /** Files not filed against any heading on the checklist. */
  unclaimedDocs: ChecklistDoc[];
  /** Headings with at least one file. */
  uploadedCount: number;
  /** Headings still waiting on the applicant. */
  pendingCount: number;
  /** Whole-number percentage of the checklist that is satisfied. */
  progressPct: number;
};

/** Split the stored name into its checklist heading and the original file name. */
export function parseDocLabel(name: string): { label: string; fileName: string } {
  if (!name) return { label: "Uploaded Document", fileName: "document" };

  const trimmed = name.trim();

  for (const delimiter of [" :: ", " __FILE__ "]) {
    if (trimmed.includes(delimiter)) {
      const parts = trimmed.split(delimiter);
      const label = parts[0].trim();
      const fileName = parts.slice(1).join(delimiter).trim();
      return { label: label || "Uploaded Document", fileName: fileName || name };
    }
  }

  return { label: trimmed, fileName: trimmed };
}

/** The heading a file was filed against, or "" when it wasn't filed against one. */
export function documentHeading(doc: ChecklistDoc): string {
  const stored = typeof doc.docLabel === "string" ? doc.docLabel.trim() : "";
  if (stored) return stored;

  // Legacy rows: the heading only exists inside the name.
  const parsed = parseDocLabel(doc.name ?? "");
  if (parsed.label && parsed.label !== parsed.fileName && parsed.label !== "Uploaded Document") {
    return parsed.label;
  }
  return "";
}

/** Case/punctuation-insensitive key so "PAN & Aadhaar" matches "PAN and Aadhaar". */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

/** The file name to show for an attachment, without the heading prefix. */
export function documentFileName(doc: ChecklistDoc): string {
  return parseDocLabel(doc.name ?? "").fileName;
}

export function matchDocumentsToChecklist(
  requiredDocs: string[] | null | undefined,
  uploadedDocs: ChecklistDoc[] | null | undefined
): ChecklistMatch {
  const required = (requiredDocs ?? []).filter((d) => typeof d === "string" && d.trim());
  const uploaded = uploadedDocs ?? [];

  const matches: Record<string, ChecklistDoc[]> = {};
  const claimed = new Set<number | string>();

  // Index the checklist by normalized heading once.
  const byNormalized = new Map<string, string>();
  for (const req of required) {
    const key = normalize(req);
    if (key && !byNormalized.has(key)) byNormalized.set(key, req);
  }

  for (const doc of uploaded) {
    const heading = documentHeading(doc);
    if (!heading) continue;
    const key = normalize(heading);
    if (!key) continue;

    // Exact heading, then a containment match that only fires when the shorter
    // side is substantial — enough to absorb a truncated or lightly reworded
    // heading, not enough to pair two unrelated requirements.
    let req = byNormalized.get(key);
    if (!req) {
      for (const [reqKey, reqLabel] of byNormalized) {
        const shorter = Math.min(reqKey.length, key.length);
        if (shorter >= 8 && (reqKey.includes(key) || key.includes(reqKey))) {
          req = reqLabel;
          break;
        }
      }
    }
    if (!req) continue;

    (matches[req] ??= []).push(doc);
    claimed.add(doc.id);
  }

  // Newest first within each requirement, so a re-upload is shown on top.
  const time = (d: ChecklistDoc) => new Date(d.createdAt ?? 0).getTime() || 0;
  for (const list of Object.values(matches)) list.sort((a, b) => time(b) - time(a));

  const unclaimedDocs = uploaded.filter((d) => !claimed.has(d.id));
  const uploadedCount = required.filter((r) => (matches[r]?.length ?? 0) > 0).length;

  return {
    matches,
    unclaimedDocs,
    uploadedCount,
    pendingCount: required.length - uploadedCount,
    progressPct: required.length > 0 ? Math.round((uploadedCount / required.length) * 100) : 0,
  };
}
