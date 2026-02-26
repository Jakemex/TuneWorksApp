import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const IN_PATH = path.join(ROOT, "src", "data", "suppliers", "gturbo-products.json");
const OUT_PATH = path.join(ROOT, "src", "data", "gturbo-fitment.json");

// Super simple regex extractors (we can refine as you see edge cases)
function extractTurboCode(text) {
  const m = text.match(/\bG(?:250|300|333|350|380|400|450)\b/i);
  return m ? m[0].toUpperCase() : null;
}

function tagPlatform(text) {
  const t = text.toLowerCase();

  // Toyota platforms we care about right now
  const platforms = [];

  // 70 series
  if (t.includes("70 series") || t.includes("vdj70") || t.includes("vdj 70") || t.includes("landcruiser 70")) {
    platforms.push("LC70_1VD"); // we’ll refine engine later if needed
  }
  // 200 series
  if (t.includes("200 series") || t.includes("vdj200") || t.includes("vdj 200") || t.includes("landcruiser 200")) {
    platforms.push("LC200_1VD");
  }
  // 300 series
  if (t.includes("300 series") || t.includes("landcruiser 300") || t.includes("lc300")) {
    platforms.push("LC300_33D");
  }

  // Hilux (kept in case)
  if (t.includes("hilux") || t.includes("n70") || t.includes("n80") || t.includes("1kd") || t.includes("1gd")) {
    // if you want later
    platforms.push("HILUX");
  }

  return [...new Set(platforms)];
}

async function main() {
  const raw = JSON.parse(await fs.readFile(IN_PATH, "utf8"));
  const products = raw.products ?? [];

  const mapped = [];

  for (const p of products) {
    const hay = [
      p.title,
      p.categories?.join(" "),
      p.shortDescription,
      p.description,
      p.additionalInfo,
    ]
      .filter(Boolean)
      .join(" | ");

    const turbo = extractTurboCode(hay);
    const platforms = tagPlatform(hay);

    if (!turbo) continue;
    if (!platforms.length) continue;

    mapped.push({
      turbo,
      platforms,
      title: p.title,
      url: p.url,
      sku: p.sku || "",
    });
  }

  // Build final structure: platform -> unique turbos
  const platformToTurbos = {};
  for (const m of mapped) {
    for (const plat of m.platforms) {
      platformToTurbos[plat] ??= new Set();
      platformToTurbos[plat].add(m.turbo);
    }
  }

  const out = {
    generatedAt: new Date().toISOString(),
    platformTurbos: Object.fromEntries(
      Object.entries(platformToTurbos).map(([k, set]) => [k, [...set].sort()])
    ),
    // keep a traceable list for debugging
    evidence: mapped,
  };

  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });
  await fs.writeFile(OUT_PATH, JSON.stringify(out, null, 2), "utf8");

  console.log(`Wrote: ${OUT_PATH}`);
  console.log("Platform turbos:", out.platformTurbos);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});