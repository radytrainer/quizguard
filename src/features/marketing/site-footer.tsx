import Link from "next/link";
import { Globe, Mail, ShieldCheck } from "lucide-react";

// Every link defaults to "#" (placeholder — these pages don't exist yet) except Pricing,
// which now points at the real /pricing page (site-header.tsx's nav link does the same).
const footerColumns = [
  {
    heading: "Product",
    links: [
      { label: "Features", href: "#" },
      { label: "Security", href: "#" },
      { label: "Pricing", href: "/pricing" },
      { label: "Changelog", href: "#" },
    ],
  },
  {
    heading: "Resources",
    links: [
      { label: "Documentation", href: "#" },
      { label: "Help Center", href: "#" },
      { label: "API Reference", href: "#" },
      { label: "Community", href: "#" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Privacy Policy", href: "#" },
      { label: "Terms of Service", href: "#" },
      { label: "Cookie Policy", href: "#" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-border border-t">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-1">
            <div className="flex items-center gap-2">
              <ShieldCheck className="text-primary size-5" />
              <span className="font-bold tracking-tight">QuizGuard</span>
            </div>
            <p className="text-muted-foreground mt-3 max-w-xs text-sm">
              Secure, reliable, and intelligent assessment infrastructure for
              modern educators.
            </p>
          </div>

          {footerColumns.map((column) => (
            <div key={column.heading}>
              <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                {column.heading}
              </p>
              <ul className="mt-3 flex flex-col gap-2.5">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="hover:text-foreground text-sm transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-border mt-10 flex flex-col-reverse items-center justify-between gap-4 border-t pt-6 sm:flex-row">
          <p className="text-muted-foreground text-xs">
            © {new Date().getFullYear()} QuizGuard Technologies Inc. All rights
            reserved.
          </p>
          <div className="text-muted-foreground flex items-center gap-3">
            <Globe className="size-4" />
            <Mail className="size-4" />
          </div>
        </div>
      </div>
    </footer>
  );
}
