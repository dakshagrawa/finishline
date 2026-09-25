import type { Metadata } from "next";
import MvhsSettings from "../../mvhs/settings";

export const metadata: Metadata = {
  title: "Settings & privacy · Monta Vista student dashboard",
  description: "Data provenance and local-first privacy details for the unofficial dashboard.",
};

export default function SettingsPage() {
  return <MvhsSettings />;
}
