import type { Metadata } from "next";
import MvhsTools from "../../mvhs/tools";

export const metadata: Metadata = {
  title: "Tools · Monta Vista student dashboard",
  description: "Private browser-only student utilities and verified MVHS links.",
};

export default function ToolsPage() {
  return <MvhsTools />;
}
