/**
 * Web search — Tavily API (https://tavily.com).
 * goal.search: ตอบคำถามที่ต้องใช้ข้อมูลปัจจุบัน/นอกความจำภายใน.
 * Optional — ถ้าไม่มี TAVILY_API_KEY จะ return null แล้วให้ caller แจ้ง user แทน.
 */
import { env, hasWebSearch } from "@/lib/env";

export interface WebSearchResult {
  title: string;
  url: string;
  content: string;
}

export interface WebSearchAnswer {
  answer?: string;
  results: WebSearchResult[];
}

interface TavilyResponse {
  answer?: string;
  results: Array<{ title: string; url: string; content: string }>;
}

export async function webSearch(
  query: string,
  maxResults = 5,
): Promise<WebSearchAnswer | null> {
  if (!hasWebSearch()) return null;
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.TAVILY_API_KEY}`,
      },
      body: JSON.stringify({
        query,
        search_depth: "basic",
        include_answer: true,
        max_results: maxResults,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.warn("[search] tavily fetch failed", res.status);
      return null;
    }
    const data = (await res.json()) as TavilyResponse;
    return {
      answer: data.answer,
      results: (data.results ?? []).map((r) => ({
        title: r.title,
        url: r.url,
        content: r.content,
      })),
    };
  } catch (e) {
    console.warn("[search] tavily error", (e as Error).message);
    return null;
  }
}
