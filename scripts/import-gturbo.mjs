import fs from "node:fs/promises";
import path from "node:path";
import * as cheerio from "cheerio";
import pLimit from "p-limit";

const BASE = "https://gturbo.com.au";
const SHOP = `${BASE}/shop/`;
const OUT = path.join(process.cwd(), "src", "data", "suppliers");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      "user-agent": "TuneWorksPackageBuilder/1.0 (catalog importer)",
      accept: "text/html,*/*",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.text();
}

function uniq(xs) {
  return [...new Set(xs)];
}

async function getTotalPages() {
  const html = await fetchHtml(SHOP);
  const $ = cheerio.load(html);
  const pages = $(".page-numbers")
    .map((_, el) => parseInt($(el).text().trim(), 10))
    .get()
    .filter((n) => Number.isFinite(n));
  return pages.length ? Math.max(...pages) : 1;
}

function extractProductLinks(shopHtml) {
  const $ = cheerio.load(shopHtml);
  const links = $("li.product a.woocommerce-LoopProduct-link")
    .map((_, a) => $(a).attr("href"))
    .get()
    .filter(Boolean);
  return uniq(links);
}

function extractProduct(productHtml, url) {
  const $ = cheerio.load(productHtml);
  const title = $("h1.product_title").first().text().trim();
  const price = $("p.price").first().text().replace(/\s+/g, " ").trim();
  const sku = $(".sku").first().text().trim();

  const categories = $(".posted_in a")
    .map((_, a) => $(a).text().trim())
    .get()
    .filter(Boolean);

  const shortDescription = $(".woocommerce-product-details__short-description")
    .text()
    .replace(/\s+/g, " ")
    .trim();

  const description = $("#tab-description").text().replace(/\s+/g, " ").trim();
  const additionalInfo = $("#tab-additional_information").text().replace(/\s+/g, " ").trim();

  return {
    supplier: "gturbo",
    url,
    title,
    sku,
    price,
    categories,
    shortDescription,
    description,
    additionalInfo,
    scrapedAt: new Date().toISOString(),
  };
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });

  const totalPages = await getTotalPages();
  console.log(`Shop pages: ${totalPages}`);

  let productUrls = [];
  for (let p = 1; p <= totalPages; p++) {
    const pageUrl = p === 1 ? SHOP : `${BASE}/shop/page/${p}/`;
    console.log(`Index ${p}/${totalPages}: ${pageUrl}`);
    const html = await fetchHtml(pageUrl);
    productUrls.push(...extractProductLinks(html));
    await sleep(300);
  }
  productUrls = uniq(productUrls);
  console.log(`Products found: ${productUrls.length}`);

  // Concurrency limited + polite spacing
  const limit = pLimit(5);
  const results = [];
  let ok = 0, fail = 0;

  await Promise.all(
    productUrls.map((url, idx) =>
      limit(async () => {
        try {
          const html = await fetchHtml(url);
          const prod = extractProduct(html, url);
          results.push(prod);
          ok++;
          if ((idx + 1) % 25 === 0) console.log(`Progress: ${idx + 1}/${productUrls.length} (ok ${ok}, fail ${fail})`);
        } catch (e) {
          fail++;
          console.warn(`Failed: ${url} -> ${e.message}`);
        } finally {
          await sleep(250);
        }
      })
    )
  );

  const outPath = path.join(OUT, "gturbo-products.json");
  await fs.writeFile(outPath, JSON.stringify({ products: results }, null, 2), "utf8");
  console.log(`Saved ${results.length} products -> ${outPath}`);
  console.log(`Done (ok ${ok}, fail ${fail}).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});