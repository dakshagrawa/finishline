import type { Metadata } from "next";
import GradeCalculator from "../../grades/grade-calculator";
import AppShell from "../../mvhs/app-shell";

export const metadata: Metadata = {
  title: "Grade Lab · Monta Vista student dashboard",
  description: "A private local what-if grade calculator for validated JSON gradebooks.",
};

export default function GradesPage() {
  return (
    <AppShell active="grades">
      <div className="grades-shell">
        <GradeCalculator />
      </div>
    </AppShell>
  );
}
