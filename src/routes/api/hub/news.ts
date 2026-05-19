import { createFileRoute } from "@tanstack/react-router";

type NewsItem = {
  source: string;
  tag: string;
  importance: string;
  time: string;
  metric: string;
  title: string;
  summary: string;
  url: string;
  rank: number;
  dateRank: number;
};

let cache: { at: number; data: NewsItem[] } | null = null;
const TTL_MS = 10 * 60 * 1000;

function relTime(unix: number) {
  const diff = Date.now() / 1000 - unix;
  if (diff < 3600) return `${Math.max(1, Math.round(diff / 60))}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  if (diff < 86400 * 2) return "Today";
  return `${Math.round(diff / 86400)}d ago`;
}

function hostname(u: string) {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "Web";
  }
}

type Hit = {
  title?: string;
  story_title?: string;
  url?: string;
  story_url?: string;
  points?: number;
  num_comments?: number;
  created_at_i?: number;
  objectID: string;
};

const KW = /\b(ai|llm|gpt|claude|anthropic|openai|gemini|mistral|llama|grok|deepseek|agent|agentic|rag|diffusion|stable diffusion|midjourney|sora|copilot|huggingface|transformer|ml model|neural)\b/i;

async function fetchHits(url: string): Promise<Hit[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HN ${res.status}`);
  const json = (await res.json()) as { hits: Hit[] };
  return json.hits || [];
}

async function fetchNews(): Promise<NewsItem[]> {
  // Pull recent stories by date AND by relevance, then merge + dedupe.
  const queries = [
    "AI",
    "LLM",
    "GPT",
    "OpenAI",
    "Anthropic",
    "Gemini",
    "agent",
  ];
  const urls = [
    // Recent by date, lower bar
    ...queries.map(
      (q) =>
        `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(q)}&tags=story&numericFilters=points>10&hitsPerPage=30`,
    ),
    // Popular recent
    `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent("AI OR LLM OR GPT OR OpenAI OR Anthropic OR Gemini")}&tags=story&numericFilters=points>30&hitsPerPage=50`,
  ];

  const all: Hit[] = [];
  const results = await Promise.allSettled(urls.map(fetchHits));
  for (const r of results) if (r.status === "fulfilled") all.push(...r.value);

  const seen = new Set<string>();
  const items: NewsItem[] = [];
  for (const h of all) {
    if (seen.has(h.objectID)) continue;
    seen.add(h.objectID);
    const title = h.title || h.story_title || "";
    if (!title || !KW.test(title)) continue;
    const link =
      h.url || h.story_url || `https://news.ycombinator.com/item?id=${h.objectID}`;
    const pts = h.points ?? 0;
    const created = h.created_at_i ?? Date.now() / 1000;
    items.push({
      source: hostname(link),
      tag: "AI",
      importance: pts >= 200 ? "Critical" : "High",
      time: relTime(created),
      metric: `${pts} pts · ${h.num_comments ?? 0} comments`,
      title,
      summary: "",
      url: link,
      rank: pts,
      dateRank: created,
    });
  }

  items.sort((a, b) => b.dateRank - a.dateRank);
  return items.slice(0, 20);
}

export const Route = createFileRoute("/api/hub/news")({
  server: {
    handlers: {
      GET: async () => {
        try {
          if (!cache || Date.now() - cache.at > TTL_MS) {
            cache = { at: Date.now(), data: await fetchNews() };
          }
          return Response.json(
            { ok: true, refreshedAt: cache.at, data: cache.data },
            { headers: { "Cache-Control": "public, max-age=300" } },
          );
        } catch (e) {
          return Response.json(
            { ok: false, error: e instanceof Error ? e.message : "fetch failed" },
            { status: 502 },
          );
        }
      },
    },
  },
});
