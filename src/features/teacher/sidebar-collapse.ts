// Deliberately its own plain module (no "use client") — teacher-layout.tsx (Server Component)
// and teacher-shell.tsx (Client Component) both need this exact string, and a named export
// from a "use client" file doesn't survive a Server Component import intact unless it's the
// component itself: importing a plain constant across that boundary silently returns something
// other than the string, which is exactly what broke this the first time.
export const SIDEBAR_COLLAPSE_COOKIE = "qg_sidebar_collapsed";
