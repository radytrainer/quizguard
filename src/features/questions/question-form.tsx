"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { questionInputSchema } from "@/backend/questions/question.schema";
import {
  ALL_QUESTION_TYPES,
  CODE_LANGUAGES,
  QUESTION_TYPES,
  type CodeLanguage,
} from "@/backend/questions/question-types";
import type { QuestionType } from "@/database/schema";
import { CodeEditor } from "@/features/code/code-editor";

const DEFAULT_NUMERIC_TOLERANCE = 0;
const DEFAULT_CODE_LANGUAGE: CodeLanguage = "python";

function isExecutableLanguage(language: CodeLanguage): boolean {
  return language === "python" || language === "javascript";
}

interface OptionState {
  text: string;
  isCorrect: boolean;
}

interface TestCaseState {
  input: string;
  expectedOutput: string;
  isSample: boolean;
}

function defaultTestCasesFor(language: CodeLanguage): TestCaseState[] {
  return isExecutableLanguage(language)
    ? [{ input: "", expectedOutput: "", isSample: true }]
    : [];
}

interface FormState {
  type: QuestionType;
  subject: string;
  category: string;
  difficulty: "easy" | "medium" | "hard";
  points: number;
  text: string;
  explanation: string;
  tags: string[];
  options: OptionState[];
  numericTolerance: number;
  codeLanguage: CodeLanguage;
  starterCode: string;
  referenceSolution: string;
  previewHtml: string;
  testCases: TestCaseState[];
}

function defaultOptionsFor(type: QuestionType): OptionState[] {
  switch (type) {
    case "true_false":
      return [
        { text: "True", isCorrect: false },
        { text: "False", isCorrect: false },
      ];
    case "essay":
    case "code_answer":
      return [];
    case "short_answer":
    case "fill_in_blank":
    case "numeric_answer":
      return [{ text: "", isCorrect: true }];
    default:
      return [
        { text: "", isCorrect: false },
        { text: "", isCorrect: false },
      ];
  }
}

export interface QuestionFormInitialData {
  id: string;
  type: QuestionType;
  subject: string;
  category: string | null;
  difficulty: "easy" | "medium" | "hard";
  points: number;
  text: string;
  explanation: string | null;
  tags: string[];
  options: { text: string; isCorrect: boolean }[];
  numericTolerance: number | null;
  codeLanguage: CodeLanguage | null;
  starterCode: string | null;
  referenceSolution: string | null;
  previewHtml: string | null;
  testCases: { input: string; expectedOutput: string; isSample: boolean }[];
}

export function QuestionForm({
  initialData,
}: {
  initialData?: QuestionFormInitialData;
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() =>
    initialData
      ? {
          type: initialData.type,
          subject: initialData.subject,
          category: initialData.category ?? "",
          difficulty: initialData.difficulty,
          points: initialData.points,
          text: initialData.text,
          explanation: initialData.explanation ?? "",
          tags: initialData.tags,
          options: initialData.options,
          numericTolerance:
            initialData.numericTolerance ?? DEFAULT_NUMERIC_TOLERANCE,
          codeLanguage: initialData.codeLanguage ?? DEFAULT_CODE_LANGUAGE,
          starterCode: initialData.starterCode ?? "",
          referenceSolution: initialData.referenceSolution ?? "",
          previewHtml: initialData.previewHtml ?? "",
          testCases: initialData.testCases,
        }
      : {
          type: "multiple_choice",
          subject: "",
          category: "",
          difficulty: "medium",
          points: 1,
          text: "",
          explanation: "",
          tags: [],
          options: defaultOptionsFor("multiple_choice"),
          numericTolerance: DEFAULT_NUMERIC_TOLERANCE,
          codeLanguage: DEFAULT_CODE_LANGUAGE,
          starterCode: "",
          referenceSolution: "",
          previewHtml: "",
          testCases: [],
        },
  );
  const [tagDraft, setTagDraft] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isChoiceType = QUESTION_TYPES[form.type].isChoice;
  const isSingleCorrect =
    form.type === "multiple_choice" || form.type === "true_false";
  const isEssay = form.type === "essay";
  const isNumeric = form.type === "numeric_answer";
  const isCode = form.type === "code_answer";
  const isCodeExecutable = isCode && isExecutableLanguage(form.codeLanguage);

  function handleTypeChange(type: QuestionType) {
    setForm((prev) => ({
      ...prev,
      type,
      options: defaultOptionsFor(type),
      numericTolerance:
        type === "numeric_answer"
          ? prev.numericTolerance
          : DEFAULT_NUMERIC_TOLERANCE,
      codeLanguage: type === "code_answer" ? prev.codeLanguage : DEFAULT_CODE_LANGUAGE,
      testCases:
        type === "code_answer"
          ? defaultTestCasesFor(prev.codeLanguage)
          : [],
    }));
  }

  function handleCodeLanguageChange(language: CodeLanguage) {
    setForm((prev) => ({
      ...prev,
      codeLanguage: language,
      // The Zod schema forbids test cases on html/css and requires >=1 on python/javascript —
      // reset here so switching languages can never leave the form in a state that would fail
      // that rule on submit.
      testCases: isExecutableLanguage(language)
        ? prev.testCases.length > 0
          ? prev.testCases
          : defaultTestCasesFor(language)
        : [],
      previewHtml: language === "css" ? prev.previewHtml : "",
    }));
  }

  function addTestCase() {
    setForm((prev) => ({
      ...prev,
      testCases: [
        ...prev.testCases,
        { input: "", expectedOutput: "", isSample: false },
      ],
    }));
  }

  function updateTestCase(index: number, patch: Partial<TestCaseState>) {
    setForm((prev) => ({
      ...prev,
      testCases: prev.testCases.map((tc, i) =>
        i === index ? { ...tc, ...patch } : tc,
      ),
    }));
  }

  function removeTestCase(index: number) {
    setForm((prev) => ({
      ...prev,
      testCases: prev.testCases.filter((_, i) => i !== index),
    }));
  }

  function updateOption(index: number, patch: Partial<OptionState>) {
    setForm((prev) => ({
      ...prev,
      options: prev.options.map((opt, i) =>
        i === index ? { ...opt, ...patch } : opt,
      ),
    }));
  }

  function setCorrectOption(index: number) {
    setForm((prev) => ({
      ...prev,
      options: prev.options.map((opt, i) => ({
        ...opt,
        isCorrect: i === index,
      })),
    }));
  }

  function addOption() {
    setForm((prev) => ({
      ...prev,
      options: [...prev.options, { text: "", isCorrect: false }],
    }));
  }

  function removeOption(index: number) {
    setForm((prev) => ({
      ...prev,
      options: prev.options.filter((_, i) => i !== index),
    }));
  }

  function addTag() {
    const value = tagDraft.trim();
    if (value && !form.tags.includes(value)) {
      setForm((prev) => ({ ...prev, tags: [...prev.tags, value] }));
    }
    setTagDraft("");
  }

  function handleTagKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addTag();
    } else if (
      event.key === "Backspace" &&
      tagDraft === "" &&
      form.tags.length > 0
    ) {
      setForm((prev) => ({ ...prev, tags: prev.tags.slice(0, -1) }));
    }
  }

  function removeTag(tag: string) {
    setForm((prev) => ({ ...prev, tags: prev.tags.filter((t) => t !== tag) }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitError(null);

    const payload = {
      type: form.type,
      subject: form.subject,
      category: form.category || undefined,
      difficulty: form.difficulty,
      points: form.points,
      text: form.text,
      explanation: form.explanation || undefined,
      tags: form.tags,
      options: isChoiceType
        ? form.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect }))
        : form.options.map((o) => ({ text: o.text })),
      ...(isNumeric ? { numericTolerance: form.numericTolerance } : {}),
      ...(isCode
        ? {
            codeLanguage: form.codeLanguage,
            starterCode: form.starterCode || undefined,
            referenceSolution: form.referenceSolution || undefined,
            ...(form.codeLanguage === "css"
              ? { previewHtml: form.previewHtml || undefined }
              : {}),
            testCases: form.testCases,
          }
        : {}),
    };

    const parsed = questionInputSchema.safeParse(payload);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        fieldErrors[issue.path.join(".") || "form"] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setSubmitting(true);

    const url = initialData
      ? `/api/questions/${initialData.id}`
      : "/api/questions";
    const method = initialData ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed.data),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setSubmitError(body?.error?.message ?? "Failed to save question.");
      setSubmitting(false);
      return;
    }

    router.push("/teacher/questions");
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid grid-cols-1 gap-6 lg:grid-cols-12"
    >
      <div className="flex flex-col gap-6 lg:col-span-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Question Text</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={form.text}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, text: e.target.value }))
              }
              placeholder="Type your question here..."
              className="min-h-32"
              aria-invalid={!!errors.text}
            />
            {errors.text && (
              <p className="text-destructive mt-1 text-sm">{errors.text}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">
              {isEssay
                ? "Grading"
                : isCode
                  ? "Code Configuration"
                  : isNumeric
                    ? "Accepted Value"
                    : isChoiceType
                      ? "Answer Options"
                      : "Accepted Answers"}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {errors.options && (
              <p className="text-destructive text-sm">{errors.options}</p>
            )}
            {errors.testCases && (
              <p className="text-destructive text-sm">{errors.testCases}</p>
            )}
            {errors.previewHtml && (
              <p className="text-destructive text-sm">{errors.previewHtml}</p>
            )}

            {isCode ? (
              <div className="flex flex-col gap-4">
                <div>
                  <Label htmlFor="code-language">Language</Label>
                  <Select
                    value={form.codeLanguage}
                    onValueChange={(v) =>
                      handleCodeLanguageChange(v as CodeLanguage)
                    }
                  >
                    <SelectTrigger id="code-language" className="mt-1.5 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CODE_LANGUAGES.map((language) => (
                        <SelectItem key={language} value={language}>
                          {language}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Starter Code (optional)</Label>
                  <div className="mt-1.5">
                    <CodeEditor
                      language={form.codeLanguage}
                      value={form.starterCode}
                      onChange={(value) =>
                        setForm((prev) => ({ ...prev, starterCode: value }))
                      }
                    />
                  </div>
                </div>

                <div>
                  <Label>Reference Solution (teacher-only, optional)</Label>
                  <div className="mt-1.5">
                    <CodeEditor
                      language={form.codeLanguage}
                      value={form.referenceSolution}
                      onChange={(value) =>
                        setForm((prev) => ({
                          ...prev,
                          referenceSolution: value,
                        }))
                      }
                    />
                  </div>
                </div>

                {form.codeLanguage === "css" && (
                  <div>
                    <Label>Preview HTML shell</Label>
                    <p className="text-muted-foreground mt-1 text-xs">
                      CSS alone has nothing to render — the student&apos;s CSS
                      previews against this fixed HTML.
                    </p>
                    <div className="mt-1.5">
                      <CodeEditor
                        language="html"
                        value={form.previewHtml}
                        onChange={(value) =>
                          setForm((prev) => ({ ...prev, previewHtml: value }))
                        }
                      />
                    </div>
                  </div>
                )}

                {isCodeExecutable && (
                  <div className="flex flex-col gap-3">
                    <Label>Test Cases</Label>
                    {form.testCases.map((testCase, index) => (
                      <div
                        key={index}
                        className="border-outline-variant flex flex-col gap-2 rounded-lg border p-3"
                      >
                        <div className="flex items-center justify-between">
                          <label className="flex items-center gap-2 text-sm">
                            <Checkbox
                              checked={testCase.isSample}
                              onCheckedChange={(checked) =>
                                updateTestCase(index, {
                                  isSample: checked === true,
                                })
                              }
                            />
                            Visible to student via &quot;Run&quot;
                          </label>
                          {form.testCases.length > 1 && (
                            <RemoveOptionButton
                              onClick={() => removeTestCase(index)}
                            />
                          )}
                        </div>
                        <div>
                          <Label className="text-xs">Input (stdin)</Label>
                          <Textarea
                            className="mt-1 font-mono text-sm"
                            value={testCase.input}
                            onChange={(e) =>
                              updateTestCase(index, { input: e.target.value })
                            }
                            placeholder="Left blank if the program reads no input"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Expected Output</Label>
                          <Textarea
                            className="mt-1 font-mono text-sm"
                            value={testCase.expectedOutput}
                            onChange={(e) =>
                              updateTestCase(index, {
                                expectedOutput: e.target.value,
                              })
                            }
                            placeholder="Exact expected stdout"
                          />
                        </div>
                      </div>
                    ))}
                    {form.testCases.length < 20 && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={addTestCase}
                        className="self-start border-dashed"
                      >
                        <Plus className="size-4" />
                        Add Test Case
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ) : isEssay ? (
              <p className="text-muted-foreground text-sm">
                Essay answers have no single correct answer — a teacher grades
                each submission by hand from the attempt&apos;s review page.
                Use Explanation (right) for rubric notes or a model answer.
              </p>
            ) : isNumeric ? (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="numeric-value">Accepted value</Label>
                  <Input
                    id="numeric-value"
                    type="number"
                    className="mt-1.5"
                    value={form.options[0]?.text ?? ""}
                    onChange={(e) =>
                      updateOption(0, { text: e.target.value })
                    }
                    placeholder="e.g. 3.14"
                  />
                </div>
                <div>
                  <Label htmlFor="numeric-tolerance">Tolerance (±)</Label>
                  <Input
                    id="numeric-tolerance"
                    type="number"
                    min={0}
                    className="mt-1.5"
                    value={form.numericTolerance}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        numericTolerance: Number(e.target.value) || 0,
                      }))
                    }
                    placeholder="0"
                  />
                </div>
              </div>
            ) : isSingleCorrect ? (
              <RadioGroup
                value={String(form.options.findIndex((o) => o.isCorrect))}
                onValueChange={(value) => setCorrectOption(Number(value))}
                className="flex flex-col gap-3"
              >
                {form.options.map((option, index) => (
                  <OptionRow
                    key={index}
                    correctControl={<RadioGroupItem value={String(index)} />}
                    action={
                      form.type !== "true_false" && form.options.length > 2 ? (
                        <RemoveOptionButton
                          onClick={() => removeOption(index)}
                        />
                      ) : undefined
                    }
                  >
                    <Input
                      value={option.text}
                      onChange={(e) =>
                        updateOption(index, { text: e.target.value })
                      }
                      placeholder={`Option ${index + 1}`}
                      readOnly={form.type === "true_false"}
                    />
                  </OptionRow>
                ))}
              </RadioGroup>
            ) : isChoiceType ? (
              form.options.map((option, index) => (
                <OptionRow
                  key={index}
                  correctControl={
                    <Checkbox
                      checked={option.isCorrect}
                      onCheckedChange={(checked) =>
                        updateOption(index, { isCorrect: checked === true })
                      }
                    />
                  }
                  action={
                    form.options.length > 2 ? (
                      <RemoveOptionButton onClick={() => removeOption(index)} />
                    ) : undefined
                  }
                >
                  <Input
                    value={option.text}
                    onChange={(e) =>
                      updateOption(index, { text: e.target.value })
                    }
                    placeholder={`Option ${index + 1}`}
                  />
                </OptionRow>
              ))
            ) : (
              form.options.map((option, index) => (
                <OptionRow
                  key={index}
                  action={
                    form.options.length > 1 ? (
                      <RemoveOptionButton onClick={() => removeOption(index)} />
                    ) : undefined
                  }
                >
                  <Input
                    value={option.text}
                    onChange={(e) =>
                      updateOption(index, { text: e.target.value })
                    }
                    placeholder={`Accepted answer ${index + 1}`}
                  />
                </OptionRow>
              ))
            )}

            {!isEssay &&
              !isNumeric &&
              !isCode &&
              form.type !== "true_false" &&
              form.options.length < 10 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={addOption}
                  className="border-dashed"
                >
                  <Plus className="size-4" />
                  {isChoiceType ? "Add Option" : "Add Accepted Answer"}
                </Button>
              )}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-6 lg:col-span-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Properties</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div>
              <Label htmlFor="type">Type</Label>
              <Select
                value={form.type}
                onValueChange={(v) => handleTypeChange(v as QuestionType)}
              >
                <SelectTrigger id="type" className="mt-1.5 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALL_QUESTION_TYPES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {QUESTION_TYPES[value].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="subject">Subject</Label>
              <Input
                id="subject"
                className="mt-1.5"
                value={form.subject}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, subject: e.target.value }))
                }
                placeholder="e.g. MySQL"
                aria-invalid={!!errors.subject}
              />
              {errors.subject && (
                <p className="text-destructive mt-1 text-sm">
                  {errors.subject}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="category">Category</Label>
              <Input
                id="category"
                className="mt-1.5"
                value={form.category}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, category: e.target.value }))
                }
                placeholder="e.g. Transactions"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="points">Points</Label>
                <Input
                  id="points"
                  type="number"
                  min={1}
                  className="mt-1.5"
                  value={form.points}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      points: Number(e.target.value) || 1,
                    }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="difficulty">Difficulty</Label>
                <Select
                  value={form.difficulty}
                  onValueChange={(v) =>
                    setForm((prev) => ({
                      ...prev,
                      difficulty: v as FormState["difficulty"],
                    }))
                  }
                >
                  <SelectTrigger id="difficulty" className="mt-1.5 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="easy">Easy</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="hard">Hard</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="tags">Tags</Label>
              <div className="border-input mt-1.5 flex flex-wrap items-center gap-1.5 rounded-md border px-2 py-1.5">
                {form.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="gap-1">
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      aria-label={`Remove tag ${tag}`}
                      className="hover:text-destructive"
                    >
                      <X className="size-3" />
                    </button>
                  </Badge>
                ))}
                <input
                  id="tags"
                  value={tagDraft}
                  onChange={(e) => setTagDraft(e.target.value)}
                  onKeyDown={handleTagKeyDown}
                  onBlur={addTag}
                  placeholder={
                    form.tags.length === 0 ? "Add a tag, press Enter" : ""
                  }
                  className="text-body-md min-w-24 flex-1 bg-transparent py-1 outline-none"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="explanation">Explanation (optional)</Label>
              <Textarea
                id="explanation"
                className="mt-1.5"
                value={form.explanation}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, explanation: e.target.value }))
                }
                placeholder="Shown to students after grading"
              />
            </div>
          </CardContent>
        </Card>

        {submitError && (
          <p role="alert" className="text-destructive text-sm">
            {submitError}
          </p>
        )}

        <Button type="submit" disabled={submitting} size="lg">
          {submitting
            ? "Saving…"
            : initialData
              ? "Save Changes"
              : "Create Question"}
        </Button>
      </div>
    </form>
  );
}

function OptionRow({
  correctControl,
  action,
  children,
}: {
  correctControl?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="border-outline-variant flex items-center gap-3 rounded-lg border p-3">
      {correctControl}
      <div className="flex-1">{children}</div>
      {action}
    </div>
  );
}

function RemoveOptionButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={onClick}
      aria-label="Remove option"
    >
      <Trash2 className="text-muted-foreground size-4" />
    </Button>
  );
}
