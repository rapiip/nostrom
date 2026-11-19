import { describe, expect, it } from "vitest";
import {
  BaseError,
  ContractFunctionExecutionError,
  ContractFunctionRevertedError,
  UserRejectedRequestError,
  encodeErrorResult,
  type Abi,
  type AbiParameter,
  type Hex,
} from "viem";
import { nostromFactoryAbi, nostromVaultAbi } from "@/contracts/abis";
import { decodeTxError, shortErrorText } from "./errors";

/**
 * Every custom error either contract can raise must decode into a specific,
 * human explanation. This is the drift guard: add an error to the contract,
 * re-run `npm run sync:abis`, and this test fails until errors.ts explains it.
 */

type AbiError = Extract<Abi[number], { type: "error" }>;

const ALL_ERRORS: { abi: Abi; error: AbiError }[] = [
  ...(nostromFactoryAbi as Abi).filter((x): x is AbiError => x.type === "error").map((error) => ({ abi: nostromFactoryAbi as Abi, error })),
  ...(nostromVaultAbi as Abi).filter((x): x is AbiError => x.type === "error").map((error) => ({ abi: nostromVaultAbi as Abi, error })),
];

function sample(param: AbiParameter): unknown {
  if (param.type === "address") return "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
  if (param.type.startsWith("uint") || param.type.startsWith("int")) return 42n;
  if (param.type === "bool") return true;
  if (param.type === "string") return "recoveryAddress";
  if (param.type.startsWith("bytes")) return `0x${"11".repeat(Number(param.type.slice(5)) || 32)}`;
  throw new Error(`No sample for ABI type ${param.type}`);
}

/** The error shape viem produces when a simulate/write reverts with custom-error data. */
function revert(abi: Abi, errorName: string, args: readonly unknown[]): BaseError {
  const data = encodeErrorResult({ abi, errorName, args } as never) as Hex;
  const cause = new ContractFunctionRevertedError({ abi, data, functionName: "ping" });
  return new ContractFunctionExecutionError(cause, { abi, functionName: "ping" });
}

describe("custom error coverage", () => {
  it("the ABIs declare custom errors at all (guards against an empty sync)", () => {
    expect(ALL_ERRORS.length).toBeGreaterThan(10);
  });

  it.each(ALL_ERRORS.map(({ abi, error }) => [error.name, abi, error] as const))(
    "%s decodes to a specific explanation",
    (_name, abi, error) => {
      const decoded = decodeTxError(revert(abi, error.name, error.inputs.map(sample)));
      expect(decoded.kind).toBe("revert");
      expect(decoded.errorName).toBe(error.name);
      // The generic fallback title means errors.ts has no case for this error.
      expect(decoded.title).not.toBe("Transaction rejected by the contract");
    },
  );

  it("interpolates arguments into the explanation", () => {
    const decoded = decodeTxError(revert(nostromVaultAbi as Abi, "AgentStillAlive", [3_661n]));
    expect(decoded.title).toBe("Agent is still alive");
    expect(decoded.detail).toContain("1h 01m 01s");
  });
});

describe("non-contract failures", () => {
  it("treats a wallet rejection as a quiet, non-failure outcome", () => {
    const err = new UserRejectedRequestError(new Error("User rejected the request."));
    expect(decodeTxError(err).kind).toBe("rejected");
  });

  it("recognises a raw EIP-1193 4001 rejection", () => {
    expect(decodeTxError({ code: 4001, message: "rejected" }).kind).toBe("rejected");
  });

  it("explains gas and network problems before the chain saw anything", () => {
    expect(decodeTxError(new Error("insufficient funds for gas * price + value")).title).toBe(
      "Not enough BOT for gas",
    );
    expect(decodeTxError(new Error("Failed to fetch")).title).toBe("Network unreachable");
  });

  it("produces a one-line summary", () => {
    expect(shortErrorText(new Error("insufficient funds"))).toMatch(/^Not enough BOT for gas: /);
    expect(decodeTxError(undefined).title).toBe("Unknown error");
  });
});
