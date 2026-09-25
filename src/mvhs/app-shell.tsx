import type { ReactNode } from "react";
import Link from "next/link";

export type DashboardRoute = "home" | "grades" | "clubs" | "tools" | "projects" | "settings";

const routes: Array<{ id: DashboardRoute; label: string; href: string; glyph: string }> = [
  { id: "home", label: "Home", href: "/", glyph: "⌂" },
  { id: "grades", label: "Grade Lab", href: "/grades", glyph: "▤" },
  { id: "clubs", label: "Clubs", href: "/clubs", glyph: "◇" },
  { id: "tools", label: "Tools", href: "/tools", glyph: "＋" },
  { id: "projects", label: "Projects", href: "/projects", glyph: "✓" },
  { id: "settings", label: "Settings", href: "/settings", glyph: "⚙" },
];

export default function AppShell({
  active,
  children,
}: {
  active: DashboardRoute;
  children: ReactNode;
}) {
  return (
    <div className="mvhs-app-shell">
      <aside className="mvhs-sidebar">
        <Link className="mvhs-brand" href="/" aria-label="Finishline home">
          <span className="mvhs-wordmark">Finishline</span>
          <span className="mvhs-unofficial-badge">Unofficial student tool</span>
        </Link>
        <nav className="mvhs-main-nav" aria-label="Main navigation">
          {routes.map((route) => (
            <Link
              href={route.href}
              key={route.id}
              aria-current={route.id === active ? "page" : undefined}
            >
              <span aria-hidden="true">{route.glyph}</span>
              {route.label}
            </Link>
          ))}
        </nav>
        <p className="mvhs-unofficial">Unofficial student dashboard<br />Private by default · local-first · not affiliated with FUHSD</p>
      </aside>
      <main className="mvhs-main">
        <p className="mvhs-mobile-unofficial">Unofficial student tool · not affiliated with FUHSD</p>
        {children}
      </main>
    </div>
  );
}
