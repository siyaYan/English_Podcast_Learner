export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");

  if (!date || !/^\d{6}$/.test(date)) {
    return Response.json({ error: "Invalid date parameter" }, { status: 400 });
  }

  const scriptUrl = `https://www.bbc.co.uk/learningenglish/english/features/6-minute-english/ep-${date}`;

  try {
    const res = await fetch(scriptUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-GB,en;q=0.9",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      return Response.json({ transcript: null, scriptUrl });
    }

    const html = await res.text();
    const transcript = extractTranscript(html);

    return Response.json({ transcript, scriptUrl });
  } catch (err) {
    return Response.json({ transcript: null, scriptUrl, error: err.message });
  }
}

function extractTranscript(html) {
  // Strategy 1: Next.js __NEXT_DATA__ embedded JSON
  const nextDataMatch = html.match(
    /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/,
  );
  if (nextDataMatch) {
    try {
      const json = JSON.parse(nextDataMatch[1]);
      const found = deepFind(json, [
        "script",
        "transcript",
        "scriptBody",
        "scriptText",
        "body",
      ]);
      if (found && typeof found === "string" && found.length > 300) {
        return cleanText(found);
      }
    } catch {
      // fall through
    }
  }

  // Strategy 2: BBC Learning English script div patterns
  const divPatterns = [
    /<div[^>]*class="[^"]*widget-bbcle-script__body[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*class="[^"]*widget-script[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i,
    /<div[^>]*id="script[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*class="[^"]*transcript[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
  ];

  for (const pattern of divPatterns) {
    const m = html.match(pattern);
    if (m) {
      const text = cleanHtml(m[1]);
      if (text.length > 300) return text;
    }
  }

  // Strategy 3: Dialogue blocks (e.g. "NEIL: Welcome to 6 Minute English…")
  const dialogueMatch = html.match(
    /((?:<p[^>]*>[A-Z]{2,}[^:<\n]{0,30}:[\s\S]{20,400}<\/p>\s*){4,})/,
  );
  if (dialogueMatch) {
    const text = cleanHtml(dialogueMatch[1]);
    if (text.length > 300) return text;
  }

  return null;
}

function deepFind(obj, keys) {
  if (!obj || typeof obj !== "object") return null;
  for (const key of keys) {
    if (obj[key] && typeof obj[key] === "string") return obj[key];
  }
  for (const value of Object.values(obj)) {
    if (value && typeof value === "object") {
      const found = deepFind(value, keys);
      if (found) return found;
    }
  }
  return null;
}

function cleanHtml(html) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<p[^>]*>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanText(text) {
  return text.replace(/\n{3,}/g, "\n\n").trim();
}
