// Called by the discord-notify workflow.
// Reads newly added .md files from the last commit, parses frontmatter,
// and POSTs an embed to Discord for each non-draft post or series README.
//
// Local test: DISCORD_WEBHOOK_URL=your_url node .github/scripts/notify-discord.js --test
const { execSync } = require("child_process");
const fs = require("fs");
const https = require("https");
const { URL } = require("url");

const SITE_URL = process.env.SITE_URL || "https://soren-learning.site";
const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

if (!WEBHOOK_URL) {
  console.log("DISCORD_WEBHOOK_URL not set — skipping.");
  process.exit(0);
}

function frontmatter(content, key) {
  const m = content.match(new RegExp(`^${key}:\\s*["']?([^"'\\n]+)["']?`, "m"));
  return m ? m[1].trim() : "";
}

function post(payload) {
  const url = new URL(WEBHOOK_URL);
  const body = JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        console.log(`Discord: ${res.statusCode}`);
        resolve();
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  // --test: send a dummy message to verify the webhook works
  if (process.argv.includes("--test")) {
    await post({
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
    const parts = file.split("/"); // ["content", category, ...slug]
    const content = fs.readFileSync(file, "utf8");

    if (frontmatter(content, "draft") === "true") continue;

    const title = frontmatter(content, "title");
    const description = frontmatter(content, "description");

    // content/category/post.md — standalone post
    if (parts.length === 3 && parts[2] !== "README.md") {
      notifications.push({
        type: "post",
        title,
        description,
        url: `${SITE_URL}/${parts[1]}/${parts[2].replace(".md", "")}`,
      });
    }

    // content/category/series/README.md — new series
    if (parts.length === 4 && parts[3] === "README.md") {
      notifications.push({
        type: "series",
        title,
        description,
        url: `${SITE_URL}/${parts[1]}/${parts[2]}`,
      });
    }
  }

  if (notifications.length === 0) {
    console.log("No new publishable content found.");
    return;
  }

  for (const item of notifications) {
    const isSeries = item.type === "series";
    await post({
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
