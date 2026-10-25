// Builds the JSON body for Make's HTTP "Make a request" module from the tested prompt, schema and job spec.
// Output: blueprint/http-body.json. The PDF placeholder is a Make expression: adjust the module number if yours differs.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const tool = JSON.parse(read("prompts/schema.json"));
const PDF_EXPRESSION = process.env.PDF_EXPRESSION ?? "{{base64(2.data)}}";

const body = {
  model: "claude-haiku-5-5",
  max_tokens: 1800,
  thinking: { type: "disabled" },
  system: read("prompts/score-cv.md"),
  messages: [
    {
      role: "user",
      content: [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: PDF_EXPRESSION } },
        { type: "text", text: `JOB SPEC:\n${read("data/job-spec.md")}\n\nScore the attached CV with the score_cv tool.` },
      ],
    },
  ],
  tools: [tool],
  tool_choice: { type: "tool", name: tool.name },
};

const text = JSON.stringify(body);
if (text.includes("{{") && text.split("{{").length !== 2) throw new Error("Unexpected {{ in the body: Make would treat it as an expression.");
writeFileSync(join(root, "blueprint", "http-body.json"), text);
console.log(`Wrote blueprint/http-body.json (${text.length} characters) with PDF expression ${PDF_EXPRESSION}`);
