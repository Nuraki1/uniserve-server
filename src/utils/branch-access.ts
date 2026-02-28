import type { AuthedUser } from "../middleware/auth";

export type BranchScope =
  | { mode: "all" }
  | { mode: "some"; branchIds: string[] };

export function getBranchScope(authed: AuthedUser): BranchScope {
  // Admin: always all branches
  if (authed.role === "admin") return { mode: "all" };

  // Non-admin:
  // - allowedBranchIds === null/undefined => all branches
  // - [] => none (treat as none)
  const ids = authed.allowedBranchIds;
  if (ids == null) return { mode: "all" };
  const deduped = Array.from(new Set(ids.map((s) => String(s).trim()).filter(Boolean)));
  return { mode: "some", branchIds: deduped };
}

export function canAccessBranch(authed: AuthedUser, branchId: string | null | undefined): boolean {
  const bid = typeof branchId === "string" ? branchId.trim() : "";
  if (!bid) return true; // "all branches" query is always allowed (actual filtering happens elsewhere)

  const scope = getBranchScope(authed);
  if (scope.mode === "all") return true;
  return scope.branchIds.includes(bid);
}

/**
 * For models with a `branchId` column, build a safe Prisma where clause
 * based on the requesting user and optional requestedBranchId.
 */
export function branchWhereForRead(
  authed: AuthedUser,
  requestedBranchId: string | undefined
): { where: { branchId?: any } | undefined; status?: number; error?: string } {
  const requested = typeof requestedBranchId === "string" ? requestedBranchId.trim() : "";
  const scope = getBranchScope(authed);

  if (requested) {
    if (!canAccessBranch(authed, requested)) {
      return { where: undefined, status: 403, error: "Forbidden" };
    }
    return { where: { branchId: requested } };
  }

  if (scope.mode === "all") {
    return { where: undefined };
  }

  // No requested branchId; restrict to allowed branches.
  if (scope.branchIds.length === 0) {
    // No allowed branches configured → return empty dataset rather than leak.
    return { where: { branchId: { in: ["__none__"] } } };
  }
  return { where: { branchId: { in: scope.branchIds } } };
}

/**
 * Resolve a mutation branchId. For multi-branch staff, branchId must be provided and allowed.
 */
export function resolveBranchIdForWrite(
  authed: AuthedUser,
  requestedBranchId: string | null | undefined
): { branchId: string | null; status?: number; error?: string } {
  const requested = typeof requestedBranchId === "string" ? requestedBranchId.trim() : "";
  const scope = getBranchScope(authed);

  if (authed.role === "admin") {
    return { branchId: requested || null };
  }

  // "All branches" staff must pick a specific branch for writes.
  if (scope.mode === "all") {
    if (!requested) return { branchId: null, status: 400, error: "branchId is required" };
    return { branchId: requested };
  }

  if (!requested) {
    // If exactly one branch is allowed, default to it; otherwise require explicit choice.
    if (scope.branchIds.length === 1) return { branchId: scope.branchIds[0] };
    return { branchId: null, status: 400, error: "branchId is required" };
  }

  if (!scope.branchIds.includes(requested)) {
    return { branchId: null, status: 403, error: "Forbidden" };
  }
  return { branchId: requested };
}






