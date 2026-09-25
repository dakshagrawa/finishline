import type { Metadata } from "next";
import ProjectWorkspace from "../../components/project-workspace";
import AppShell from "../../mvhs/app-shell";

export const metadata: Metadata = {
  title: "Projects · Monta Vista student dashboard",
  description: "A private local project coach for turning an idea into a practical finish line.",
};

export default function ProjectsPage() {
  return (
    <AppShell active="projects">
      <div className="mvhs-project-module">
        <ProjectWorkspace />
      </div>
    </AppShell>
  );
}
