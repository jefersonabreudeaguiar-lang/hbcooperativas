"use client";

import { Star } from "lucide-react";
import { useAuth } from "@/modules/auth/AuthProvider";
import { cooperadoMobilePilotShowHeaderStar } from "@/lib/cooperado/cooperadoMobilePilotIndicator";
import { isCooperadoAppUser } from "@/permissions";

/** Estrela amarela — piloto Jeferson com atualização ainda não promovida ao GA. */
export function CooperadoMobilePilotStarBadge() {
  const { user } = useAuth();
  if (!user || !isCooperadoAppUser(user)) return null;
  if (!cooperadoMobilePilotShowHeaderStar(user)) return null;

  return (
    <span
      className="inline-flex shrink-0 items-center justify-center"
      title="Versão em teste no piloto — após aprovação, todos recebem a mesma atualização"
      aria-label="Atualização em teste no piloto"
    >
      <Star
        size={14}
        className="text-amber-400 fill-amber-400 drop-shadow-sm"
        strokeWidth={1.5}
        aria-hidden
      />
    </span>
  );
}
