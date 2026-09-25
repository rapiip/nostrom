/**
 * Pre-publish secret scan. Reads every STAGED file and flags anything that looks
 * like a credential. Run before pushing to a public remote.
 *
 *   node scan-secrets.cjs
 */
const { execSync } = require("node:child_process");
const fs = require("node:fs");

const files = execSync("git diff --cached --name-only", { encoding: "utf8" })
  .split("\n")
  .map((f) => f.trim())
  .filter(Boolean);

// Hardhat's default mnemonic accounts are publicly documented and appear in test
// fixtures by design. Flagging them would be noise, but list them so a reviewer
// can see they were considered rather than missed.
const KNOWN_PUBLIC_TEST_KEYS = [
  "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  "59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  "test test test test test test test test test test test junk",
];

const PATTERNS = [
  { name: "raw 32-byte private key", re: /\b(0x)?[0-9a-fA-F]{64}\b/g },
  { name: "assigned PRIVATE_KEY", re: /PRIVATE_KEY\s*[=:]\s*["']?[0-9a-zA-Z]{20,}/g },
  { name: "AWS access key id", re: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: "generic api/secret assignment", re: /(api[_-]?key|secret|token)\s*[=:]\s*["'][0-9a-zA-Z\-_]{24,}["']/gi },
  { name: "PEM private key block", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { name: "Infura/Alchemy style url key", re: /(infura|alchemyapi)\.io\/v\d\/[0-9a-zA-Z]{20,}/gi },
];

/**
 * BIP-39 mnemonics need their own check rather than a regex.
 *
 * "any 12+ consecutive lowercase words" matches ordinary English prose; the
 * first version of this scanner flagged eight passages of documentation. A real
 * seed phrase sits on ONE line, has exactly 12/15/18/21/24 words, every word is
 * 3-8 lowercase letters, and it contains none of the function words that make
 * prose prose.
 */
const PROSE_MARKERS = new Set([
  "the", "and", "that", "this", "with", "from", "have", "has", "had", "would",
  "could", "should", "which", "because", "been", "were", "was", "are", "not",
  "but", "for", "its", "their", "there", "than", "then", "when", "what", "who",
  "how", "why", "into", "onto", "out", "off", "over", "under", "one", "two",
  "you", "your", "they", "them", "our", "his", "her", "him", "she", "these",
  "those", "some", "any", "all", "both", "each", "more", "most", "other",
  "such", "only", "own", "same", "too", "very", "can", "will", "just", "now",
  "also", "does", "did", "doing", "done", "make", "makes", "made", "take",
  "takes", "taken", "means", "means", "before", "after", "while", "still",
]);

function findMnemonics(content) {
  const hits = [];
  for (const line of content.split("\n")) {
    const words = line.trim().toLowerCase().match(/\b[a-z]{3,8}\b/g);
    if (!words) continue;
    if (![12, 15, 18, 21, 24].includes(words.length)) continue;
    // A seed phrase is words and nothing else.
    if (!/^[a-z\s]+$/.test(line.trim().toLowerCase())) continue;
    if (words.some((w) => PROSE_MARKERS.has(w))) continue;
    hits.push(line.trim().slice(0, 72));
  }
  return hits;
}

let findings = 0;
let benign = 0;

for (const file of files) {
  if (!fs.existsSync(file)) continue;
  const stat = fs.statSync(file);
  if (stat.size > 3_000_000) continue; // lockfiles etc.

  let content;
  try {
    content = fs.readFileSync(file, "utf8");
  } catch {
    continue;
  }

  for (const hit of findMnemonics(content)) {
    if (KNOWN_PUBLIC_TEST_KEYS.some((k) => hit.includes(k))) {
      benign++;
      continue;
    }
    findings++;
    console.log(`  ${file}\n    [BIP-39 mnemonic] ${hit}`);
  }

  for (const { name, re } of PATTERNS) {
    const matches = content.match(re);
    if (!matches) continue;

    for (const m of new Set(matches)) {
      const normalised = m.replace(/^0x/, "").toLowerCase();
      if (KNOWN_PUBLIC_TEST_KEYS.some((k) => normalised.includes(k) || m.includes(k))) {
        benign++;
        continue;
      }
      // Solidity/JS hex constants and keccak hashes are 64 hex chars too. Only
      // treat them as suspicious in env-ish or config contexts.
      if (name === "raw 32-byte private key") {
        const line = content.split("\n").find((l) => l.includes(m)) ?? "";
        if (!/key|secret|mnemonic|seed|PRIVATE/i.test(line)) {
          benign++;
          continue;
        }
      }
      findings++;
      console.log(`  ${file}\n    [${name}] ${m.slice(0, 72)}`);
    }
  }
}

console.log(
  `\nScanned ${files.length} staged files · ${findings} suspicious · ${benign} known-benign matches ignored.`,
);
if (findings > 0) {
  console.log("REVIEW REQUIRED before pushing.");
  process.exitCode = 1;
} else {
  console.log("No credentials detected in the staged set.");
}
