// One-off TTS generation for the thien-thach-vs-sao-bang video narration.
// Supports three providers via TTS_PROVIDER in repo-root .env:
//   "vbee"   (default) — Vbee TTS API, requires VBEE_APP_ID + VBEE_ACCESS_TOKEN
//   "edge"              — Microsoft Edge TTS (free, no API key), via edge-tts-universal npm package
//   "gemini"            — Gemini TTS, requires GEMINI_API_KEY (Google AI Studio)
// Generates one mp3 per caption line, downloads to assets/vo/, and writes
// assets/vo/durations.json (via ffprobe) so index.html timing can be retimed
// to real audio length.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(ROOT, "..", "..");

function loadEnv() {
  const raw = fs.readFileSync(path.join(REPO_ROOT, ".env"), "utf8");
  const env = {};
  for (const line of raw.split("\n")) {
    const m = line.trim().match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

const ENV = loadEnv();
const TTS_PROVIDER = (ENV.TTS_PROVIDER || "vbee").toLowerCase();

// --- Vbee config (only required when TTS_PROVIDER=vbee) ---
const VBEE_APP_ID = ENV.VBEE_APP_ID;
const VBEE_ACCESS_TOKEN = ENV.VBEE_ACCESS_TOKEN;
const VOICE_CODE = ENV.VBEE_VOICE_CODE || "n_hanoi_male_protrainer_education_vc";

// --- Edge TTS config (only required when TTS_PROVIDER=edge) ---
const EDGE_VOICE = ENV.EDGE_VOICE || "vi-VN-NamMinhNeural";

// --- Gemini TTS config (only required when TTS_PROVIDER=gemini) ---
// GEMINI_API_KEY may hold multiple comma-separated keys — rotate to the next
// one when the current key hits its daily free-tier quota (429 / RESOURCE_EXHAUSTED).
const GEMINI_API_KEYS = (ENV.GEMINI_API_KEY || "")
  .split(",")
  .map((k) => k.trim())
  .filter(Boolean);
const GEMINI_VOICE = ENV.GEMINI_TTS_VOICE || "Achird";

const SPEED_RATE = 1.1;

if (TTS_PROVIDER === "vbee") {
  if (!VBEE_APP_ID || !VBEE_ACCESS_TOKEN) {
    throw new Error(
      "TTS_PROVIDER=vbee nhưng thiếu VBEE_APP_ID / VBEE_ACCESS_TOKEN trong .env.\n" +
        "Điền credentials Vbee, hoặc đổi TTS_PROVIDER=edge / gemini.",
    );
  }
} else if (TTS_PROVIDER === "gemini") {
  if (GEMINI_API_KEYS.length === 0) {
    throw new Error(
      "TTS_PROVIDER=gemini nhưng thiếu GEMINI_API_KEY trong .env.\n" +
        "Điền API key Google AI Studio, hoặc đổi TTS_PROVIDER=edge / vbee.",
    );
  }
}

console.log(`TTS provider: ${TTS_PROVIDER}`);

const LINES = [
  { id: "line-1", text: "Đây là thiên thạch." },
  { id: "line-2", text: "Đây là sao băng." },
  { id: "line-3", text: "Sự khác nhau là gì?" },
  { id: "line-4", text: "Thiên thạch là đá hoặc kim loại từ vũ trụ." },
  { id: "line-5", text: "Nó thực sự rơi xuống và chạm đất." },
  { id: "line-6", text: "Còn sao băng chỉ là ánh sáng thôi." },
  { id: "line-7", text: "Đó là bụi vũ trụ đang cháy trong khí quyển." },
  { id: "line-8", text: "Một cái chạm đất, một cái thì không!" },
];

// ============================================================
// Edge TTS — Node.js API via edge-tts-universal (no Python needed)
// ============================================================

function speedRateToEdgeRate(rate) {
  const pct = Math.round((rate - 1) * 100);
  return pct >= 0 ? `+${pct}%` : `${pct}%`;
}

async function generateEdgeSpeech(text, outPath) {
  const { EdgeTTS } = await import("edge-tts-universal");
  const rate = speedRateToEdgeRate(SPEED_RATE);
  const tts = new EdgeTTS(text, EDGE_VOICE, { rate });
  const result = await tts.synthesize();
  const audioBuffer = Buffer.from(await result.audio.arrayBuffer());
  fs.writeFileSync(outPath, audioBuffer);
}

// ============================================================
// Vbee TTS — REST API (giữ nguyên logic cũ)
// ============================================================

async function generateVbeeSpeech(text) {
  const res = await fetch("https://vbee.vn/api/v1/tts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${VBEE_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      app_id: VBEE_APP_ID,
      input_text: text,
      voice_code: VOICE_CODE,
      audio_type: "mp3",
      speed_rate: SPEED_RATE,
      callback_url: "https://example.com/callback",
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  const data = await res.json();
  if (data.status !== 1) {
    throw new Error(`Vbee error: ${data.error_message || data.error_code}`);
  }
  if (data.result?.audio_link) return data.result.audio_link;
  const requestId = data.result?.request_id;
  if (!requestId) throw new Error("No request_id returned");
  return pollForAudio(requestId);
}

async function pollForAudio(requestId) {
  const url = `https://vbee.vn/api/v1/tts/${requestId}`;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const res = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${VBEE_ACCESS_TOKEN}`,
      },
    });
    if (!res.ok) continue;
    const data = await res.json();
    if (data.status === 1) {
      if (data.result?.status === "SUCCESS" && data.result?.audio_link) {
        return data.result.audio_link;
      }
      if (data.result?.status === "FAILURE") {
        throw new Error("Vbee processing failed");
      }
    }
  }
  throw new Error("Timeout waiting for Vbee audio");
}

async function downloadAudio(url, outPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.statusText}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outPath, buf);
}

// ============================================================
// Gemini TTS — @google/genai, prebuilt voice (e.g. "Achird")
// ============================================================

function isGeminiQuotaError(err) {
  const msg = err?.message || "";
  return /429|RESOURCE_EXHAUSTED|quota/i.test(msg);
}

// Requests raw PCM audio from Gemini for arbitrary text (one line, or many
// lines joined together). Shared by both the per-line path and the
// single-call batch path below.
async function requestGeminiPcm(text) {
  const { GoogleGenAI } = await import("@google/genai");

  let response;
  let lastErr;
  for (let i = 0; i < GEMINI_API_KEYS.length; i++) {
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEYS[i] });
    try {
      response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text }] }],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: GEMINI_VOICE } },
          },
        },
      });
      lastErr = null;
      break;
    } catch (err) {
      lastErr = err;
      if (isGeminiQuotaError(err) && i < GEMINI_API_KEYS.length - 1) {
        process.stdout.write(`(key #${i + 1} quota, trying next) `);
        continue;
      }
      throw err;
    }
  }
  if (lastErr) throw lastErr;

  const data = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!data) throw new Error("Gemini TTS returned no audio data");

  // The API returns base64-encoded raw PCM: 24 kHz, 16-bit signed LE, mono.
  const pcmBuffer = Buffer.from(data, "base64");
  if (pcmBuffer.length === 0) throw new Error("Gemini TTS returned empty PCM buffer");
  return pcmBuffer;
}

function runFfmpeg(args, input) {
  return new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", args, { stdio: [input ? "pipe" : "ignore", "ignore", "pipe"] });
    let stderr = "";
    ff.stderr.on("data", (chunk) => { stderr += chunk; });
    ff.on("error", (err) => reject(new Error(`ffmpeg spawn error: ${err.message}`)));
    ff.on("close", (code) => {
      if (code === 0) resolve(stderr);
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-800)}`));
    });
    if (input) {
      ff.stdin.write(input);
      ff.stdin.end();
    }
  });
}

async function generateGeminiSpeech(text, outPath) {
  const pcmBuffer = await requestGeminiPcm(text);
  // Convert PCM → MP3 by piping into ffmpeg stdin (ffmpeg is already a repo
  // requirement — see README § Yêu cầu hệ thống).
  await runFfmpeg(
    ["-y", "-f", "s16le", "-ar", "24000", "-ac", "1", "-i", "pipe:0", "-codec:a", "libmp3lame", "-q:a", "2", outPath],
    pcmBuffer,
  );
}

// ---- Single-call batch mode: generate all lines in ONE Gemini request so the
// model performs them as one continuous read (consistent tone/pace), then
// split the result into per-line clips by detecting the pauses between
// sentences. Gemini is a generative "performance" model — separate calls for
// each line (the default path above) can each land on a slightly different
// delivery even with the same voice name; one call removes that source of
// drift. Riskier: if Gemini doesn't pause clearly between every sentence,
// the split will be wrong, so this throws loudly instead of guessing.
async function detectSilences(wavPath, noiseDb = -30, minDur = 0.25) {
  const stderr = await runFfmpeg([
    "-i", wavPath,
    "-af", `silencedetect=noise=${noiseDb}dB:d=${minDur}`,
    "-f", "null", "-",
  ]);
  const silences = [];
  let pendingStart = null;
  for (const line of stderr.split("\n")) {
    const startM = line.match(/silence_start:\s*([\d.]+)/);
    if (startM) pendingStart = parseFloat(startM[1]);
    const endM = line.match(/silence_end:\s*([\d.]+)/);
    if (endM && pendingStart != null) {
      silences.push({ start: pendingStart, end: parseFloat(endM[1]) });
      pendingStart = null;
    }
  }
  return silences;
}

async function generateGeminiSpeechBatch(lines, outDir) {
  const allCached = lines.every((l) => fs.existsSync(path.join(outDir, `${l.id}.mp3`)));
  if (allCached) {
    console.log("All lines already cached — skipping batch Gemini call.");
    return;
  }

  console.log(
    `Generating all ${lines.length} lines in ONE Gemini call (single continuous read for a consistent voice) ...`,
  );
  await paceGeminiCall();
  const combinedText = lines.map((l) => l.text).join("\n\n");
  const pcmBuffer = await withGeminiRetry(() => requestGeminiPcm(combinedText));

  const wavPath = path.join(outDir, "_full-vo.wav");
  await runFfmpeg(
    ["-y", "-f", "s16le", "-ar", "24000", "-ac", "1", "-i", "pipe:0", "-c:a", "pcm_s16le", wavPath],
    pcmBuffer,
  );

  const totalDuration = await getDuration(wavPath);
  const expectedGaps = lines.length - 1;
  let silences = await detectSilences(wavPath);
  console.log(`  Total audio: ${totalDuration.toFixed(2)}s, detected ${silences.length} pause(s) (need ${expectedGaps}).`);

  if (silences.length < expectedGaps) {
    throw new Error(
      `Batch Gemini read only paused ${silences.length}/${expectedGaps} times between the ${lines.length} lines — ` +
        `cannot split reliably (Gemini likely ran some sentences together without a clear pause). ` +
        `Raw combined audio kept at ${wavPath} for listening/inspection. ` +
        `Fall back to per-line generation (remove the "gemini batch" call) or retry.`,
    );
  }
  if (silences.length > expectedGaps) {
    // Keep the expectedGaps LONGEST pauses (most likely the real sentence
    // boundaries), then restore chronological order for cutting.
    silences = [...silences]
      .sort((a, b) => (b.end - b.start) - (a.end - a.start))
      .slice(0, expectedGaps)
      .sort((a, b) => a.start - b.start);
  }

  const cutPoints = [0, ...silences.map((s) => (s.start + s.end) / 2), totalDuration];
  for (let i = 0; i < lines.length; i++) {
    const outPath = path.join(outDir, `${lines[i].id}.mp3`);
    await runFfmpeg([
      "-y", "-i", wavPath,
      "-ss", String(cutPoints[i]),
      "-to", String(cutPoints[i + 1]),
      "-codec:a", "libmp3lame", "-q:a", "2",
      outPath,
    ]);
  }

  fs.unlinkSync(wavPath);
}

// ============================================================
// Shared
// ============================================================

async function getDuration(filePath) {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    filePath,
  ]);
  return parseFloat(stdout.trim());
}

async function withRetry(fn, attempts = 4) {
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === attempts) throw err;
      const backoffMs = 1500 * i;
      process.stdout.write(`retry ${i}/${attempts - 1} after "${err.message}" ... `);
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }
}

// Gemini's free tier caps at 3 requests/minute per project (shared across all
// API keys from that project — rotating keys does not raise this cap, only a
// separate project would). Parse the server's own "retry in Ns" / retryDelay
// hint and wait that long instead of a short generic backoff, which just
// burns through the attempt budget without ever clearing the window.
function parseGeminiRetryDelayMs(err) {
  const msg = err?.message || "";
  const m = msg.match(/retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s/) || msg.match(/retry in ([\d.]+)s/);
  if (m) return Math.ceil(parseFloat(m[1]) * 1000) + 2000; // +2s buffer
  return null;
}

async function withGeminiRetry(fn, attempts = 6) {
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === attempts) throw err;
      const delay = parseGeminiRetryDelayMs(err) ?? 1500 * i;
      process.stdout.write(`retry ${i}/${attempts - 1}, waiting ${(delay / 1000).toFixed(0)}s ... `);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

// Proactive pacing for Gemini calls: stay under the 3-req/minute cap instead
// of reactively hitting 429 every time (which wastes the retry budget above).
const GEMINI_MIN_GAP_MS = 21000; // 60s / 3 req + buffer
let lastGeminiCallAt = 0;
async function paceGeminiCall() {
  const wait = GEMINI_MIN_GAP_MS - (Date.now() - lastGeminiCallAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastGeminiCallAt = Date.now();
}

async function main() {
  const outDir = path.join(ROOT, "assets", "vo");
  fs.mkdirSync(outDir, { recursive: true });
  const durations = {};

  // Gemini: one batch call for all lines (consistent voice across the whole
  // read), split into per-line clips by pause detection. This produces the
  // same assets/vo/line-N.mp3 files the loop below expects, so it just needs
  // to run once before the loop — the loop then only measures durations.
  if (TTS_PROVIDER === "gemini") {
    await generateGeminiSpeechBatch(LINES, outDir);
  }

  for (const line of LINES) {
    const outPath = path.join(outDir, `${line.id}.mp3`);
    process.stdout.write(`Generating ${line.id}: "${line.text}" ... `);

    // Resumable: a previous run may have already produced this line before
    // a transient provider error (rate limit, quota) interrupted a later one.
    if (!fs.existsSync(outPath)) {
      if (TTS_PROVIDER === "edge") {
        await withRetry(() => generateEdgeSpeech(line.text, outPath));
        await new Promise((r) => setTimeout(r, 400)); // avoid tripping rate limit
      } else if (TTS_PROVIDER === "gemini") {
        // Should already exist from the batch call above — this only fires
        // if the batch step somehow skipped a line.
        throw new Error(`${line.id}.mp3 missing after Gemini batch generation.`);
      } else {
        const audioUrl = await withRetry(() => generateVbeeSpeech(line.text));
        await downloadAudio(audioUrl, outPath);
      }
    } else {
      process.stdout.write("(cached) ");
    }

    const dur = await getDuration(outPath);
    durations[line.id] = dur;
    console.log(`${dur.toFixed(2)}s`);
  }

  fs.writeFileSync(
    path.join(outDir, "durations.json"),
    JSON.stringify(durations, null, 2),
  );
  console.log("Done. Durations written to assets/vo/durations.json");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
