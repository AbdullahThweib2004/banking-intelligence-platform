#!/usr/bin/env node
// ===========================================================================
// Ingest the local policy markdown files into Supabase pgvector (policy_chunks).
//
// For each `## English | Arabic` section it stores both languages and a single
// multilingual embedding (combined EN+AR text), then upserts by
// (file_name, section_title_en).
//
// Required environment variables (e.g. in .env, run with --env-file=.env):
//   SUPABASE_URL                  (or VITE_SUPABASE_URL)
//   SUPABASE_SERVICE_ROLE_KEY     (service role key — never commit this)
//   OPENAI_API_KEY                (for embeddings)
//   EMBEDDING_MODEL               (optional, default: text-embedding-3-small)
//
// Run:
//   node --env-file=.env scripts/ingest-policies.mjs
//   (or: npm run ingest:policies   after exporting the env vars)
// ===========================================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const POLICIES_DIR = path.resolve(__dirname, "../src/data/policies");
const FILES = [
  "loan-policy.md",
  "account-opening-policy.md",
  "customer-service-guidelines.md",
];

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL ?? "text-embedding-3-small";

function fail(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

if (!SUPABASE_URL) fail("Missing SUPABASE_URL (or VITE_SUPABASE_URL).");
if (!SERVICE_ROLE) fail("Missing SUPABASE_SERVICE_ROLE_KEY.");
if (!OPENAI_API_KEY) fail("Missing OPENAI_API_KEY.");

const ARABIC_CHAR = /[\u0600-\u06FF]/;

// Parse one markdown file into section chunks carrying both languages.
function parseFile(fileName, content) {
  const lines = content.split("\n");
  const chunks = [];
  let titleEn = null;
  let titleAr = null;
  let lang = null;
  let en = [];
  let ar = [];

  const flush = () => {
    if (titleEn && (en.join("").trim() || ar.join("").trim())) {
      chunks.push({
        file_name: fileName,
        section_title_en: titleEn,
        section_title_ar: titleAr || titleEn,
        content_en: en.join("\n").trim(),
        content_ar: ar.join("\n").trim(),
      });
    }
    en = [];
    ar = [];
    lang = null;
  };

  for (const line of lines) {
    const sectionMatch = line.match(/^##\s+(.*)$/);
    if (sectionMatch) {
      flush();
      const [a, b] = sectionMatch[1].split("|").map((s) => s.trim());
      titleEn = a;
      titleAr = b || a;
      continue;
    }
    const langMatch = line.match(/^###\s+(.*)$/);
    if (langMatch) {
      lang = ARABIC_CHAR.test(langMatch[1]) ? "ar" : "en";
      continue;
    }
    if (/^#\s+/.test(line)) continue;
    if (lang === "ar") ar.push(line);
    else if (lang === "en") en.push(line);
  }
  flush();
  return chunks;
}

async function embed(text) {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: text }),
  });
  if (!res.ok) {
    throw new Error(`Embedding failed (${res.status}): ${await res.text()}`);
  }
  const data = await res.json();
  return data.data[0].embedding;
}

async function main() {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  let allChunks = [];
  for (const fileName of FILES) {
    const full = path.join(POLICIES_DIR, fileName);
    const content = fs.readFileSync(full, "utf8");
    const chunks = parseFile(fileName, content);
    console.log(`  parsed ${chunks.length} sections from ${fileName}`);
    allChunks = allChunks.concat(chunks);
  }

  console.log(`\nEmbedding ${allChunks.length} chunks with ${EMBEDDING_MODEL}...`);

  const rows = [];
  for (const chunk of allChunks) {
    // Combine both languages so a single embedding serves EN and AR queries.
    const combined = [
      chunk.section_title_en,
      chunk.content_en,
      chunk.section_title_ar,
      chunk.content_ar,
    ].join("\n\n");
    const embedding = await embed(combined);
    rows.push({ ...chunk, embedding });
    console.log(`  ✓ ${chunk.file_name} → ${chunk.section_title_en}`);
  }

  console.log(`\nUpserting ${rows.length} rows into policy_chunks...`);
  const { error } = await supabase
    .from("policy_chunks")
    .upsert(rows, { onConflict: "file_name,section_title_en" });

  if (error) fail(`Upsert failed: ${error.message}`);

  console.log(`\n✓ Done. Ingested ${rows.length} policy chunks.\n`);
}

main().catch((err) => fail(err.message));
