import type { Metadata } from "next";

import { MatchingForm } from "../../../components/dashboard/matching-form";

export const metadata: Metadata = { title: "Matching" };

export default function MatchingPage() {
  return (
    <>
      <h1>Matching</h1>
      <p className="dashboard-lead">
        Colle ton CV : l’agent le structure (DeepSeek) puis le score contre les offres publiées, du
        plus au moins compatible.
      </p>
      <MatchingForm />
    </>
  );
}
