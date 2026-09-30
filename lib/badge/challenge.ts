import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

export type ChallengeRow = {
  id: number;
  hackathonId: number;
  title: string;
  lowestPoints: number;
  highestPoints: number;
  variablePoints: boolean;
  maxCompletions: number;
};

export type HackerUser = {
  id: number;
  firstName: string | null;
  lastName: string | null;
  displayId: string;
};

export type TapStatus =
  | "checked_in"
  | "already_checked_in"
  | "unknown_tag"
  | "rejected"
  | "no_event"
  | "error";

export type TapPayload = {
  v: 1;
  type: "tap";
  status: TapStatus;
  at: string;
  station: "photobooth";
  tagUid: string | null;
  portalUserId: number | null;
  user: HackerUser | null;
  challenge: { id: number; title: string } | null;
  pointsAwarded: number | null;
  message: string | null;
};

type Sql = NeonQueryFunction<false, false>;

type SqlGlobal = typeof globalThis & { __photoboothBadgeSql?: Sql };

function db(): Sql {
  const sql = (globalThis as SqlGlobal).__photoboothBadgeSql;
  if (!sql) throw new Error("Database not initialized");
  return sql;
}

export function normalizeDatabaseUrl(raw: string): string {
  return raw
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .replace(/([?&])channel_binding=[^&]*/gi, "$1")
    .replace(/\?&/g, "?")
    .replace(/[?&]$/g, "");
}

export function initDatabase(rawUrl: string): void {
  (globalThis as SqlGlobal).__photoboothBadgeSql = neon(
    normalizeDatabaseUrl(rawUrl)
  );
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime())
    ? new Date().toISOString()
    : parsed.toISOString();
}

export async function loadChallenge(
  challengeId: number
): Promise<ChallengeRow | null> {
  const rows = await db()`
    SELECT id, hackathon_id, title, lowest_points, highest_points,
           variable_points, max_completions
    FROM challenges
    WHERE id = ${challengeId}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    id: num(row.id),
    hackathonId: num(row.hackathon_id),
    title: String(row.title ?? ""),
    lowestPoints: num(row.lowest_points),
    highestPoints: num(row.highest_points),
    variablePoints: Boolean(row.variable_points),
    maxCompletions: num(row.max_completions),
  };
}

async function userById(userId: number): Promise<HackerUser | null> {
  const rows = await db()`
    SELECT id, first_name, last_name, display_id
    FROM "user"
    WHERE id = ${userId}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    id: num(row.id),
    firstName: row.first_name == null ? null : String(row.first_name),
    lastName: row.last_name == null ? null : String(row.last_name),
    displayId: String(row.display_id ?? ""),
  };
}

async function userIdForTag(
  tagUid: string,
  hackathonId: number
): Promise<number | null> {
  const rows = await db()`
    SELECT user_id
    FROM nfc_cards
    WHERE tag_uid = ${tagUid} AND hackathon_id = ${hackathonId}
    LIMIT 1
  `;
  const row = rows[0];
  return row ? num(row.user_id) : null;
}

async function isAccepted(
  userId: number,
  hackathonId: number
): Promise<boolean> {
  const rows = await db()`
    SELECT current_status
    FROM applications
    WHERE hackathon_id = ${hackathonId} AND user_id = ${userId}
    LIMIT 1
  `;
  return String(rows[0]?.current_status ?? "").trim() === "Accepted";
}

async function existingCompletion(
  userId: number,
  challengeId: number
): Promise<{ pointsAwarded: number; completedAt: string } | null> {
  const rows = await db()`
    SELECT points_awarded, completed_at
    FROM challenge_completions
    WHERE user_id = ${userId} AND challenge_id = ${challengeId}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    pointsAwarded: num(row.points_awarded),
    completedAt: iso(row.completed_at),
  };
}

function tap(partial: Omit<TapPayload, "v" | "type" | "at" | "station">): TapPayload {
  return {
    v: 1,
    type: "tap",
    at: new Date().toISOString(),
    station: "photobooth",
    ...partial,
  };
}

export async function completeChallengeTap(input: {
  tagUid: string;
  portalUserId: number | null;
  challenge: ChallengeRow;
}): Promise<TapPayload> {
  const challenge = {
    id: input.challenge.id,
    title: input.challenge.title,
  };
  const base = {
    tagUid: input.tagUid,
    portalUserId: input.portalUserId,
    user: null as HackerUser | null,
    challenge,
    pointsAwarded: null as number | null,
  };

  let userId = input.portalUserId;
  if (userId == null) {
    userId = await userIdForTag(input.tagUid, input.challenge.hackathonId);
  }
  if (userId == null) {
    return tap({
      ...base,
      status: "unknown_tag",
      message: "Card is not linked to a hacker. Run Event check-in / flash first.",
    });
  }

  const user = await userById(userId);
  if (!user) {
    return tap({
      ...base,
      portalUserId: userId,
      status: "unknown_tag",
      message: `No portal user for id ${userId}`,
    });
  }

  base.user = user;
  base.portalUserId = user.id;

  if (!(await isAccepted(user.id, input.challenge.hackathonId))) {
    return tap({
      ...base,
      status: "rejected",
      message: "USER NOT ACCEPTED",
    });
  }

  if (input.challenge.maxCompletions <= 0) {
    return tap({
      ...base,
      status: "rejected",
      message: `This challenge has reached the maximum number of completions (${input.challenge.maxCompletions})`,
    });
  }

  const existing = await existingCompletion(user.id, input.challenge.id);
  if (existing) {
    return tap({
      ...base,
      status: "already_checked_in",
      pointsAwarded: 0,
      message: "Already completed this challenge",
    });
  }

  const points = input.challenge.lowestPoints;
  try {
    await db()`
      INSERT INTO challenge_completions
        (challenge_id, user_id, points_awarded, completed_at)
      VALUES
        (${input.challenge.id}, ${user.id}, ${points}, NOW())
    `;
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code?: unknown }).code ?? "")
        : "";
    const message = err instanceof Error ? err.message : String(err);
    if (code === "23505" || /duplicate|23505|unique/i.test(message)) {
      return tap({
        ...base,
        status: "already_checked_in",
        pointsAwarded: 0,
        message: "Already completed this challenge",
      });
    }
    throw err;
  }

  return tap({
    ...base,
    status: "checked_in",
    pointsAwarded: points,
    message: `Challenge completed · +${points} ${points === 1 ? "point" : "points"}`,
  });
}
