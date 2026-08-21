"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface HealthReport {
  status: "healthy" | "degraded";
  database: "connected" | "error";
  redis: "connected" | "error";
  timestamp: string;
}

type ServiceState = "pending" | "connected" | "error";

function StatusBadge({ label, state }: { label: string; state: ServiceState }) {
  const styles: Record<ServiceState, string> = {
    pending: "border-border bg-muted text-muted-foreground",
    connected: "border-success/30 bg-success/10 text-success",
    error: "border-destructive/30 bg-destructive/10 text-destructive",
  };
  const dot: Record<ServiceState, string> = {
    pending: "bg-muted-foreground",
    connected: "bg-success",
    error: "bg-destructive",
  };
  const text: Record<ServiceState, string> = {
    pending: "Checking…",
    connected: "Connected",
    error: "Error",
  };

  return (
    <Badge variant="outline" className={styles[state]}>
      <span
        className={`mr-1.5 inline-block size-1.5 rounded-full ${dot[state]}`}
      />
      {label}: {text[state]}
    </Badge>
  );
}

export function HealthStatusPanel() {
  const [report, setReport] = useState<HealthReport | null>(null);
  const [appReachable, setAppReachable] = useState<ServiceState>("pending");

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch("/api/health", { cache: "no-store" });
        const data = (await res.json()) as HealthReport;
        if (cancelled) return;
        setReport(data);
        setAppReachable("connected");
      } catch {
        if (!cancelled) setAppReachable("error");
      }
    }

    poll();
    const interval = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Platform status</CardTitle>
        <CardDescription>
          Live check of the application, database, and cache
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <StatusBadge label="App" state={appReachable} />
        <StatusBadge
          label="PostgreSQL"
          state={report ? report.database : "pending"}
        />
        <StatusBadge label="Redis" state={report ? report.redis : "pending"} />
      </CardContent>
    </Card>
  );
}
