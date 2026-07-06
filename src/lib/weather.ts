/**
 * Weather — OpenWeatherMap free API (5-day/3-hour forecast).
 * Optional; briefing skips weather if no API key.
 */
import { env } from "@/lib/env";

export interface WeatherInfo {
  tempC: number;
  description: string;
  rainChance?: number;
}

interface OWResponse {
  list: Array<{
    dt: number;
    main: { temp: number };
    weather: Array<{ description: string; main: string }>;
    pop?: number;
  }>;
}

export async function getTodayWeather(locationOverride?: string): Promise<WeatherInfo | null> {
  if (!env.OPENWEATHER_API_KEY) return null;
  const loc = locationOverride || env.WEATHER_LOCATION;
  const url = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(loc)}&units=metric&appid=${env.OPENWEATHER_API_KEY}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) {
      console.warn("[weather] fetch failed", res.status);
      return null;
    }
    const data = (await res.json()) as OWResponse;
    // pick entry closest to now
    const now = Date.now() / 1000;
    const closest = data.list.reduce((best, cur) =>
      Math.abs(cur.dt - now) < Math.abs(best.dt - now) ? cur : best,
    );
    const afternoon = data.list.find((e) => {
      // Must check the hour in Thailand's timezone, not the server's local
      // time (Vercel runs UTC — UTC 14-18 is actually 21:00-01:00 in
      // Thailand, i.e. late night, not afternoon at all).
      const h = Number(
        new Intl.DateTimeFormat("en-GB", {
          timeZone: "Asia/Bangkok",
          hour: "2-digit",
          hour12: false,
        }).format(new Date(e.dt * 1000)),
      );
      return h >= 14 && h <= 18;
    });
    const rainChance = afternoon?.pop !== undefined ? Math.round(afternoon.pop * 100) : undefined;
    return {
      tempC: Math.round(closest.main.temp),
      description: closest.weather[0]?.description ?? "",
      rainChance,
    };
  } catch (e) {
    console.warn("[weather]", (e as Error).message);
    return null;
  }
}

const THAI_WEATHER: Record<string, string> = {
  "clear sky": "ท้องฟ้าแจ่มใส",
  "few clouds": "เมฆบางส่วน",
  "scattered clouds": "เมฆกระจาย",
  "broken clouds": "เมฆมาก",
  "overcast clouds": "เมฆปกคลุม",
  "light rain": "ฝนตกเล็กน้อย",
  "moderate rain": "ฝนปานกลาง",
  "heavy rain": "ฝนตกหนัก",
  thunderstorm: "พายุฝนฟ้าคะนอง",
  mist: "หมอกบาง",
  fog: "หมอกหนา",
  haze: "หมอกควัน",
};

export function weatherToThai(desc: string): string {
  const lower = desc.toLowerCase();
  return THAI_WEATHER[lower] ?? desc;
}
