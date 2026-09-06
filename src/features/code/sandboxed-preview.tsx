// Deliberately no "use client" — neither export here has any interactivity or browser-only
// dependency (the iframe's sandboxing is a static attribute, not runtime behavior), so this
// stays a plain shared module usable from both a Server Component (the teacher's read-only
// review page, which calls buildCodePreviewSrcDoc() directly — a "use client" file would reject
// that: only JSX-rendered Client Components, not plain function calls, cross that boundary) and
// a Client Component (exam-attempt.tsx's live student preview).

/**
 * Builds the srcDoc for a code_answer html/css question's live preview — html renders the
 * student's code as-is; css has nothing to render standalone, so it's injected as a <style>
 * block into the question's fixed previewHtml shell (questions.preview_html).
 */
export function buildCodePreviewSrcDoc(
  language: "html" | "css",
  code: string,
  previewHtml?: string | null,
): string {
  return language === "html" ? code : `<style>${code}</style>\n${previewHtml ?? ""}`;
}

/**
 * `sandbox="allow-scripts"` only — deliberately never combined with `allow-same-origin`.
 * Together, those two would let a student's injected script both execute AND share this app's
 * origin (cookies, `fetch("/api/...")`, reaching into `window.parent`) — effectively escaping
 * the sandbox. `allow-scripts` alone keeps the iframe's document at a unique opaque origin:
 * scripts still run (an HTML question's own inline `<script>`, a CSS `:hover` demo) for a
 * meaningful preview, but can't touch anything belonging to the authenticated session.
 */
export function SandboxedPreview({
  srcDoc,
  className,
}: {
  srcDoc: string;
  className?: string;
}) {
  return (
    <iframe
      sandbox="allow-scripts"
      srcDoc={srcDoc}
      title="Code preview"
      className={className ?? "h-64 w-full rounded-lg border bg-white"}
    />
  );
}
