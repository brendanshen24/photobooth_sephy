/** Tap payload from the photobooth badge server. */
export type NfcTap = {
  type?: string;
  status?: string;
  at?: string;
  message?: string | null;
  pointsAwarded?: number | null;
  user?: {
    firstName?: string | null;
    lastName?: string | null;
    displayId?: string | null;
  } | null;
  challenge?: {
    id?: number;
    title?: string | null;
  } | null;
};

export type NfcHealth = {
  ok?: boolean;
  challengeId?: number | null;
  challengeTitle?: string | null;
  reader?: string | null;
  configError?: string | null;
};

export type TapPopup =
  | { kind: "first"; id: string; name: string | null; points: number }
  | { kind: "repeat"; id: string; name: string | null }
  | { kind: "notice"; id: string; message: string };

export function hackerName(
  user: NfcTap["user"] | null | undefined
): string | null {
  if (!user) return null;
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return name || user.displayId || null;
}

/**
 * First completion writes challenge_completions and comes back as checked_in.
 * A second tap is already_checked_in. Older station builds report that as a
 * "maximum number of completions" rejection — treat that the same way.
 */
export function classifyTap(tap: NfcTap | null | undefined): TapPopup | null {
  if (!tap || tap.type !== "tap" || !tap.at) return null;

  const id = tap.at;
  const name = hackerName(tap.user);
  const message = tap.message ?? "";

  if (tap.status === "checked_in") {
    const points = tap.pointsAwarded ?? 0;
    return { kind: "first", id, name, points };
  }

  if (
    tap.status === "already_checked_in" ||
    (tap.status === "rejected" &&
      /maximum number of completions|already completed|already checked/i.test(
        message
      ))
  ) {
    return { kind: "repeat", id, name };
  }

  if (tap.status === "unknown_tag") {
    return {
      kind: "notice",
      id,
      message: "This badge isn't linked to a hacker yet.",
    };
  }

  if (tap.status === "rejected" && /not accepted/i.test(message)) {
    return {
      kind: "notice",
      id,
      message: "This badge isn't accepted for the hackathon.",
    };
  }

  if (tap.status === "no_event") {
    return {
      kind: "notice",
      id,
      message: "Set CHALLENGE_ID in .env.local so this booth counts.",
    };
  }

  if (tap.status === "rejected" || tap.status === "error") {
    return {
      kind: "notice",
      id,
      message: message || "Couldn't complete this challenge.",
    };
  }

  return null;
}
