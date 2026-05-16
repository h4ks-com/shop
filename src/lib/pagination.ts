export const PAGE_SIZE = 15;

export function parsePage(raw: string | string[] | undefined): number {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v === undefined) return 1;
  const n = Number(v);
  return Number.isSafeInteger(n) && n >= 1 ? n : 1;
}

export type Window = {
  page: number;
  offset: number;
  totalPages: number;
  hasPrev: boolean;
  hasNext: boolean;
};

export function pageWindow({ page, total }: { page: number; total: number }): Window {
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const clamped = Math.min(Math.max(1, page), totalPages);
  return {
    page: clamped,
    offset: (clamped - 1) * PAGE_SIZE,
    totalPages,
    hasPrev: clamped > 1,
    hasNext: clamped < totalPages,
  };
}
