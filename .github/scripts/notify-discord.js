// Called by the discord-notify workflow.
// Detects newly added posts/series from the last commit, waits for Vercel
// to finish deploying, then POSTs an embed to Discord.
//
// Local test: DISCORD_WEBHOOK_URL=your_url node .github/scripts/notify-discord.js --test
const { execSync } = require("child_process");
const fs = require("fs");
const https = require("https");
const { URL } = require("url");

const SITE_URL = process.env.SITE_URL || "https://soren-learning.site";
const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID;

if (!WEBHOOK_URL) {
  console.log("DISCORD_WEBHOOK_URL not set — skipping.");
  process.exit(0);
}

function frontmatter(content, key) {
  const m = content.match(new RegExp(`^${key}:\\s*["']?([^"'\\n]+)["']?`, "m"));
  return m ? m[1].trim() : "";
}

function request(urlStr, options = {}) {
  const url = new URL(urlStr);
  const body = options.body ? JSON.stringify(options.body) : undefined;
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: options.method || "GET",
        headers: {
          ...(body ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } : {}),
          ...(options.headers || {}),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve({ status: res.statusCode, data }));
      }
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function waitForVercel() {
  if (!VERCEL_TOKEN || !VERCEL_PROJECT_ID) {
    console.log("VERCEL_TOKEN or VERCEL_PROJECT_ID not set — sending immediately.");
    return;
  }

  const commitSha = execSync("git rev-parse HEAD").toString().trim();
  console.log(`Waiting for Vercel to deploy commit ${commitSha}...`);
  const MAX_ATTEMPTS = 30; // 30 × 10s = 5 min max

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const res = await request(
      `https://api.vercel.com/v6/deployments?projectId=${VERCEL_PROJECT_ID}&limit=5&target=production`,
      { headers: { Authorization: `Bearer ${VERCEL_TOKEN}` } }
    );
    const deployments = JSON.parse(res.data)?.deployments ?? [];
    // match the deployment for THIS commit specifically
    const deployment = deployments.find((d) => d.meta?.githubCommitSha === commitSha);

    if (!deployment) {
      console.log(`Deployment not found yet... (${i + 1}/${MAX_ATTEMPTS})`);
    } else {
      const state = deployment.readyState;
      console.log(`Vercel: ${state} (${i + 1}/${MAX_ATTEMPTS})`);
      if (state === "READY") return;
      if (state === "ERROR" || state === "CANCELED") {
        throw new Error(`Vercel deployment ${state} — aborting notification.`);
      }
    }

    await new Promise((r) => setTimeout(r, 10000));
  }

  console.log("Timed out waiting for Vercel — sending anyway.");
}

async function sendDiscord(payload) {
  const res = await request(WEBHOOK_URL, { method: "POST", body: payload });
  console.log(`Discord: ${res.status}`);
}

async function main() {
  if (process.argv.includes("--test")) {
    await sendDiscord({
      content: "@everyone",
      embeds: [
        {
          author: { name: "📝 New Post" },
          title: "Test: Service-to-Service Authentication",
          description: "This is a test notification from notify-discord.js.",
          url: `${SITE_URL}/technical/service-to-service-authentication`,
          color: 0x2563eb,
          footer: { text: SITE_URL.replace("https://", "") },
        },
      ],
    });
    console.log("Test message sent.");
    return;
  }

  const diff = execSync("git diff --name-status HEAD~1 HEAD").toString();
  const newFiles = diff
    .split("\n")
    .filter((l) => l.startsWith("A\t"))
    .map((l) => l.slice(2).trim())
    .filter((f) => f.startsWith("content/") && f.endsWith(".md"));

  const notifications = [];

  for (const file of newFiles) {
    const parts = file.split("/");
    const content = fs.readFileSync(file, "utf8");
    if (frontmatter(content, "draft") === "true") continue;

    const title = frontmatter(content, "title");
    const description = frontmatter(content, "description");

    // content/category/post.md
    if (parts.length === 3 && parts[2] !== "README.md") {
      notifications.push({
        type: "post", title, description,
        url: `${SITE_URL}/${parts[1]}/${parts[2].replace(".md", "")}`,
      });
    }

    // content/category/series/README.md
    if (parts.length === 4 && parts[3] === "README.md") {
      notifications.push({
        type: "series", title, description,
        url: `${SITE_URL}/${parts[1]}/${parts[2]}`,
      });
    }
  }

  if (notifications.length === 0) {
    console.log("No new publishable content found.");
    return;
  }

  await waitForVercel();

  for (const item of notifications) {
    const isSeries = item.type === "series";
    await sendDiscord({
      content: "@everyone",
      embeds: [
        {
          author: { name: isSeries ? "📚 New Series" : "📝 New Post" },
          title: item.title,
          description: item.description || "",
          url: item.url,
          color: isSeries ? 0x7c3aed : 0x2563eb,
          footer: { text: SITE_URL.replace("https://", "") },
        },
      ],
    });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
