import cors from "cors";
import express from "express";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

const PORT = Number(process.env.PRINT_SERVER_PORT ?? 3847);
const PRINTER_NAME = process.env.PRINTER_NAME?.trim() || null;
const MEDIA_OPTION = process.env.CUPS_MEDIA_OPTION ?? "Postcard";

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "20mb" }));

function log(...args) {
  console.log("[print-server]", ...args);
}

async function runCmd(bin, args, timeout = 10_000) {
  const { stdout, stderr } = await exec(bin, args, { timeout });
  return (stdout + stderr).trim();
}

async function listPrinters() {
  try {
    const stdout = await runCmd("lpstat", ["-p"]);
    const lines = stdout.split("\n").filter(Boolean);
    const printers = lines
      .map((line) => {
        const match = line.match(/^printer\s+(\S+)\s+(.+)$/i);
        if (!match) return null;
        const [, name, rest] = match;
        return { name, enabled: !/disabled/i.test(rest), state: rest.trim() };
      })
      .filter(Boolean);

    let defaultPrinter = null;
    try {
      const defOut = await runCmd("lpstat", ["-d"]);
      const defMatch = defOut.match(/system default destination:\s*(\S+)/i);
      if (defMatch) defaultPrinter = defMatch[1];
    } catch {
      /* no default */
    }

    return { printers, defaultPrinter };
  } catch {
    return { printers: [], defaultPrinter: null };
  }
}

async function getPrinterStatus(printer) {
  try {
    const raw = await runCmd("lpstat", ["-p", printer]);
    const firstLine = raw.split("\n")[0] ?? "";
    const detailLine = raw.split("\n").slice(1).join(" ").trim();
    const disabled = /disabled/i.test(firstLine);
    const printing = /now printing/i.test(firstLine);
    const idle = /idle/i.test(firstLine);
    const reason =
      detailLine ||
      firstLine.replace(/^printer\s+\S+\s+/i, "").trim() ||
      null;

    let lpq = "";
    try {
      lpq = await runCmd("lpq", ["-P", printer]);
    } catch {
      /* ignore */
    }
    const notReady = /not ready/i.test(lpq);

    const ready = !disabled && !notReady;

    let error = null;
    if (disabled) {
      error = `Printer "${printer}" is disabled in CUPS${reason ? `: ${reason}` : ""}. Check USB/power, then run: cupsenable ${printer} && cupsaccept ${printer}`;
    } else if (notReady) {
      error = `Printer "${printer}" is not ready. Check that it is on, connected, and has paper/ink.`;
    }

    return {
      printer,
      ready,
      disabled,
      printing,
      idle,
      notReady,
      reason,
      error,
      raw,
    };
  } catch (err) {
    return {
      printer,
      ready: false,
      disabled: true,
      printing: false,
      idle: false,
      notReady: true,
      reason: err instanceof Error ? err.message : "Unknown",
      error: `Could not read printer status for "${printer}".`,
      raw: "",
    };
  }
}

async function resumePrinter(printer) {
  await runCmd("cupsenable", [printer]);
  await runCmd("cupsaccept", [printer]);
  return getPrinterStatus(printer);
}

async function getQueueStatus(printer) {
  try {
    const stdout = await runCmd("lpstat", ["-o"]);
    const jobs = stdout
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const match = line.match(/^(\S+-\d+)\s+(\S+)\s+(\d+)\s+(.+)$/);
        if (!match) return null;
        const [, id, owner, size, submitted] = match;
        if (!id.startsWith(printer)) return null;
        return { id, owner, size: Number(size), submitted: submitted.trim() };
      })
      .filter(Boolean);

    const printerStatus = await getPrinterStatus(printer);
    const activeJobId = jobs[0]?.id ?? null;

    let warning = printerStatus.error;
    if (!warning && jobs.length > 1 && printerStatus.printing) {
      warning = `${jobs.length} jobs queued. Active: ${activeJobId ?? "unknown"}.`;
    } else if (!warning && jobs.length > 0 && !printerStatus.ready) {
      warning = `${jobs.length} job(s) pending but printer is not ready.`;
    }

    return {
      printer,
      jobCount: jobs.length,
      jobs: jobs.slice(0, 10),
      activeJobId,
      printerStatus,
      warning,
    };
  } catch {
    return {
      printer,
      jobCount: 0,
      jobs: [],
      activeJobId: null,
      printerStatus: null,
      warning: null,
    };
  }
}

function resolvePrinter(requested, defaultPrinter) {
  return requested?.trim() || PRINTER_NAME || defaultPrinter || null;
}

function runLpWithBuffer(args, buffer) {
  return new Promise((resolve) => {
    const proc = spawn("lp", args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    proc.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    proc.on("error", (err) => {
      resolve({ ok: false, error: err.message });
    });

    proc.on("close", (code) => {
      const out = (stdout + stderr).trim();
      if (code === 0) {
        resolve({ ok: true, stdout: out });
      } else {
        resolve({ ok: false, error: out || `lp exited with code ${code}` });
      }
    });

    proc.stdin.write(buffer);
    proc.stdin.end();
  });
}

app.get("/health", async (_req, res) => {
  const { defaultPrinter } = await listPrinters();
  const printer = resolvePrinter(null, defaultPrinter);
  const queue = printer ? await getQueueStatus(printer) : null;
  res.json({
    ok: Boolean(printer && queue?.printerStatus?.ready),
    printer,
    media: MEDIA_OPTION,
    port: PORT,
    queue,
  });
});

app.get("/queue", async (req, res) => {
  const { defaultPrinter } = await listPrinters();
  const printer = resolvePrinter(req.query.printer, defaultPrinter);
  if (!printer) {
    res.status(503).json({ error: "No printer configured" });
    return;
  }
  res.json(await getQueueStatus(printer));
});

app.post("/resume", async (req, res) => {
  const { defaultPrinter } = await listPrinters();
  const printer = resolvePrinter(req.body?.printer, defaultPrinter);
  if (!printer) {
    res.status(503).json({ error: "No printer configured" });
    return;
  }

  try {
    log(`Resume requested for ${printer}`);
    const status = await resumePrinter(printer);
    log(`Printer status after resume: ready=${status.ready}`);
    res.json({ ok: status.ready, status });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not resume printer";
    log("Resume failed:", message);
    res.status(500).json({ error: message });
  }
});

app.get("/printers", async (_req, res) => {
  res.json(await listPrinters());
});

app.post("/print", async (req, res) => {
  const { image, copies = 1, printer: requestedPrinter } = req.body ?? {};

  if (typeof image !== "string" || !image.startsWith("data:image/")) {
    res.status(400).json({ error: "Expected { image: data:image/...;base64,... }" });
    return;
  }

  const match = image.match(/^data:image\/(\w+);base64,(.+)$/s);
  if (!match) {
    res.status(400).json({ error: "Invalid image data URL" });
    return;
  }

  const buffer = Buffer.from(match[2], "base64");
  const { defaultPrinter } = await listPrinters();
  const printer = resolvePrinter(requestedPrinter, defaultPrinter);

  if (!printer) {
    res.status(503).json({
      error: "No printer configured. Set PRINTER_NAME or choose a CUPS default.",
    });
    return;
  }

  const status = await getPrinterStatus(printer);
  if (!status.ready) {
    log("Print blocked — printer not ready:", status.error);
    res.status(503).json({
      error: status.error,
      status,
      hint: `Try: cupsenable ${printer} && cupsaccept ${printer}`,
    });
    return;
  }

  log(`Print request: ${buffer.length} bytes → ${printer} (PageSize=${MEDIA_OPTION})`);

  const args = [
    "-d",
    printer,
    "-n",
    String(Math.max(1, Math.min(10, Number(copies) || 1))),
    "-o",
    `PageSize=${MEDIA_OPTION}`,
    "-o",
    "StpiShrinkOutput=Shrink",
    "-o",
    "StpColorCorrection=None",
    "-t",
    "Photobooth strip",
    "-",
  ];

  const result = await runLpWithBuffer(args, buffer);

  if (!result.ok) {
    log("lp failed:", result.error);
    res.status(500).json({ error: result.error });
    return;
  }

  const jobMatch = result.stdout.match(/request id is\s+(\S+)/i);
  const jobId = jobMatch?.[1] ?? null;
  const queueAfter = await getQueueStatus(printer);

  log(`Submitted ${jobId ?? "job"} — queue depth: ${queueAfter.jobCount}`);

  res.json({
    ok: true,
    jobId,
    printer,
    message: result.stdout,
    bytes: buffer.length,
    queue: queueAfter,
    warning: queueAfter.warning,
  });
});

app.listen(PORT, "127.0.0.1", () => {
  log(`Listening on http://127.0.0.1:${PORT}`);
  if (PRINTER_NAME) log(`Printer override: ${PRINTER_NAME}`);
  log(`Media: PageSize=${MEDIA_OPTION}`);
});
