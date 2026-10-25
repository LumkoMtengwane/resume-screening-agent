// Renders data/cvs/*.html to PDFs with headless Edge (no extra dependencies).
// Files with "scanned" in the name become image-only PDFs. Also writes probe and duplicate variants.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cvDir = join(root, "data", "cvs");
const pdfDir = join(cvDir, "pdf");
const probeDir = join(root, "data", "probes");
const tmp = join(root, "data", ".tmp");
for (const d of [pdfDir, probeDir, tmp]) mkdirSync(d, { recursive: true });

const edge = ["C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"].find(existsSync);
if (!edge) throw new Error("Microsoft Edge not found. Install Edge or Chrome and adjust the path in make-cvs.mjs.");

const run = (args) => execFileSync(edge, ["--headless=new", "--disable-gpu", "--no-sandbox", ...args], { stdio: "ignore", timeout: 60_000 });
// Edge sometimes writes nothing when started right after another headless run, so retry.
const pdf = (htmlPath, outPath) => {
  for (let attempt = 1; attempt <= 3; attempt++) {
    run(["--no-pdf-header-footer", `--print-to-pdf=${outPath}`, pathToFileURL(htmlPath).href]);
    if (existsSync(outPath)) return;
  }
  throw new Error(`PDF was not written: ${outPath}`);
};

for (const f of readdirSync(cvDir).filter((n) => n.endsWith(".html") && n !== "probe-source.html")) {
  const src = join(cvDir, f);
  const out = join(pdfDir, f.replace(/\.html$/, ".pdf"));
  if (f.includes("scanned")) {
    const png = join(tmp, f.replace(/\.html$/, ".png"));
    run(["--hide-scrollbars", "--force-device-scale-factor=1.5", "--window-size=820,1060", "--virtual-time-budget=4000", `--screenshot=${png}`, pathToFileURL(src).href]);
    if (!existsSync(png)) throw new Error(`Screenshot was not written for ${f}`);
    const wrap = join(tmp, "scan.html");
    const b64 = readFileSync(png).toString("base64");
    writeFileSync(wrap, `<!doctype html><html><body style="margin:0"><img src="data:image/png;base64,${b64}" style="width:100%"></body></html>`);
    pdf(wrap, out);
  } else {
    pdf(src, out);
  }
  console.log("PDF:", out.replace(root, "."));
}

// Duplicate application: the same CV sent twice (tests idempotency in Make).
copyFileSync(join(pdfDir, "strong-2-jordan-pieterse.pdf"), join(pdfDir, "strong-2-jordan-pieterse-duplicate.pdf"));

// Name-swap probes: identical content, different name and email. Used by the fairness check (npm run fairness).
const probes = [
  ["Lindiwe Mokoena", "lindiwe.mokoena@", "lmokoena", "lindiwe-mokoena"],
  ["Thabo Nkosi", "thabo.nkosi@", "tnkosi", "thabo-nkosi"],
  ["Sarah Pieterse", "sarah.pieterse@", "spieterse", "sarah-pieterse"],
  ["Ahmed Hassan", "ahmed.hassan@", "ahassan", "ahmed-hassan"],
];
const original = readFileSync(join(cvDir, "strong-2-jordan-pieterse.html"), "utf8");
const probeSrc = join(cvDir, "probe-source.html");
for (const [name, email, handle, slug] of probes) {
  writeFileSync(probeSrc, original.replaceAll("Jordan Pieterse", name).replaceAll("jordan.pieterse@", email).replaceAll("jpieterse", handle));
  pdf(probeSrc, join(probeDir, `probe-strong-2-${slug}.pdf`));
}
import("node:fs").then(({ rmSync }) => rmSync(probeSrc));
console.log("Probes and duplicate written.");
