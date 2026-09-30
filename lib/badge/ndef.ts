/** Compact custom MIME written by the Expo badge provisioner. */
const PORTAL_ID_MIME = "sfusurge/pid";
const PORTAL_ID_MIME_LEGACY = "application/vnd.sfusurge.portalid";
const PORTAL_ID_MIME_BRIEF = "sfu/pid";

const MIME_TYPES = new Set([
  PORTAL_ID_MIME,
  PORTAL_ID_MIME_LEGACY,
  PORTAL_ID_MIME_BRIEF,
]);

type TlvParse =
  | { status: "found"; bytes: Uint8Array }
  | { status: "need"; total: number }
  | { status: "none" };

export function parseNdefTlv(userMemory: Uint8Array): TlvParse {
  let i = 0;
  while (i < userMemory.length) {
    const type = userMemory[i];
    if (type === 0x00) {
      i += 1;
      continue;
    }
    if (type === 0xfe) {
      return { status: "none" };
    }
    if (i + 1 >= userMemory.length) {
      return { status: "need", total: i + 2 };
    }

    let len: number;
    let header: number;
    if (userMemory[i + 1] === 0xff) {
      if (i + 3 >= userMemory.length) {
        return { status: "need", total: i + 4 };
      }
      len = (userMemory[i + 2] << 8) | userMemory[i + 3];
      header = 4;
    } else {
      len = userMemory[i + 1];
      header = 2;
    }

    const end = i + header + len;
    if (type === 0x03) {
      if (end > userMemory.length) {
        return { status: "need", total: end };
      }
      return { status: "found", bytes: userMemory.subarray(i + header, end) };
    }
    if (end > userMemory.length) {
      return { status: "need", total: end };
    }
    i = end;
  }
  return { status: "need", total: userMemory.length + 16 };
}

type NdefRecord = {
  tnf: number;
  type: string;
  payload: Uint8Array;
};

export function parseNdefRecords(bytes: Uint8Array): NdefRecord[] {
  const records: NdefRecord[] = [];
  let i = 0;
  const decoder = new TextDecoder();

  while (i < bytes.length) {
    const header = bytes[i++];
    const me = (header & 0x40) !== 0;
    const cf = (header & 0x20) !== 0;
    const sr = (header & 0x10) !== 0;
    const il = (header & 0x08) !== 0;
    const tnf = header & 0x07;

    if (cf || i >= bytes.length) break;

    const typeLen = bytes[i++];
    let payloadLen: number;
    if (sr) {
      if (i >= bytes.length) break;
      payloadLen = bytes[i++];
    } else {
      if (i + 4 > bytes.length) break;
      payloadLen =
        ((bytes[i] << 24) |
          (bytes[i + 1] << 16) |
          (bytes[i + 2] << 8) |
          bytes[i + 3]) >>>
        0;
      i += 4;
    }

    const idLen = il ? bytes[i++] : 0;
    if (i + typeLen + idLen + payloadLen > bytes.length) break;

    const type = decoder.decode(bytes.subarray(i, i + typeLen));
    i += typeLen + idLen;
    const payload = bytes.subarray(i, i + payloadLen);
    i += payloadLen;

    records.push({ tnf, type, payload });
    if (me) break;
  }

  return records;
}

function parsePositiveId(text: string): number | null {
  const id = Number(String(text).trim());
  if (Number.isFinite(id) && id > 0) return id;
  return null;
}

function decodeTextPayload(payload: Uint8Array): string {
  if (payload.length === 0) return "";
  const status = payload[0];
  const langLen = status & 0x3f;
  return new TextDecoder().decode(payload.subarray(1 + langLen));
}

function decodeUriPayload(payload: Uint8Array): string {
  if (payload.length === 0) return "";
  const prefixes = [
    "",
    "http://www.",
    "https://www.",
    "http://",
    "https://",
    "tel:",
    "mailto:",
    "ftp://anonymous:anonymous@",
    "ftp://ftp.",
    "ftps://",
    "sftp://",
    "smb://",
    "nfs://",
    "ftp://",
    "dav://",
    "news:",
    "telnet://",
    "imap:",
    "rtsp://",
    "urn:",
    "pop:",
    "sip:",
    "sips:",
    "tftp:",
    "btspp://",
    "btl2cap://",
    "btgoep://",
    "tcpobex://",
    "irdaobex://",
    "file://",
    "urn:epc:id:",
    "urn:epc:tag:",
    "urn:epc:pat:",
    "urn:epc:raw:",
    "urn:epc:",
    "urn:nfc:",
  ];
  const prefix = prefixes[payload[0]] ?? "";
  return prefix + new TextDecoder().decode(payload.subarray(1));
}

export function decodePortalUserId(ndefMessage: Uint8Array): number | null {
  const records = parseNdefRecords(ndefMessage);

  for (const record of records) {
    if (record.tnf === 0x02 && MIME_TYPES.has(record.type)) {
      const id = parsePositiveId(new TextDecoder().decode(record.payload));
      if (id != null) return id;
    }
  }

  for (const record of records) {
    if (record.tnf === 0x01 && record.type === "T") {
      const id = parsePositiveId(decodeTextPayload(record.payload));
      if (id != null) return id;
    }
  }

  for (const record of records) {
    if (record.tnf === 0x01 && record.type === "U") {
      const uri = decodeUriPayload(record.payload);
      try {
        const url = new URL(uri);
        const fromQuery =
          url.searchParams.get("id") ??
          url.searchParams.get("userId") ??
          url.searchParams.get("user");
        if (fromQuery) {
          const id = parsePositiveId(fromQuery);
          if (id != null) return id;
        }
        const last = url.pathname.split("/").filter(Boolean).at(-1);
        if (last) {
          const id = parsePositiveId(last);
          if (id != null) return id;
        }
      } catch {
        // not a URL
      }
    }
  }

  return null;
}

export function portalIdFromUserMemory(userMemory: Uint8Array): number | null {
  const parsed = parseNdefTlv(userMemory);
  if (parsed.status !== "found") return null;
  return decodePortalUserId(parsed.bytes);
}
