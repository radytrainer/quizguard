"use client";

import { useMemo } from "react";
import CodeMirror, { type Extension } from "@uiw/react-codemirror";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";

import type { CodeLanguage } from "@/backend/questions/question-types";

// One canonical home for CodeMirror setup — used by the question-authoring form (starter code /
// reference solution / preview HTML editors), the exam-taking UI (the student's own answer
// editor), and the teacher's read-only code display on the attempt review page. Anything
// CodeMirror-version- or extension-specific belongs here, not duplicated at each call site.
function extensionFor(language: CodeLanguage): Extension {
  switch (language) {
    case "html":
      return html();
    case "css":
      return css();
    case "python":
      return python();
    case "javascript":
      return javascript();
  }
}

export function CodeEditor({
  language,
  value,
  onChange,
  readOnly = false,
  minHeight = "160px",
  placeholder,
}: {
  language: CodeLanguage;
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  minHeight?: string;
  placeholder?: string;
}) {
  const extensions = useMemo(() => [extensionFor(language)], [language]);

  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      editable={!readOnly}
      extensions={extensions}
      minHeight={minHeight}
      placeholder={placeholder}
      basicSetup={{ foldGutter: false }}
      className="border-outline-variant overflow-hidden rounded-lg border text-sm"
    />
  );
}
