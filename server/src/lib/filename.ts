import path from "node:path";
import { formatRangeSlug, type JobRange } from "@clipshed/shared";

const RESERVED_WINDOWS_NAMES =
  /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

export function sanitizeFilename(input: string, fallback = "video"): string {
  let name = input
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[<>:"/\\|?*]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  name = name.replace(/[. ]+$/g, "").trim();

  if (!name) name = fallback;
  if (RESERVED_WINDOWS_NAMES.test(name)) name = `_${name}`;

  if (name.length > 110) {
    name = name.slice(0, 110).trim();
  }

  return name || fallback;
}

export function buildOutputBase(
  title: string,
  range: JobRange | null,
  fallback: string,
): string {
  const safeTitle = sanitizeFilename(title, fallback);
  if (!range) return safeTitle;

  const suffix = ` [${formatRangeSlug(range.start, range.end)}]`;
  const maxBaseLength = 110 - suffix.length;
  const truncated = safeTitle.slice(0, Math.max(1, maxBaseLength)).trim();
  return `${truncated}${suffix}`;
}

export function isPathInside(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
