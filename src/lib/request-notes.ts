// The `serviceRequests.notes` column stores two different things concatenated:
//   1. the applicant's own note, captured at registration; and
//   2. admin remarks, appended by the backend as blocks that begin with
//      "[Admin · <timestamp>] <message>" (see sendNotificationToUser /
//      updateRequestStatus).
// Historically the whole field was rendered under "Note from Applicant", so admin
// messages looked like they came from the applicant. This helper separates the two
// so each can be labelled correctly.

export type AdminRemark = { stamp: string; message: string };

const ADMIN_MARKER = /^\[Admin · (.+?)\]\s*([\s\S]*)$/;

export function splitRequestNotes(notes?: string | null): {
  applicantNote: string;
  adminRemarks: AdminRemark[];
} {
  if (!notes) return { applicantNote: "", adminRemarks: [] };

  // Admin remarks are appended as "\n\n[Admin · …]" blocks. Split on that marker
  // so anything before the first one stays as the applicant's original note.
  const parts = notes.split(/\n\n(?=\[Admin · )/);
  const applicantNote = parts[0] && !parts[0].startsWith("[Admin · ") ? parts[0].trim() : "";

  const adminRemarks: AdminRemark[] = [];
  for (const part of parts) {
    const m = part.match(ADMIN_MARKER);
    if (m) adminRemarks.push({ stamp: m[1].trim(), message: m[2].trim() });
  }

  return { applicantNote, adminRemarks };
}
