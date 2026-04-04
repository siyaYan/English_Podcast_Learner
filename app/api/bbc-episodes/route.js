export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const LISTING_URL =
  "https://www.bbc.co.uk/learningenglish/english/features/6-minute-english";
const RSS_URL =
  "https://www.bbc.co.uk/programmes/p02pc9zn/episodes/downloads.rss";

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-GB,en;q=0.9",
};

export async function GET() {
  try {
    // Fetch listing page and RSS in parallel
    const [listingRes, rssRes] = await Promise.all([
      fetch(LISTING_URL, { headers: BROWSER_HEADERS, cache: "no-store" }),
      fetch(RSS_URL, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; EnglishPodcastLearner/1.0)",
          Accept: "application/rss+xml, application/xml, text/xml, */*",
        },
        cache: "no-store",
      }),
    ]);

    // Extract real episode URLs from the BBC Learning English listing page
    let listingUrls = [];
    if (listingRes.ok) {
      const html = await listingRes.text();
      listingUrls = extractEpisodeUrls(html, 12);
    }

    // Extract episode titles and dates from the RSS feed
    let rssItems = [];
    if (rssRes.ok) {
      const xml = await rssRes.text();
      rssItems = parseRss(xml, 12);
    }

    // Merge: prefer real URLs from listing page; match RSS titles by date
    const episodes = mergeEpisodes(listingUrls, rssItems, 10);

    if (episodes.length === 0) {
      return Response.json(
        { error: "Could not load episodes from BBC Learning English." },
        { status: 502 },
      );
    }

    return Response.json({ episodes });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

// ── Listing page parsing ──────────────────────────────────────────────────────

function extractEpisodeUrls(html, limit) {
  const results = [];
  const seen = new Set();

  // Strategy 1: look for ep-YYMMDD hrefs directly in the HTML
  const hrefPattern =
    /href="(\/learningenglish\/english\/features\/6-minute-english\/ep-(\d{6})[^"]*)"/gi;
  let m;
  while ((m = hrefPattern.exec(html)) !== null && results.length < limit) {
    const date = m[2];
    if (!seen.has(date)) {
      seen.add(date);
      results.push({
        date,
        scriptUrl: `https://www.bbc.co.uk/learningenglish/english/features/6-minute-english/ep-${date}`,
      });
    }
  }

  if (results.length > 0) return results;

  // Strategy 2: look inside __NEXT_DATA__ JSON
  const nextData = html.match(
    /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/,
  );
  if (nextData) {
    try {
      const json = JSON.parse(nextData[1]);
      const urls = [];
      collectEpUrls(json, urls);
      for (const url of urls) {
        if (results.length >= limit) break;
        const dateMatch = url.match(/ep-(\d{6})/);
        if (dateMatch && !seen.has(dateMatch[1])) {
          seen.add(dateMatch[1]);
          results.push({
            date: dateMatch[1],
            scriptUrl: url.startsWith("http")
              ? url
              : `https://www.bbc.co.uk${url}`,
          });
        }
      }
    } catch {
      // ignore JSON parse errors
    }
  }

  return results;
}

function collectEpUrls(obj, acc) {
  if (!obj || typeof obj !== "object") return;
  if (typeof obj === "string") {
    if (/\/learningenglish\/.*\/ep-\d{6}/.test(obj)) acc.push(obj);
    return;
  }
  for (const val of Object.values(obj)) {
    if (typeof val === "string" && /\/learningenglish\/.*\/ep-\d{6}/.test(val)) {
      acc.push(val);
    } else if (val && typeof val === "object") {
      collectEpUrls(val, acc);
    }
  }
}

// ── RSS parsing ───────────────────────────────────────────────────────────────

function parseRss(xml, limit) {
  const results = [];
  const itemPattern = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemPattern.exec(xml)) !== null && results.length < limit) {
    const item = match[1];
    const title = getTagText(item, "title");
    const pubDate = getTagText(item, "pubDate");

    if (!title) continue;

    results.push({
      title: decodeEntities(title),
      pubDate: pubDate || "",
      date: pubDateToYymmdd(pubDate),
    });
  }

  return results;
}

// ── Merge listing URLs with RSS titles ────────────────────────────────────────

function mergeEpisodes(listingUrls, rssItems, limit) {
  const episodes = [];

  // If we have real listing URLs, use them as the source of truth
  if (listingUrls.length > 0) {
    for (const { date, scriptUrl } of listingUrls.slice(0, limit)) {
      const rssMatch = rssItems.find((r) => r.date === date);
      episodes.push({
        title: rssMatch?.title ?? `6 Minute English (${formatDate(date)})`,
        pubDate: rssMatch?.pubDate ?? "",
        date,
        scriptUrl,
      });
    }
    return episodes;
  }

  // Fallback: use RSS only, construct URL from date (less reliable)
  for (const item of rssItems.slice(0, limit)) {
    episodes.push({
      title: item.title,
      pubDate: item.pubDate,
      date: item.date,
      scriptUrl: item.date
        ? `https://www.bbc.co.uk/learningenglish/english/features/6-minute-english/ep-${item.date}`
        : null,
    });
  }

  return episodes;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getTagText(xml, tag) {
  const re = new RegExp(
    `<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`,
    "i",
  );
  const m = xml.match(re);
  if (!m) return "";
  return (m[1] ?? m[2] ?? "").trim();
}

function pubDateToYymmdd(pubDate) {
  if (!pubDate) return null;
  const d = new Date(pubDate);
  if (isNaN(d.getTime())) return null;
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
}

function formatDate(yymmdd) {
  if (!yymmdd || yymmdd.length !== 6) return yymmdd;
  const yy = yymmdd.slice(0, 2);
  const mm = yymmdd.slice(2, 4);
  const dd = yymmdd.slice(4, 6);
  return `${dd}/${mm}/20${yy}`;
}

function decodeEntities(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}
