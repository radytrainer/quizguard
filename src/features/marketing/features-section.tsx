import {
  BarChart3,
  FileText,
  Maximize2,
  Radar,
  Shuffle,
  Timer,
} from "lucide-react";

import { cn } from "@/lib/utils";

const features = [
  {
    title: "Create Quizzes",
    description:
      "Intuitive builder for multiple choice, short answer, and complex multipart questions with rich text support.",
    icon: FileText,
    tone: "primary",
  },
  {
    title: "Randomize Questions",
    description:
      "Automatically generate unique exam variations for every student to deter collaboration and ensure fairness.",
    icon: Shuffle,
    tone: "primary",
  },
  {
    title: "Timed Exams",
    description:
      "Enforce strict time limits with a highly visible, stable countdown timer that auto-submits upon completion.",
    icon: Timer,
    tone: "primary",
  },
  {
    title: "Fullscreen Mode",
    description:
      "Lock down the testing environment. Require fullscreen presentation to minimize digital distractions during assessments.",
    icon: Maximize2,
    tone: "primary",
  },
  {
    title: "Exam Activity Monitoring",
    description:
      "Advanced proctoring detects tab switching, loss of focus, and suspicious behavior, logging incidents in real-time.",
    icon: Radar,
    tone: "destructive",
  },
  {
    title: "Results & Analytics",
    description:
      "Comprehensive reporting dashboards that provide deep insights into class performance and question difficulty.",
    icon: BarChart3,
    tone: "primary",
  },
] as const;

export function FeaturesSection() {
  return (
    <section id="features" className="py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Engineered for Academic Integrity
          </h2>
          <p className="text-muted-foreground mt-3 text-base">
            Everything you need to conduct secure, reliable assessments at
            scale.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="border-border bg-card rounded-2xl border p-6"
            >
              <div
                className={cn(
                  "mb-4 flex size-10 items-center justify-center rounded-lg",
                  feature.tone === "destructive"
                    ? "bg-destructive/10 text-destructive"
                    : "bg-primary/10 text-primary",
                )}
              >
                <feature.icon className="size-5" />
              </div>
              <h3 className="font-semibold">{feature.title}</h3>
              <p className="text-muted-foreground mt-1.5 text-sm">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
