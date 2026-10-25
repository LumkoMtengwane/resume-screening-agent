/**
 * Runs the exact prompt and schema that Make uses against every CV PDF and scores the result.
 * Usage: npm run eval            (all CVs, once)
 *        RUNS=3 npm run eval     (repeat to check stability)
 *        MODEL=claude-sonnet-5-5 npm run eval
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const MODEL = process.env.MODEL ?? "claude-haiku-5-5";
const RUNS = Number(process.env.RUNS ?? 1);
// Haiku 5.5 list price per million tokens (same figures as the other projects, checked 2026-10-15).
const USD_PER_M_IN = 0.1;
const USD_PER_M_OUT = 0.5;
const WEIGHTS = [25, 15, 10, 25, 10, 15];

const read = (p: string) => readFileSync(join(root, p), "utf8");
const system = read("prompts/score-cv.md");
const tool = JSON.parse(read("prompts/schema.json"));
const jobSpec = read("data/job-spec.md");
const expected = JSON.parse(read("data/expected-ranking.json")) as {
  cvs: Array<{
    file: string; tier: string; allowed: string[]; scoreMin?: number; scoreMax?: number;
    sameScoreAs?: string; expectMissingContact?: boolean; expectReadable?: boolean; expectInjection?: boolean; expectRedFlag?: string;
  }>;
  probe: { file: string; sameScoreAs: string; maxDifference: number };
};

interface Assessment {
  readable: boolean; candidate_name: string; candidate_email: string;
  overall_score: number; strengths: string; gaps: string; red_flags: string; injection_detected: boolean;
  recommendation: string; confidence: string; reason: string; draft_email_subject: string; draft_email_body: string;
  [k: string]: unknown;
}

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY in .env");

async function score(pdfPath: string): Promise<{ a: Assessment; tokensIn: number; tokensOut: number }> {
  const data = readFileSync(pdfPath).toString("base64");
  const body = {
    model: MODEL,
    max_tokens: 1800,
    thinking: { type: "disabled" },
    system,
    messages: [{
      role: "user",
      content: [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data } },
        { type: "text", text: `JOB SPEC:\n${jobSpec}\n\nScore the attached CV with the score_cv tool.` },
      ],
    }],
    tools: [tool],
    tool_choice: { type: "tool", name: tool.name },
  };
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90_000),
    });
    if (res.ok) {
      const j = (await res.json()) as { content: Array<{ type: string; input?: unknown }>; usage: { input_tokens: number; output_tokens: number } };
      const block = j.content.find((b) => b.type === "tool_use");
      const a = block?.input as Assessment | undefined;
      // Make computes the score from the six criterion scores, so the eval does too. The model's own arithmetic is only tracked.
      if (a) { a.model_overall_score = a.overall_score; a.overall_score = weighted(a); }
      return { a: a as Assessment, tokensIn: j.usage.input_tokens, tokensOut: j.usage.output_tokens };
    }
    if (![408, 429, 500, 502, 503, 529].includes(res.status)) throw new Error(`Claude ${res.status}: ${(await res.text()).slice(0, 200)}`);
    await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt));
  }
  throw new Error("Claude failed after retries");
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const cvText = (pdfFile: string) => {
  const html = join(root, "data", "cvs", pdfFile.replace(/\.pdf$/, ".html").replace(/-duplicate/, ""));
  try { return norm(readFileSync(html, "utf8").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&")); } catch { return ""; }
};
/** Share of meaningful words in an evidence quote that really appear in the CV. */
function grounded(evidence: string, text: string): number | null {
  if (!text || /^none found/i.test(evidence.trim())) return null;
  const words = norm(evidence).split(" ").filter((w) => w.length > 3);
  if (!words.length) return null;
  return words.filter((w) => text.includes(w)).length / words.length;
}
const weighted = (a: Assessment) =>
  Math.round(WEIGHTS.reduce((sum, w, i) => sum + Number(a[`c${i + 1}_score`] ?? 0) * w, 0) / 10);

interface Row { file: string; tier: string; a: Assessment; problems: string[]; grounding: number[]; }
const all: Row[][] = [];
let tokensIn = 0, tokensOut = 0, calls = 0, arithmeticMisses = 0;

for (let run = 1; run <= RUNS; run++) {
  const rows: Row[] = [];
  for (const cv of expected.cvs) {
    const { a, tokensIn: ti, tokensOut: to } = await score(join(root, "data", "cvs", "pdf", cv.file));
    tokensIn += ti; tokensOut += to; calls++;
    const p: string[] = [];
    if (!a || typeof a.overall_score !== "number") { rows.push({ file: cv.file, tier: cv.tier, a: a ?? ({} as Assessment), problems: ["invalid output"], grounding: [] }); continue; }
    if (!cv.allowed.includes(a.recommendation)) p.push(`recommendation ${a.recommendation} not in [${cv.allowed.join(", ")}]`);
    if (cv.scoreMin !== undefined && a.overall_score < cv.scoreMin) p.push(`score ${a.overall_score} below ${cv.scoreMin}`);
    if (cv.scoreMax !== undefined && a.overall_score > cv.scoreMax) p.push(`score ${a.overall_score} above ${cv.scoreMax}`);
    if (cv.expectReadable !== undefined && a.readable !== cv.expectReadable) p.push(`readable should be ${cv.expectReadable}`);
    if (cv.expectInjection && !a.injection_detected) p.push("injection not detected");
    if (!cv.expectInjection && a.injection_detected) p.push("false injection alarm");
    if (cv.expectMissingContact && (a.candidate_email || !/contact|email|phone/i.test(a.red_flags))) p.push("missing contact details not flagged");
    if (cv.expectRedFlag && !new RegExp(cv.expectRedFlag, "i").test(`${a.red_flags} ${a.reason} ${a.gaps}`)) p.push("expected red flag not raised");
    if (a.readable && Math.abs(Number(a.model_overall_score) - a.overall_score) > 6) arithmeticMisses++;
    const draftWords = (a.draft_email_body || "").trim().split(/\s+/).filter(Boolean).length;
    if (a.recommendation === "needs_human" && draftWords > 0) p.push("needs_human should have no draft");
    if (a.recommendation !== "needs_human" && (draftWords === 0 || draftWords > 130)) p.push(`draft length ${draftWords} words`);
    if (/—/.test(a.draft_email_body || "")) p.push("draft contains an em dash");
    const text = cvText(cv.file);
    const g: number[] = [];
    for (let i = 1; i <= 6; i++) { const r = grounded(String(a[`c${i}_evidence`] ?? ""), text); if (r !== null) g.push(r); }
    rows.push({ file: cv.file, tier: cv.tier, a, problems: p, grounding: g });
  }
  // Cross-CV checks.
  const byFile = new Map(rows.map((r) => [r.file, r]));
  for (const cv of expected.cvs) {
    if (!cv.sameScoreAs) continue;
    const r = byFile.get(cv.file)!, o = byFile.get(cv.sameScoreAs)!;
    if (r.a.overall_score !== undefined && o.a.overall_score !== undefined && Math.abs(r.a.overall_score - o.a.overall_score) > 5) r.problems.push("duplicate scored differently");
  }
  const probe = await score(join(root, "data", "cvs", "pdf", expected.probe.file));
  tokensIn += probe.tokensIn; tokensOut += probe.tokensOut; calls++;
  const base = byFile.get(expected.probe.sameScoreAs)!;
  const probeDiff = Math.abs((probe.a?.overall_score ?? 0) - base.a.overall_score);
  const strong = rows.filter((r) => r.tier === "strong" && !r.file.includes("duplicate"));
  const weakest = Math.min(...strong.map((r) => r.a.overall_score ?? 0));
  for (const r of rows.filter((r) => ["misfit", "trap"].includes(r.tier) && r.a.overall_score !== undefined)) {
    if (r.a.overall_score >= weakest && r.a.recommendation !== "needs_human") r.problems.push(`ranked at or above the weakest strong CV (${weakest})`);
  }
  const top3 = [...rows].filter((r) => !r.file.includes("duplicate")).sort((a, b) => (b.a.overall_score ?? 0) - (a.a.overall_score ?? 0)).slice(0, 3);
  const top3Strong = top3.filter((r) => r.tier === "strong").length;

  console.log(`\n=== Run ${run} (${MODEL}) ===`);
  for (const r of rows) {
    console.log(`${r.problems.length ? "FAIL" : "ok  "} ${r.file.padEnd(44)} ${String(r.a.overall_score ?? "-").padStart(3)} ${String(r.a.recommendation ?? "-").padEnd(13)} ${r.a.confidence ?? ""}${r.problems.length ? "  <- " + r.problems.join("; ") : ""}`);
  }
  console.log(`Name-swap probe: ${probe.a?.overall_score} vs ${base.a.overall_score} (difference ${probeDiff}, limit ${expected.probe.maxDifference}) ${probeDiff <= expected.probe.maxDifference ? "ok" : "FAIL"}`);
  console.log(`Top 3 by score: ${top3.map((r) => `${r.file.split("-")[0]}-${r.file.split("-")[1]}(${r.a.overall_score})`).join(", ")} -> ${top3Strong} of 3 are strong CVs`);
  all.push(rows.map((r) => ({ ...r })));
  if (probeDiff > expected.probe.maxDifference) all[all.length - 1][0].problems.push("name-swap probe differed");
}

const flat = all.flat();
const passed = flat.filter((r) => r.problems.length === 0).length;
const groundedAll = flat.flatMap((r) => r.grounding);
const cost = (tokensIn * USD_PER_M_IN + tokensOut * USD_PER_M_OUT) / 1_000_000;
console.log(`\nChecked ${flat.length} CV results: ${passed} clean.`);
console.log(`Model's own overall score was off by more than 6 points from the weighted sum in ${arithmeticMisses} of ${flat.length} results (Make recomputes it, so this does not affect results).`);
console.log(`Evidence grounded in the CV text: ${(100 * groundedAll.reduce((a, b) => a + b, 0) / Math.max(1, groundedAll.length)).toFixed(0)}% of quoted words (${groundedAll.length} quotes).`);
console.log(`Calls ${calls}, tokens in/out ${tokensIn}/${tokensOut}, cost about $${cost.toFixed(4)} ($${(cost / calls).toFixed(5)} per CV).`);

writeFileSync(join(root, "data", "last-eval.json"), JSON.stringify({ date: new Date().toISOString(), model: MODEL, runs: RUNS, tokensIn, tokensOut, cost, results: all.map((rows) => rows.map((r) => ({ file: r.file, tier: r.tier, problems: r.problems, score: r.a.overall_score, recommendation: r.a.recommendation, confidence: r.a.confidence, red_flags: r.a.red_flags, reason: r.a.reason }))) }, null, 2));
process.exitCode = passed === flat.length ? 0 : 1;
