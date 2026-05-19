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

async function fetchNews(): Promise<NewsItem[]> {
  // HN Algolia: recent AI/LLM stories with traction
  const q = encodeURIComponent("AI OR LLM OR GPT OR Anthropic OR OpenAI OR Gemini");
  const url = `https://hn.algolia.com/api/v1/search?query=${q}&tags=story&numericFilters=points>50&hitsPerPage=30`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HN ${res.status}`);
  const json = (await res.json()) as {
    hits: Array<{
      title?: string;
      story_title?: string;
      url?: string;
      story_url?: string;
      points?: number;
      num_comments?: number;
      created_at_i?: number;
      objectID: string;
    }>;
  };
  const items: NewsItem[] = json.hits
    .map((h) => {
      const title = h.title || h.story_title || "";
      const link =
        h.url || h.story_url || `https://news.ycombinator.com/item?id=${h.objectID}`;
      const pts = h.points ?? 0;
      const created = h.created_at_i ?? Date.now() / 1000;
      return {
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
      } satisfies NewsItem;
    })
    .filter((n) => n.title && n.url)
    .sort((a, b) => b.dateRank - a.dateRank)
    .slice(0, 20);
  return items;
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
