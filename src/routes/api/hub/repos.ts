import { createFileRoute } from "@tanstack/react-router";

type Repo = [string, string, string, string]; // [name, category, description, url]

let cache: { at: number; data: Repo[] } | null = null;
const TTL_MS = 10 * 60 * 1000;

function categorize(topics: string[], desc: string): string {
  const t = topics.map((x) => x.toLowerCase());
  const d = (desc || "").toLowerCase();
  const hit = (k: string) => t.includes(k) || d.includes(k);
  if (hit("agent") || hit("agents")) return "Agents";
  if (hit("rag") || hit("retrieval")) return "RAG";
  if (hit("llm") || hit("language-model")) return "LLM";
  if (hit("ollama") || hit("llama") || hit("local")) return "Local LLM";
  if (hit("image") || hit("diffusion") || hit("stable-diffusion")) return "Image";
  if (hit("video")) return "Video";
  if (hit("voice") || hit("speech") || hit("tts")) return "Voice";
  if (hit("framework")) return "Framework";
  if (hit("dataset")) return "Dataset";
  return "AI";
}

async function fetchRepos(): Promise<Repo[]> {
  // GitHub search: AI-tagged repos pushed recently, sorted by stars
  const since = new Date(Date.now() - 30 * 86400 * 1000).toISOString().slice(0, 10);
  const q = encodeURIComponent(`topic:ai pushed:>${since}`);
  const url = `https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=20`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "emmayg-portfolio",
    },
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  const json = (await res.json()) as {
    items: Array<{
      name: string;
      full_name: string;
      description: string | null;
      html_url: string;
      topics?: string[];
    }>;
  };
  return json.items.slice(0, 20).map((r) => [
    r.name,
    categorize(r.topics ?? [], r.description ?? ""),
    r.description ?? r.full_name,
    r.html_url,
  ]);
}

export const Route = createFileRoute("/api/hub/repos")({
  server: {
    handlers: {
      GET: async () => {
        try {
          if (!cache || Date.now() - cache.at > TTL_MS) {
            cache = { at: Date.now(), data: await fetchRepos() };
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
