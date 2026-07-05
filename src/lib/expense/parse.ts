/**
 * Expense + Subscription parser.
 * "ซื้อกาแฟ 85" → { amount: 85, category: "food", description: "กาแฟ" }
 * "สมัคร Netflix 199/เดือน" → { name: "Netflix", amount: 199, billingCycle: "monthly" }
 */
import { chat } from "@/lib/llm/pool";

export interface ParsedExpense {
  amount: number;
  category: string;
  description?: string;
}

const VALID_CATEGORIES = [
  "food", "drink", "transport", "shopping", "entertainment",
  "bills", "health", "education", "travel", "office", "other",
];

export async function parseExpense(text: string): Promise<ParsedExpense | null> {
  const res = await chat({
    messages: [
      {
        role: "system",
        content: `แยกข้อมูลค่าใช้จ่ายจากข้อความไทย เป็น JSON:
{"amount": number, "category": "food|drink|transport|shopping|entertainment|bills|health|education|travel|office|other", "description": "คำอธิบายสั้น หรือ null"}
- amount เป็นตัวเลขเท่านั้น (ไม่มี "บาท")
- category เลือกจากรายการข้างต้น
- ถ้าไม่มีตัวเลขเงิน ตอบ {"error": true}`,
      },
      { role: "user", content: text },
    ],
    options: { lite: true, temperature: 0, maxOutputTokens: 150 },
  });

  try {
    const parsed = JSON.parse(res.text.replace(/```json|```/g, "").trim());
    if (parsed.error) return null;
    const amount = Number(parsed.amount);
    if (!Number.isFinite(amount) || amount < 0) return null;
    const category = VALID_CATEGORIES.includes(parsed.category) ? parsed.category : "other";
    const description = typeof parsed.description === "string" && parsed.description !== "null"
      ? parsed.description
      : undefined;
    return { amount, category, description };
  } catch {
    return null;
  }
}

export interface ParsedSubscription {
  name: string;
  amount: number;
  billingCycle: "monthly" | "yearly" | "weekly";
}

export async function parseSubscription(text: string): Promise<ParsedSubscription | null> {
  const res = await chat({
    messages: [
      {
        role: "system",
        content: `แยกข้อมูล subscription จากข้อความไทย เป็น JSON:
{"name": "ชื่อ service", "amount": number, "cycle": "monthly|yearly|weekly"}
- amount เป็นตัวเลขเท่านั้น
- ถ้าไม่ระบุ cycle ให้ default "monthly"
- ถ้าไม่มีตัวเลข ตอบ {"error": true}`,
      },
      { role: "user", content: text },
    ],
    options: { lite: true, temperature: 0, maxOutputTokens: 150 },
  });

  try {
    const parsed = JSON.parse(res.text.replace(/```json|```/g, "").trim());
    if (parsed.error) return null;
    const amount = Number(parsed.amount);
    if (!Number.isFinite(amount) || amount < 0) return null;
    const cycle = ["monthly", "yearly", "weekly"].includes(parsed.cycle) ? parsed.cycle : "monthly";
    const name = typeof parsed.name === "string" && parsed.name.trim() ? parsed.name.trim() : "Unknown";
    return { name, amount, billingCycle: cycle };
  } catch {
    return null;
  }
}
