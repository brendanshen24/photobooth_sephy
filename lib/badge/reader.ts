import { NFC, type Card, type Reader } from "nfc-pcsc";

import { parseNdefTlv, portalIdFromUserMemory } from "./ndef";

const log = (...args: unknown[]) => console.log("[badge]", ...args);

function isPiccReader(name: string): boolean {
  if (/SAM/i.test(name) && !/PICC/i.test(name)) return false;
  return true;
}

/** Type-2 READ (0x30) via ACR122U Direct Transmit + PN532 InCommunicateThru. */
async function type2ReadPages(reader: Reader, page: number): Promise<Buffer> {
  const cmd = Buffer.from([
    0xff, 0x00, 0x00, 0x00, 0x05, 0xd4, 0x42, 0x30, page,
  ]);
  const response = await reader.transmit(cmd, 32);
  if (response.length < 5 || response[2] !== 0x00) {
    throw new Error(`Type-2 READ page ${page} failed`);
  }
  const data = response.subarray(3, response.length >= 21 ? 19 : -2);
  return Buffer.from(data.subarray(0, 16));
}

async function readUserMemory(reader: Reader): Promise<Buffer> {
  try {
    return await reader.read(4, 48, 4, 16);
  } catch (err) {
    log("PC/SC READ BINARY failed, trying Type-2 0x30", err);
  }

  const chunks: Buffer[] = [];
  let page = 4;
  const maxBytes = 144;

  while (chunks.reduce((n, c) => n + c.length, 0) < maxBytes) {
    const chunk = await type2ReadPages(reader, page);
    if (chunk.length === 0) break;
    chunks.push(chunk);
    const memory = Buffer.concat(chunks);
    const parsed = parseNdefTlv(memory);
    if (parsed.status === "found" || parsed.status === "none") {
      return memory;
    }
    page += 4;
  }

  return Buffer.concat(chunks);
}

export type ReadTagResult = {
  tagUid: string;
  portalUserId: number | null;
};

export async function readHackerTag(
  reader: Reader,
  card: Card
): Promise<ReadTagResult> {
  const tagUid = (card.uid ?? "").replace(/[:\s.-]/g, "").toUpperCase();
  if (!tagUid) {
    throw new Error("Could not read NFC tag UID");
  }

  let portalUserId: number | null = null;
  try {
    const memory = await readUserMemory(reader);
    portalUserId = portalIdFromUserMemory(memory);
  } catch (err) {
    log("NDEF read failed; will fall back to nfc_cards", err);
  }

  return { tagUid, portalUserId };
}

/** Green blink on success, red on failure. Best-effort. */
export async function acrFeedback(reader: Reader, ok: boolean): Promise<void> {
  try {
    if (typeof reader.led === "function") {
      if (ok) {
        await reader.led(0b00101110, [0x01, 0x00, 0x01, 0x01]);
      } else {
        await reader.led(0b01011101, [0x02, 0x01, 0x05, 0x01]);
      }
      return;
    }
    const p2 = ok ? 0xa0 : 0x50;
    const cmd = Buffer.from([
      0xff, 0x00, 0x40, p2, 0x04, 0x01, 0x00, 0x01, 0x01,
    ]);
    await reader.transmit(cmd, 2);
  } catch {
    // ignore — not every firmware accepts this while a card is present
  }
}

export type NfcHandlers = {
  onReader: (name: string | null) => void;
  onTag: (reader: Reader, card: Card) => Promise<void>;
};

export function startNfc(handlers: NfcHandlers): void {
  const nfc = new NFC();

  nfc.on("reader", (reader: Reader) => {
    if (!isPiccReader(reader.name)) {
      log("Ignoring non-PICC interface", reader.name);
      reader.close();
      return;
    }

    log("Reader attached", reader.name);
    handlers.onReader(reader.name);

    reader.on("card", (card: Card) => {
      void handlers.onTag(reader, card).catch((err: unknown) => {
        console.error("[badge] Tag handler failed", err);
      });
    });

    reader.on("error", (err: Error) => {
      console.error("[badge]", reader.name, err.message);
    });

    reader.on("end", () => {
      log("Reader removed", reader.name);
      handlers.onReader(null);
    });
  });

  nfc.on("error", (err: Error) => {
    console.error("[badge] PC/SC error", err.message);
  });
}
