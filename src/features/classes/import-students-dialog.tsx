"use client";

import { useRef, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { RosterMember } from "@/features/classes/class-roster";

interface ImportResult {
  roster: RosterMember[];
  totalRows: number;
  successCount: number;
  errorCount: number;
  errors: { row: number; message: string }[];
}

async function readErrorMessage(res: Response, fallback: string) {
  const body = (await res.json().catch(() => null)) as {
    error?: { message?: string };
  } | null;
  return body?.error?.message ?? fallback;
}

export function ImportStudentsDialog({
  classId,
  open,
  onOpenChange,
  onImported,
}: {
  classId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: (roster: RosterMember[]) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setFileName(null);
    setResult(null);
    setError(null);
    setSubmitting(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setError(null);
    setResult(null);
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/classes/${classId}/students/import`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        setError(await readErrorMessage(res, "Failed to import students."));
        return;
      }
      const data = (await res.json()) as ImportResult;
      setResult(data);
      onImported(data.roster);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import students from Excel</DialogTitle>
          <DialogDescription>
            Upload a .xlsx or .csv file with columns Name, Email, Password, and
            Gender (male, female, or other). Each row creates an account and
            enrolls it in this class. Avoid all-numeric passwords (e.g.
            &quot;00012345&quot;) — spreadsheet apps often strip leading zeros
            before you upload, so the student&apos;s real password ends up
            shorter than what you see in the cell.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="import-file">File</Label>
            <Input
              ref={fileInputRef}
              id="import-file"
              type="file"
              accept=".csv,.xlsx"
              onChange={handleFileChange}
              disabled={submitting}
            />
          </div>

          {submitting && (
            <p className="text-muted-foreground text-sm">
              Importing {fileName}…
            </p>
          )}

          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}

          {result && (
            <div className="border-border flex flex-col gap-2 rounded-lg border p-3">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                {result.errorCount === 0 ? (
                  <CheckCircle2 className="text-success size-4 shrink-0" />
                ) : (
                  <XCircle className="text-warning size-4 shrink-0" />
                )}
                {result.successCount} of {result.totalRows} students created
              </p>
              {result.errors.length > 0 && (
                <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto text-xs">
                  {result.errors.map((rowError) => (
                    <li key={rowError.row} className="text-destructive">
                      Row {rowError.row}: {rowError.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
