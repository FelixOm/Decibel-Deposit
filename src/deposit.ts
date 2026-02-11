/**
 * Decibel deposit script (subaccount / pre-deposit).
 * https://app.decibel.trade/pre-deposits | https://app.decibel.trade/api
 * Uses Aptos TS SDK + Decibel REST. TypeScript only (no official Python SDK).
 */
import {
  Aptos,
  AptosConfig,
  Ed25519Account,
  Ed25519PrivateKey,
  Network,
} from "@aptos-labs/ts-sdk";
import { NETNA_CONFIG } from "@decibeltrade/sdk";

const PACKAGE_NETNA =
  "0xb8a5788314451ce4d2fbbad32e1bad88d4184b73943b7fe5166eab93cf1a5a95";
const PACKAGE_TESTNET =
  "0x952535c3049e52f195f26798c2f1340d7dd5100edbe0f464e520a974d16fbe9f";
const FULLNODE_NETNA = "https://api.netna.aptoslabs.com/v1";
const FULLNODE_TESTNET = "https://api.testnet.aptoslabs.com/v1";
const DECIBEL_API_NETNA = "https://api.netna.aptoslabs.com/decibel";
const DECIBEL_API_TESTNET = "https://api.testnet.aptoslabs.com/decibel";
const USDC_DECIMALS = 6;

function parsePrivateKeys(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim().replace(/^0x/, ""))
    .filter(Boolean);
}

function usdcToUnits(amountUsdc: number): bigint {
  return BigInt(Math.round(amountUsdc * 10 ** USDC_DECIMALS));
}

async function getSubaccounts(
  owner: string,
  baseUrl: string,
  nodeApiKey: string
): Promise<{ subaccount_address: string }[]> {
  const url = `${baseUrl}/api/v1/subaccounts?owner=${encodeURIComponent(owner)}`;
  const res = await fetch(url, {
    headers: nodeApiKey ? { Authorization: `Bearer ${nodeApiKey}` } : {},
  });
  if (!res.ok) throw new Error(`Subaccounts API: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { subaccount_address?: string }[] | unknown;
  const list = Array.isArray(data) ? data : [];
  return list.map((x: { subaccount_address?: string }) => ({
    subaccount_address: (x as { subaccount_address?: string }).subaccount_address ?? "",
  })).filter((x) => x.subaccount_address);
}

async function depositForWallet(
  isTestnet: boolean,
  privateKeyHex: string,
  amountUsdc: number,
  nodeApiKey: string,
  usdcMetadata: string
): Promise<void> {
  const PACKAGE = isTestnet ? PACKAGE_TESTNET : PACKAGE_NETNA;
  const fullnode = isTestnet ? FULLNODE_TESTNET : FULLNODE_NETNA;
  const apiBase = isTestnet ? DECIBEL_API_TESTNET : DECIBEL_API_NETNA;

  const hex = privateKeyHex.startsWith("0x") ? privateKeyHex.slice(2) : privateKeyHex;
  const account = new Ed25519Account({
    privateKey: new Ed25519PrivateKey(hex),
  });
  const ownerAddress = account.accountAddress.toStringLong();

  const aptosConfig = new AptosConfig({
    network: isTestnet ? Network.TESTNET : Network.CUSTOM,
    fullnode: fullnode,
  });
  const aptos = new Aptos(aptosConfig);

  let subaccounts = await getSubaccounts(ownerAddress, apiBase, nodeApiKey);

  if (subaccounts.length === 0) {
    console.log(`  Create subaccount...`);
    const createTx = await aptos.transaction.build.simple({
      sender: account.accountAddress,
      data: {
        function: `${PACKAGE}::dex_accounts::create_new_subaccount`,
        typeArguments: [],
        functionArguments: [],
      },
    });
    const signed = await aptos.transaction.sign({ signer: account, transaction: createTx });
    const pending = await aptos.transaction.submit.simple({
      transaction: createTx,
      senderAuthenticator: signed,
    });
    await aptos.waitForTransaction({ transactionHash: pending.hash });
    subaccounts = await getSubaccounts(ownerAddress, apiBase, nodeApiKey);
  }

  if (!subaccounts.length) throw new Error("No subaccount after create");
  const subaccountAddress = subaccounts[0].subaccount_address;

  const amountUnits = usdcToUnits(amountUsdc);
  const depositTx = await aptos.transaction.build.simple({
    sender: account.accountAddress,
    data: {
      function: `${PACKAGE}::dex_accounts::deposit_to_subaccount_at`,
      typeArguments: [],
      functionArguments: [subaccountAddress, usdcMetadata, amountUnits.toString()],
    },
  });

  const signedDep = await aptos.transaction.sign({
    signer: account,
    transaction: depositTx,
  });
  const pendingDep = await aptos.transaction.submit.simple({
    transaction: depositTx,
    senderAuthenticator: signedDep,
  });
  const executed = await aptos.waitForTransaction({
    transactionHash: pendingDep.hash,
  });
  console.log(
    `  Deposit ${amountUsdc} USDC ok. Subaccount: ${subaccountAddress.slice(0, 10)}... Tx: ${executed.hash}`
  );
}

async function main(): Promise<void> {
  try {
    const dotenv = await import("dotenv");
    dotenv.config();
  } catch {
    // dotenv optional
  }

  const rawKeys = process.env.PRIVATE_KEYS ?? "";
  const nodeApiKey =
    process.env.APTOS_NODE_API_KEY ?? process.env.DECIBEL_NODE_API_KEY ?? "";
  const amountUsdc = Number(process.env.DEPOSIT_USDC ?? "50");
  const isTestnet = (process.env.DECIBEL_TESTNET ?? "false").toLowerCase() === "true";
  const deployment = (NETNA_CONFIG as { deployment?: { usdc?: string } }).deployment;
  const usdcMetadata =
    process.env.DECIBEL_USDC_METADATA ?? deployment?.usdc ?? "";

  if (!rawKeys.trim()) {
    console.error("Set PRIVATE_KEYS in .env (comma-separated Aptos Ed25519 private keys, hex)");
    process.exit(1);
  }

  if (!usdcMetadata) {
    console.error(
      "USDC metadata not found. Set DECIBEL_USDC_METADATA in .env or use SDK NETNA/TESTNET config."
    );
    process.exit(1);
  }

  const keys = parsePrivateKeys(rawKeys);
  console.log(`Wallets: ${keys.length}, ${amountUsdc} USDC each, testnet: ${isTestnet}`);

  for (let i = 0; i < keys.length; i++) {
    console.log(`Wallet ${i + 1}/${keys.length}`);
    try {
      await depositForWallet(isTestnet, keys[i], amountUsdc, nodeApiKey, usdcMetadata);
    } catch (e) {
      console.error(`  Error:`, e);
    }
  }
}

main();
