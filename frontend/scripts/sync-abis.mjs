/**
 * Generates `src/contracts/abis.ts` from the Hardhat build artifacts.
 *
 *   npm run sync:abis        (from frontend/)
 *
 * The compiled artifacts in ../artifacts are the single source of truth for the
 * contract interface. They are gitignored, so the generated TypeScript file IS
 * committed — but it must never be hand-edited. Re-run this script after any
 * change to contracts/.
 *
 * Only the ABI fragments the frontend actually calls are emitted, which keeps
 * the bundle small while staying byte-identical to the compiler output for
 * those fragments (no hand-transcribed signatures that could silently drift).
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");
const artifacts = join(repoRoot, "artifacts", "contracts");
const outFile = join(here, "..", "src", "contracts", "abis.ts");

/** Artifacts to read, and which fragments to keep. `null` = keep everything. */
const SOURCES = [
  {
    exportName: "nostromFactoryAbi",
    artifact: join(artifacts, "NostromFactory.sol", "NostromFactory.json"),
    keep: null,
  },
  {
    exportName: "nostromVaultAbi",
    artifact: join(artifacts, "NostromFactory.sol", "NostromVault.json"),
    keep: null,
  },
  {
    exportName: "erc20Abi",
    artifact: join(artifacts, "test", "MockERC20.sol", "MockERC20.json"),
    keep: ["balanceOf", "decimals", "symbol", "name"],
  },
];

function loadAbi({ artifact, keep }) {
  if (!existsSync(artifact)) {
    throw new Error(
      `Missing artifact: ${relative(repoRoot, artifact)}\n` +
        `Run \`npm run build\` in the repository root first (hardhat compile).`,
    );
  }
  const { abi } = JSON.parse(readFileSync(artifact, "utf8"));
  if (!Array.isArray(abi)) throw new Error(`No abi array in ${artifact}`);
  if (!keep) return abi;

  const filtered = abi.filter((f) => f.type === "function" && keep.includes(f.name));
  const missing = keep.filter((name) => !filtered.some((f) => f.name === name));
  if (missing.length) {
    throw new Error(`Fragments not found in ${artifact}: ${missing.join(", ")}`);
  }
  return filtered;
}

const banner = `/**
 * AUTO-GENERATED — DO NOT EDIT.
 *
 * Source: Hardhat artifacts under ../../artifacts/contracts
 * Regenerate: npm run sync:abis
 *
 * Generated ${new Date().toISOString().slice(0, 10)}
 */
`;

const blocks = SOURCES.map(({ exportName, artifact, keep }) => {
  const abi = loadAbi({ artifact, keep });
  const label = relative(repoRoot, artifact).replace(/\\\\/g, "/").replace(/\\/g, "/");
  return `/** From ${label} */\nexport const ${exportName} = ${JSON.stringify(abi, null, 2)} as const;\n`;
});

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, `${banner}\n${blocks.join("\n")}`);

const counts = SOURCES.map(({ exportName, artifact, keep }) => {
  const abi = loadAbi({ artifact, keep });
  return `  ${exportName}: ${abi.length} fragments`;
}).join("\n");

console.log(`Wrote ${relative(process.cwd(), outFile)}\n${counts}`);
