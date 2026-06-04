// Scrapes Spreadconnect's public shipping calculator FAQ pages for the EU and
// US accounts, captures the default-method tariff per destination country,
// and writes data/shipping-rates.csv (+ raw JSON for debugging).
//
// Run with: npm run scrape:shipping
//
// Currency: prices are kept in the source page's currency — EUR for EU rows,
// USD for US rows. NOT converted. The `currency` column in the CSV is the
// source of truth per row. Consumers must convert at order time using a live
// FX source if they need a single-currency view.
//
// The output is the source for src/lib/shipping-zones.ts. Re-run periodically
// to catch SC price updates.

import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, "../data");

const REGIONS = [
  {
    code: "EU",
    url: "https://faq.spreadconnect.app/hc/en-gb/articles/360021480060-What-are-Spreadconnect-s-shipping-times-prices-for-EU",
    currency: "EUR",
  },
  {
    code: "US",
    url: "https://faq.spreadconnect.app/hc/en-gb/articles/360020928239-What-are-Spreadconnect-s-shipping-times-prices-from-the-US",
    currency: "USD",
  },
];

// Spreadconnect uses some non-ISO country names; map them to ISO 3166-1 alpha-2
// where Stripe / our code expects them. Unmapped names get an empty iso column —
// downstream consumers should treat them as deliverable but unmapped.
const COUNTRY_TO_ISO = {
  "Åland Islands": "AX",
  Albania: "AL",
  Algeria: "DZ",
  Andorra: "AD",
  Angola: "AO",
  Anguilla: "AI",
  "Antigua and Barbuda": "AG",
  Argentina: "AR",
  Armenia: "AM",
  Aruba: "AW",
  Australia: "AU",
  Austria: "AT",
  Azerbaijan: "AZ",
  Bahamas: "BS",
  Bahrain: "BH",
  Bangladesh: "BD",
  Barbados: "BB",
  Belgium: "BE",
  Belize: "BZ",
  Benin: "BJ",
  Bermuda: "BM",
  Bhutan: "BT",
  Bolivia: "BO",
  "Bosnia and Herzegovina": "BA",
  Botswana: "BW",
  Brazil: "BR",
  "British Virgin Islands": "VG",
  "Brunei Darussalam": "BN",
  Bulgaria: "BG",
  "Burkina Faso": "BF",
  Burundi: "BI",
  Cambodia: "KH",
  Cameroon: "CM",
  Canada: "CA",
  "Canary Islands": "IC",
  "Cape Verde": "CV",
  "Cayman Islands": "KY",
  "Central African Republic": "CF",
  Chad: "TD",
  Chile: "CL",
  China: "CN",
  Colombia: "CO",
  Comoros: "KM",
  Congo: "CG",
  "Cook Islands": "CK",
  "Costa Rica": "CR",
  Croatia: "HR",
  Cyprus: "CY",
  "Czech Republic": "CZ",
  "Democratic Republic of the Congo": "CD",
  Denmark: "DK",
  Dominica: "DM",
  "Dominican Republic": "DO",
  Ecuador: "EC",
  Egypt: "EG",
  "El Salvador": "SV",
  "Equatorial Guinea": "GQ",
  Eritrea: "ER",
  Estonia: "EE",
  Eswatini: "SZ",
  Ethiopia: "ET",
  "Falkland Islands": "FK",
  "Faroe Islands": "FO",
  Fiji: "FJ",
  Finland: "FI",
  France: "FR",
  Gabon: "GA",
  Gambia: "GM",
  Georgia: "GE",
  Germany: "DE",
  Ghana: "GH",
  Gibraltar: "GI",
  Greece: "GR",
  Greenland: "GL",
  Grenada: "GD",
  Guadeloupe: "GP",
  Guam: "GU",
  Guatemala: "GT",
  Guernsey: "GG",
  Guinea: "GN",
  "Guinea-Bissau": "GW",
  Guyana: "GY",
  Haiti: "HT",
  "Hong Kong": "HK",
  Hungary: "HU",
  Iceland: "IS",
  India: "IN",
  Indonesia: "ID",
  Ireland: "IE",
  "Isle of Man": "IM",
  Israel: "IL",
  Italy: "IT",
  "Ivory Coast": "CI",
  Jamaica: "JM",
  Japan: "JP",
  Jersey: "JE",
  Jordan: "JO",
  Kazakhstan: "KZ",
  Kenya: "KE",
  Kiribati: "KI",
  Kosovo: "XK",
  Kuwait: "KW",
  Laos: "LA",
  Latvia: "LV",
  Lesotho: "LS",
  Liechtenstein: "LI",
  Lithuania: "LT",
  Luxembourg: "LU",
  Macao: "MO",
  Madagascar: "MG",
  Malawi: "MW",
  Malaysia: "MY",
  Maldives: "MV",
  Mali: "ML",
  Malta: "MT",
  Martinique: "MQ",
  Mauritania: "MR",
  Mauritius: "MU",
  Mayotte: "YT",
  Mexico: "MX",
  Monaco: "MC",
  Mongolia: "MN",
  Montenegro: "ME",
  Montserrat: "MS",
  Morocco: "MA",
  Mosambique: "MZ",
  "Myanmar/Burma": "MM",
  Namibia: "NA",
  Nauru: "NR",
  Nepal: "NP",
  Netherlands: "NL",
  "Netherlands Antilles": "AN",
  "New Zealand": "NZ",
  Niger: "NE",
  Nigeria: "NG",
  "North Macedonia": "MK",
  Norway: "NO",
  Oman: "OM",
  Pakistan: "PK",
  Palau: "PW",
  Panama: "PA",
  Paraguay: "PY",
  Peru: "PE",
  Philippines: "PH",
  Poland: "PL",
  Portugal: "PT",
  Qatar: "QA",
  "Republic of Korea": "KR",
  Reunion: "RE",
  Romania: "RO",
  Rwanda: "RW",
  "Saint Kitts and Nevis/St. Christopher": "KN",
  "Saint Lucia": "LC",
  "Saint Martin": "MF",
  "Saint Pierre and Miquelon": "PM",
  "Saint Vincent and the Grenadines": "VC",
  "San Marino": "SM",
  "São Tomé and Príncipe": "ST",
  "Saudi Arabia": "SA",
  Senegal: "SN",
  Serbia: "RS",
  Seychelles: "SC",
  "Sierra Leone": "SL",
  Singapore: "SG",
  Slovakia: "SK",
  Slovenia: "SI",
  "Solomon Islands": "SB",
  "South Africa": "ZA",
  "South Korea": "KR",
  Spain: "ES",
  "Sri Lanka": "LK",
  "St. Helena": "SH",
  Suriname: "SR",
  Swaziland: "SZ",
  Sweden: "SE",
  Switzerland: "CH",
  Taiwan: "TW",
  Tajikistan: "TJ",
  Tanzania: "TZ",
  Thailand: "TH",
  "Timor-Leste": "TL",
  Togo: "TG",
  "Trinidad and Tobago": "TT",
  Tunisia: "TN",
  Turkey: "TR",
  Turkmenistan: "TM",
  "Turks And Caicos Islands": "TC",
  Uganda: "UG",
  "United Arab Emirates": "AE",
  "United Kingdom": "GB",
  "United States": "US",
  Uruguay: "UY",
  Usbekistan: "UZ",
  "Vatican City": "VA",
  Venezuela: "VE",
  Vietnam: "VN",
  "Wallis and Futuna": "WF",
  Zambia: "ZM",
  Zimbabwe: "ZW",
  // US-page name variants for countries also on the EU page or unique to the
  // US calculator. SC uses different spellings/abbreviations across pages.
  Brasil: "BR",
  "French Guiana": "GF",
  "French Polynesia": "PF",
  "Hong kong": "HK",
  "Macedonia, republic": "MK",
  Moldova: "MD",
  "New Caledonia": "NC",
  Réunion: "RE",
  "Saint Helena, Ascension and Tristan da Cunha": "SH",
  Tonga: "TO",
  "Turks and Caicos Islands": "TC",
  Vanuatu: "VU",
  Åland: "AX",
};

// Parse a row like "€0,01 and above€3,99" or "$0.01 and above$22.00".
function parseRow(text, currency) {
  const sym = currency === "EUR" ? "€" : "\\$";
  const re = new RegExp(`${sym}([\\d.,]+)\\s*and above\\s*${sym}([\\d.,]+)`);
  const m = text.match(re);
  if (!m) return null;
  // EU page uses "1.234,56", US page uses "1,234.56" — normalise to dot-decimal.
  const norm = (s) => {
    if (currency === "EUR") return parseFloat(s.replace(/\./g, "").replace(",", "."));
    return parseFloat(s.replace(/,/g, ""));
  };
  return { min: norm(m[1]), price: norm(m[2]) };
}

// Concurrent tabs per region. The bottleneck is per-country render waits, so
// more tabs ≈ faster, with diminishing returns past ~8. Override with
// SCRAPE_PARALLEL=N for tuning.
const PARALLEL_TABS = Math.max(1, Number(process.env.SCRAPE_PARALLEL) || 8);

const readBlocks = (page) =>
  page.evaluate(() => {
    const root = document.querySelector(".m-dc");
    if (!root) return { blocks: [], hash: "" };
    const elements = Array.from(root.querySelectorAll("*"));
    const blocks = [];
    for (let i = 0; i < elements.length; i++) {
      const txt = elements[i].textContent?.trim() || "";
      const m = txt.match(/^(?:Delivery method|Shipping type):\s*(.+?)\s*$/m);
      if (!m) continue;
      if (txt.split("\n").length > 4) continue;
      const label = m[1];
      let cursor = elements[i];
      let table = null;
      while (cursor && !table) {
        cursor = cursor.nextElementSibling || cursor.parentElement?.nextElementSibling;
        if (!cursor) break;
        if (cursor.tagName === "TABLE") table = cursor;
        else table = cursor.querySelector?.("table") || null;
      }
      if (!table) continue;
      const rows = Array.from(table.querySelectorAll("tr"))
        .map((r) => r.textContent?.replace(/\s+/g, " ").trim())
        .filter((t) => t && /and above/i.test(t));
      if (rows.length) blocks.push({ label, rows });
    }
    // Hash = concatenated label+row strings, used as a change signal for the
    // next country click. Avoids fixed-delay sleeps.
    const hash = blocks.map((b) => b.label + "|" + b.rows.join("|")).join("||");
    return { blocks, hash };
  });

async function preparePage(browser, region) {
  const page = await browser.newPage();
  await page.goto(region.url, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".m-dc__country.js-dc-dropdown", { timeout: 30_000 });
  // Wait for first table to render (calculator init signals readiness here).
  await page
    .waitForFunction(
      () => {
        const t = document.querySelector(".m-dc table");
        return t && /and above/i.test(t.textContent || "");
      },
      { timeout: 30_000 },
    )
    .catch(() => {});
  return page;
}

async function processCountry(page, name, currency, prevHash) {
  // Re-open the dropdown and click the matching item.
  await page.click(".m-dc__country.js-dc-dropdown");
  await page.evaluate((n) => {
    const li = Array.from(document.querySelectorAll(".m-dc__country li")).find(
      (l) => l.textContent?.trim() === n,
    );
    li?.click();
  }, name);
  // Wait for the rate table's content hash to differ from the previous one.
  // Times out fast — some countries genuinely render the same hash as the
  // previous (rare collision), so we proceed regardless after the timeout.
  await page
    .waitForFunction(
      (prev) => {
        const root = document.querySelector(".m-dc");
        if (!root) return false;
        const tables = root.querySelectorAll("table");
        if (tables.length === 0) return false;
        let h = "";
        for (const t of tables) {
          h += (t.textContent || "").replace(/\s+/g, " ").trim() + "||";
        }
        return h !== prev && h.length > 0;
      },
      prevHash,
      { timeout: 4_000 },
    )
    .catch(() => {});
  const { blocks, hash } = await readBlocks(page);
  const methods = blocks.map((b) => ({
    label: b.label,
    tiers: b.rows.map((r) => parseRow(r, currency)).filter(Boolean),
  }));
  return { methods, hash };
}

async function scrapeRegion(browser, region) {
  console.log(`[${region.code}] loading ${region.url}`);
  // Use one page to enumerate the country list.
  const seed = await preparePage(browser, region);
  await seed.click(".m-dc__country.js-dc-dropdown");
  const countries = await seed.$$eval(".m-dc__country li", (els) =>
    els.map((e) => e.textContent?.trim()).filter(Boolean),
  );
  await seed.close();
  console.log(`[${region.code}] ${countries.length} destinations`);

  // Split countries across N parallel pages.
  const slices = Array.from({ length: PARALLEL_TABS }, () => []);
  countries.forEach((c, i) => slices[i % PARALLEL_TABS].push(c));

  const all = new Array(countries.length);
  let done = 0;
  const lastLog = { t: Date.now() };

  await Promise.all(
    slices.map(async (slice, tabIdx) => {
      const page = await preparePage(browser, region);
      let prevHash = "";
      for (const name of slice) {
        const globalIdx = countries.indexOf(name);
        try {
          const { methods, hash } = await processCountry(page, name, region.currency, prevHash);
          prevHash = hash;
          all[globalIdx] = { name, iso: COUNTRY_TO_ISO[name] || "", methods };
        } catch (err) {
          all[globalIdx] = {
            name,
            iso: COUNTRY_TO_ISO[name] || "",
            methods: [],
            error: String(err).slice(0, 200),
          };
        }
        done++;
        if (Date.now() - lastLog.t > 2000) {
          lastLog.t = Date.now();
          console.log(`[${region.code}] ${done}/${countries.length} (tab ${tabIdx + 1}: ${name})`);
        }
      }
      await page.close();
    }),
  );

  console.log(`[${region.code}] ${done}/${countries.length} done`);
  return all;
}

function toCsv(rows) {
  const header = "region,country,iso,currency,method,min_cart,price";
  const esc = (s) => {
    const t = String(s ?? "");
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const body = rows
    .map((r) =>
      [r.region, r.country, r.iso, r.currency, r.method, r.min_cart, r.price].map(esc).join(","),
    )
    .join("\n");
  return header + "\n" + body + "\n";
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const all = {};
  try {
    for (const r of REGIONS) {
      all[r.code] = { region: r, results: await scrapeRegion(browser, r) };
    }
  } finally {
    await browser.close();
  }

  // CSV one row per (region, country, method, tier). Countries with no methods
  // detected at all still get a single empty row so they're visible.
  const csvRows = [];
  for (const code of Object.keys(all)) {
    const { region, results } = all[code];
    for (const r of results) {
      if (r.methods.length === 0) {
        csvRows.push({
          region: region.code,
          country: r.name,
          iso: r.iso,
          currency: region.currency,
          method: "",
          min_cart: "",
          price: "",
        });
        continue;
      }
      for (const m of r.methods) {
        for (const t of m.tiers) {
          csvRows.push({
            region: region.code,
            country: r.name,
            iso: r.iso,
            currency: region.currency,
            method: m.label,
            min_cart: t.min,
            price: t.price,
          });
        }
      }
    }
  }
  const csvPath = path.join(outDir, "shipping-rates.csv");
  await writeFile(csvPath, toCsv(csvRows), "utf8");

  // Sibling JSON keeps the raw structure for debugging or re-zoning.
  const jsonPath = path.join(outDir, "shipping-rates.json");
  await writeFile(jsonPath, JSON.stringify(all, null, 2), "utf8");

  const unmapped = csvRows.filter((r) => !r.iso).map((r) => r.country);
  const uniqueUnmapped = [...new Set(unmapped)];

  console.log(`\nWrote ${csvRows.length} rows to ${csvPath}`);
  console.log(`Wrote raw JSON to ${jsonPath}`);
  if (uniqueUnmapped.length) {
    console.log(
      `\n${uniqueUnmapped.length} country names without an ISO mapping (add to COUNTRY_TO_ISO if needed):`,
    );
    console.log("  " + uniqueUnmapped.join(", "));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
