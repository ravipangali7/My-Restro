/** True if this pathname is the route itself or a nested page under `to`. */
function pathMatches(to: string, pathname: string): boolean {
  return pathname === to || pathname.startsWith(`${to}/`);
}

/** Whether `child` is a strictly more specific nav path under `parent` (e.g. /a/b under /a). */
function isStrictDescendantNavPath(parent: string, child: string): boolean {
  if (parent === "/") return child.startsWith("/") && child !== "/";
  return child.startsWith(`${parent}/`);
}

/**
 * Active state for a flat list of paths: only the longest matching prefix wins,
 * so /portal does not stay active on /portal/restaurants when both are nav items.
 */
export function isNavPathActive(pathname: string, to: string, allPaths: string[]): boolean {
  if (!pathMatches(to, pathname)) return false;
  return !allPaths.some(
    (p) =>
      p !== to &&
      p.length > to.length &&
      pathMatches(p, pathname) &&
      isStrictDescendantNavPath(to, p)
  );
}

export function collectNavPaths(items: { to: string; children?: { to: string }[] }[]): string[] {
  const paths: string[] = [];
  for (const item of items) {
    paths.push(item.to);
    if (item.children) for (const c of item.children) paths.push(c.to);
  }
  return paths;
}
