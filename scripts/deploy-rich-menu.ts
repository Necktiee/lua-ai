import { writeFileSync, readFileSync } from "node:fs";

const LINE_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN!;
const LIFF_ID = process.env.LIFF_ID!;
const IMG_PATH = process.argv[2];

async function main() {
  if (!IMG_PATH) throw new Error("usage: tsx deploy-rich-menu.ts <path-to-png>");
  const img = readFileSync(IMG_PATH);
  console.log(`[1/3] Loaded ${IMG_PATH} (${img.length} bytes)`);

  // Create rich menu object (4x2 grid, 2500x1686 full)
  console.log("[2/3] Creating rich menu object...");
  const cellW = 625, cellH = 843;
  const labels = [
    { label: "จด", text: "จด " },
    { label: "ค้น", text: "ค้น " },
    { label: "เตือน", text: "เตือน " },
    { label: "งานค้าง", text: "มีงานอะไรบ้าง" },
    { label: "ปฏิทิน", text: "ปฏิทินสัปดาห์นี้" },
    { label: "สรุปวัน", text: "สรุปวันนี้" },
    { label: "dashboard", liff: true },
    { label: "ช่วยเหลือ", text: "ช่วยเหลือ" },
  ];
  const areas = labels.map((c, i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const bounds = { x: col * cellW, y: row * cellH, width: cellW, height: cellH };
    if (c.liff) {
      return { bounds, action: { type: "uri", uri: `https://liff.line.me/${LIFF_ID}` } };
    }
    return { bounds, action: { type: "message", text: c.text } };
  });
  const menuBody = {
    size: { width: 2500, height: 1686 },
    name: "Hoshi main menu",
    chatBarText: "เมนูโฮชิ",
    selected: true,
    areas,
  };
  const createRes = await fetch("https://api.line.me/v2/bot/richmenu", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LINE_TOKEN}`,
    },
    body: JSON.stringify(menuBody),
  });
  if (!createRes.ok) {
    const t = await createRes.text();
    throw new Error(`create richmenu ${createRes.status}: ${t}`);
  }
  const { richMenuId } = await createRes.json();
  console.log("  -> richMenuId:", richMenuId);

  // Upload image
  console.log("[3/3] Uploading image + setting as default...");
  const upRes = await fetch(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, {
    method: "POST",
    headers: {
      "Content-Type": "image/png",
      Authorization: `Bearer ${LINE_TOKEN}`,
    },
    body: img,
  });
  if (!upRes.ok) {
    const t = await upRes.text();
    throw new Error(`upload image ${upRes.status}: ${t}`);
  }
  console.log("  -> uploaded");

  // Set as default rich menu
  const defRes = await fetch(`https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${LINE_TOKEN}` },
  });
  if (!defRes.ok) {
    const t = await defRes.text();
    throw new Error(`set default ${defRes.status}: ${t}`);
  }
  console.log("  -> set as default");

  console.log("\nDONE. Rich menu is live.");
  console.log("richMenuId:", richMenuId);
}

main().catch((e) => { console.error(e); process.exit(1); });
