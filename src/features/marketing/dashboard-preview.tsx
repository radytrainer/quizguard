import {
  Bell,
  Calendar,
  ChevronRight,
  ClipboardList,
  Eye,
  Flag,
  LayoutDashboard,
  Search,
  Settings,
  ShieldCheck,
  TrendingUp,
  Users,
} from "lucide-react";

import { cn } from "@/lib/utils";

const sidebarNav = [
  { label: "Dashboard", icon: LayoutDashboard, active: true },
  { label: "My Quizzes", icon: ClipboardList },
  { label: "Students", icon: Users },
  { label: "Exam Monitoring", icon: Eye, live: true },
  { label: "Reports", icon: TrendingUp },
  { label: "Calendar", icon: Calendar },
  { label: "Settings", icon: Settings },
];

const statCards = [
  { label: "Active Exams", value: "4", icon: ClipboardList, tone: "primary" },
  { label: "Students Online", value: "128", icon: Users, tone: "primary" },
  { label: "Flagged Alerts", value: "2", icon: Flag, tone: "destructive" },
  { label: "Average Score", value: "86%", icon: TrendingUp, tone: "success" },
] as const;

const monitoredExams = [
  { name: "History 101", students: 35, progress: 68, status: "alert" },
  { name: "Biology 202", students: 28, progress: 24, status: "live" },
  { name: "Algebra Final", students: 62, progress: 49, status: "paused" },
  { name: "English Lit", students: 45, progress: 66, status: "live" },
] as const;

const recentAlerts = [
  { name: "Alex P.", issue: "Tab Switch" },
  { name: "Maria G.", issue: "Off-Screen" },
];

const performanceBars = [62, 74, 58, 81, 69, 88];

const toneStyles = {
  primary: "bg-primary/10 text-primary",
  destructive: "bg-destructive/10 text-destructive",
  success: "bg-success/10 text-success",
} as const;

const statusStyles = {
  live: "bg-success/10 text-success",
  paused: "bg-warning/10 text-warning",
  alert: "bg-destructive/10 text-destructive",
} as const;

const statusLabel = {
  live: "Live",
  paused: "Paused",
  alert: "1 Tab-Switch",
} as const;

export function DashboardPreview() {
  return (
    <div className="border-border bg-card relative mx-auto max-h-[560px] max-w-5xl overflow-hidden rounded-2xl border shadow-2xl">
      <div className="flex">
        {/* Mini sidebar */}
        <aside className="hidden w-[190px] shrink-0 flex-col gap-6 bg-[#131628] p-4 text-[#e5e7fb] sm:flex">
          <div className="flex items-center gap-2 px-1">
            <ShieldCheck className="size-5 text-[#c3c0ff]" />
            <span className="text-sm font-bold tracking-tight">QuizGuard</span>
          </div>
          <nav className="flex flex-col gap-1">
            {sidebarNav.map((item) => (
              <div
                key={item.label}
                className={cn(
                  "flex items-center justify-between rounded-lg px-2.5 py-2 text-[11px] font-medium",
                  item.active
                    ? "bg-[#c3c0ff]/15 text-[#c3c0ff]"
                    : "text-[#9b9ab3]",
                )}
              >
                <span className="flex items-center gap-2">
                  <item.icon className="size-3.5" />
                  {item.label}
                </span>
                {item.live && (
                  <span className="bg-success inline-block size-1.5 rounded-full" />
                )}
              </div>
            ))}
          </nav>
          <div className="mt-auto flex items-center gap-2 border-t border-white/10 px-1 pt-4">
            <div className="flex size-7 items-center justify-center rounded-full bg-[#c3c0ff]/20 text-[10px] font-semibold text-[#c3c0ff]">
              ER
            </div>
            <div className="leading-tight">
              <p className="text-[11px] font-medium">Ms. Elena Rodriguez</p>
              <p className="text-[10px] text-[#9b9ab3]">Teacher</p>
            </div>
          </div>
        </aside>

        {/* Main preview content */}
        <div className="min-w-0 flex-1 bg-[#faf8ff] p-5">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <p className="text-muted-foreground text-[11px] tracking-wide uppercase">
                Teacher Dashboard
              </p>
              <p className="text-base font-bold">Welcome Back, Elena!</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="border-border bg-card hidden items-center gap-1.5 rounded-full border px-3 py-1.5 sm:flex">
                <Search className="text-muted-foreground size-3.5" />
                <span className="text-muted-foreground text-[11px]">
                  Search
                </span>
              </div>
              <div className="border-border bg-card relative flex size-7 items-center justify-center rounded-full border">
                <Bell className="text-muted-foreground size-3.5" />
                <span className="bg-destructive absolute top-1 right-1 size-1.5 rounded-full" />
              </div>
            </div>
          </div>

          <p className="mb-3 text-sm font-bold">
            QuizGuard: Active Monitoring &amp; Performance
          </p>

          <div className="mb-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            {statCards.map((stat) => (
              <div
                key={stat.label}
                className="border-border bg-card rounded-xl border p-3"
              >
                <div
                  className={cn(
                    "mb-2 flex size-6 items-center justify-center rounded-md",
                    toneStyles[stat.tone],
                  )}
                >
                  <stat.icon className="size-3.5" />
                </div>
                <p className="text-sm font-bold">{stat.value}</p>
                <p className="text-muted-foreground text-[10px]">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
            <div className="border-border bg-card rounded-xl border p-3.5 lg:col-span-3">
              <div className="mb-2.5 flex items-center justify-between">
                <p className="text-xs font-bold">Active Exam Monitoring</p>
                <span className="text-primary text-[10px] font-medium">
                  View All
                </span>
              </div>
              <div className="flex flex-col gap-2.5">
                {monitoredExams.map((exam) => (
                  <div key={exam.name} className="flex items-center gap-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <p className="truncate text-[11px] font-medium">
                          {exam.name}
                        </p>
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium",
                            statusStyles[exam.status],
                          )}
                        >
                          {statusLabel[exam.status]}
                        </span>
                      </div>
                      <div className="bg-muted h-1 overflow-hidden rounded-full">
                        <div
                          className={cn(
                            "h-full rounded-full",
                            exam.status === "alert"
                              ? "bg-destructive"
                              : exam.status === "paused"
                                ? "bg-warning"
                                : "bg-success",
                          )}
                          style={{ width: `${exam.progress}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-3 lg:col-span-2">
              <div className="border-border bg-card rounded-xl border p-3.5">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-bold">Recent Alerts</p>
                  <span className="text-primary text-[10px] font-medium">
                    View All
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  {recentAlerts.map((alert) => (
                    <div
                      key={alert.name}
                      className="flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2">
                        <div className="bg-muted flex size-6 items-center justify-center rounded-full text-[9px] font-semibold">
                          {alert.name.charAt(0)}
                        </div>
                        <div>
                          <p className="text-[11px] font-medium">
                            {alert.name}
                          </p>
                          <p className="text-muted-foreground text-[10px]">
                            {alert.issue}
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="text-muted-foreground size-3.5" />
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-border bg-card rounded-xl border p-3.5">
                <p className="text-xs font-bold">
                  Student Performance Overview
                </p>
                <p className="text-muted-foreground mb-2 text-[10px]">
                  Average score in recent quizzes
                </p>
                <div className="flex h-16 items-end gap-1.5">
                  {performanceBars.map((height, i) => (
                    <div
                      key={i}
                      className="bg-primary/70 flex-1 rounded-t-sm"
                      style={{ height: `${height}%` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-3">
            <p className="text-xs font-bold">Class Activity Log</p>
            <p className="text-muted-foreground text-[10px]">
              Real-time feed of submissions and grading events
            </p>
          </div>
        </div>
      </div>

      {/* Fades the cropped bottom edge instead of hard-cutting the activity log */}
      <div className="from-card pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t to-transparent" />
    </div>
  );
}
