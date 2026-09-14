const http = require("http");
const fs = require("fs");
const path = require("path");

loadEnvFile(path.join(__dirname, ".env"));

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "127.0.0.1";
const PROVIDER = process.env.AGENT_PROVIDER || "deepseek";
const DEEPSEEK_ENDPOINT = process.env.DEEPSEEK_ENDPOINT || "https://api.deepseek.com/chat/completions";
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";
const ORBIO_ENDPOINT = process.env.ORBIO_ENDPOINT || "";
const LAUNCH_SYSTEM_PROMPT = loadPromptFile(path.join(__dirname, "prompts", "launch-system.txt"));

const server = http.createServer(async (request, response) => {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method === "GET" && request.url === "/health") {
    sendJson(response, 200, { ok: true, provider: PROVIDER });
    return;
  }

  if (request.method !== "POST" || request.url !== "/api/generate-token-plan") {
    sendJson(response, 404, { ok: false, error: "Not found" });
    return;
  }

  try {
    const payload = await readJson(request);
    const tweetText = payload?.tweetText?.trim();
    if (!tweetText) throw new HttpError(400, "No tweet text captured.");

    const result = await generateTokenPlan(payload);
    sendJson(response, 200, { ok: true, result });
  } catch (error) {
    const status = error.statusCode || 500;
    sendJson(response, status, { ok: false, error: error.message || "Agent proxy failed." });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`VEKTOR agent proxy listening on http://${HOST}:${PORT}`);
});

async function generateTokenPlan(payload) {
  if (PROVIDER === "orbio") return callOrbio(payload);
  return callDeepSeek(payload);
}

async function callDeepSeek(payload) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new HttpError(503, "DEEPSEEK_API_KEY is not configured on the server.");

  const response = await fetch(DEEPSEEK_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: [
        { role: "system", content: LAUNCH_SYSTEM_PROMPT },
        { role: "user", content: buildAgentPrompt(payload) },
      ],
      temperature: 0.4,
    }),
  });

  if (!response.ok) throw new HttpError(response.status, `DeepSeek endpoint failed with ${response.status}`);
  const data = await response.json();
  return data?.choices?.[0]?.message?.content || JSON.stringify(data, null, 2);
}

async function callOrbio(payload) {
  const apiKey = process.env.ORBIO_API_KEY || "";
  if (!ORBIO_ENDPOINT) throw new HttpError(503, "ORBIO_ENDPOINT is not configured on the server.");

  const response = await fetch(ORBIO_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      messages: [
        { role: "system", content: LAUNCH_SYSTEM_PROMPT },
        { role: "user", content: buildAgentPrompt(payload) },
      ],
      temperature: 0.4,
    }),
  });

  if (!response.ok) throw new HttpError(response.status, `Orbio endpoint failed with ${response.status}`);
  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content || data?.output || data?.text || data?.response;
  return typeof content === "string" ? content : JSON.stringify(data, null, 2);
}

function buildAgentPrompt(payload) {
  return `Analyze this captured X/Twitter context and generate a VEKTOR token launch plan.

Tweet author: ${payload.author || "unknown"}
Tweet text: ${payload.tweetText}
Tweet URL: ${payload.tweetUrl || "unknown"}
Launch analytics: ${JSON.stringify(payload.analytics || {}, null, 2)}
Wallet connected: ${payload.walletAddress ? "yes" : "no"}`;
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 64_000) {
        reject(new HttpError(413, "Request body too large."));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (_error) {
        reject(new HttpError(400, "Invalid JSON body."));
      }
    });
    request.on("error", reject);
  });
}

function setCorsHeaders(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(payload));
}

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const separator = trimmed.indexOf("=");
    if (separator === -1) return;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  });
}

function loadPromptFile(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8").trim();
  } catch (_error) {
    return "You are VEKTOR. Return concise JSON token launch plans only.";
  }
}
