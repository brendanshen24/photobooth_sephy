import type { Card, Reader } from "nfc-pcsc";

import {
  completeChallengeTap,
  initDatabase,
  loadChallenge,
  normalizeDatabaseUrl,
  type ChallengeRow,
  type TapPayload,
} from "./challenge";
import { acrFeedback, readHackerTag, startNfc } from "./reader";

const COOLDOWN_MS = Number(process.env.TAP_COOLDOWN_MS ?? 2500);

type BadgeState = {
  readerName: string | null;
  challenge: ChallengeRow | null;
  configError: string | null;
  last: TapPayload | null;
  starting: Promise<void> | null;
};

type BadgeGlobal = typeof globalThis & { __photoboothBadge?: BadgeState };

function bag(): BadgeState {
  const g = globalThis as BadgeGlobal;
  if (!g.__photoboothBadge) {
    g.__photoboothBadge = {
      readerName: null,
      challenge: null,
      configError: null,
      last: null,
      starting: null,
    };
  }
  return g.__photoboothBadge;
}

export function badgeSnapshot() {
  const state = bag();
  return {
    health: {
      ok: true,
      reader: state.readerName,
      challengeId: state.challenge?.id ?? null,
      challengeTitle: state.challenge?.title ?? null,
      configError: state.configError,
    },
    last: state.last,
  };
}

async function prepareChallenge(state: BadgeState): Promise<void> {
  const databaseUrl = (
    process.env.DATABASE_URL ||
    process.env.EXPO_PUBLIC_DBURL ||
    ""
  ).trim();
  const challengeRaw = (process.env.CHALLENGE_ID ?? "").trim();

  if (!databaseUrl) {
    state.configError = "Set DATABASE_URL in .env.local";
    return;
  }
  if (!challengeRaw || !Number.isFinite(Number(challengeRaw))) {
    state.configError = "Set CHALLENGE_ID in .env.local";
    return;
  }

  try {
    initDatabase(normalizeDatabaseUrl(databaseUrl));
    const challenge = await loadChallenge(Number(challengeRaw));
    if (!challenge) {
      state.configError = `Challenge ${challengeRaw} was not found`;
      return;
    }
    state.challenge = challenge;
    state.configError = null;
    const points = challenge.lowestPoints;
    console.log(
      `[badge] Challenge #${challenge.id} "${challenge.title}" · +${points} ${points === 1 ? "point" : "points"}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    state.configError = "Could not reach the challenge database";
    console.error("[badge] database", message);
  }
}

export function startBadgeStation(): Promise<void> {
  const state = bag();
  if (state.starting) return state.starting;

  const recentTaps = new Map<string, number>();

  async function onTag(reader: Reader, card: Card): Promise<void> {
    const seenUid = (card.uid ?? "").replace(/[:\s.-]/g, "").toUpperCase();
    if (seenUid) {
      const last = recentTaps.get(seenUid) ?? 0;
      if (Date.now() - last < COOLDOWN_MS) return;
      recentTaps.set(seenUid, Date.now());
    }

    try {
      const read = await readHackerTag(reader, card);
      recentTaps.set(read.tagUid, Date.now());

      const result = state.challenge
        ? await completeChallengeTap({
            tagUid: read.tagUid,
            portalUserId: read.portalUserId,
            challenge: state.challenge,
          })
        : {
            v: 1 as const,
            type: "tap" as const,
            status: "no_event" as const,
            at: new Date().toISOString(),
            station: "photobooth" as const,
            tagUid: read.tagUid,
            portalUserId: read.portalUserId,
            user: null,
            challenge: null,
            pointsAwarded: null,
            message: state.configError,
          };

      state.last = result;
      const name = result.user
        ? `${result.user.firstName ?? ""} ${result.user.lastName ?? ""}`.trim()
        : result.tagUid;
      console.log(
        `[badge] ${result.status} · ${name}${result.message ? ` · ${result.message}` : ""}`
      );

      const ok =
        result.status === "checked_in" ||
        result.status === "already_checked_in";
      await acrFeedback(reader, ok);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[badge] tap failed", message);
      await acrFeedback(reader, false);
    }
  }

  state.starting = (async () => {
    await prepareChallenge(state);
    if (state.configError) console.log(`[badge] ${state.configError}`);
    try {
      startNfc({
        onReader: (name) => {
          state.readerName = name;
        },
        onTag,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[badge] NFC failed to start", message);
    }
  })();

  return state.starting;
}
