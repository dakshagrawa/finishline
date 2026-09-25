import type { Metadata } from "next";
import MvhsClubs from "../../mvhs/clubs";

export const metadata: Metadata = {
  title: "Clubs · Monta Vista student dashboard",
  description: "Current Monta Vista club resources without copied or stale Gunn data.",
};

export default function ClubsPage() {
  return <MvhsClubs />;
}
