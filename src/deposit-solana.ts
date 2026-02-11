/**
 * Decibel pre-deposit via Solana: CCTP (Circle) depositForBurn.
 * Burns USDC on Solana, mints on Aptos (domain 9). Только SOL на газ, Aptos не нужен.
 *
 * Две подписи (burn + create account): в одной транзакции мы подписываем
 * 1) burn — сжигание USDC и отправка сообщения в CCTP (owner = твой кошелёк),
 * 2) create account — аккаунт для события MessageSent (eventKeypair, одноразовый ключ).
 * Оба signer'а передаются в sendAndConfirmTransaction([kp, eventKeypair]) — средства не застревают.
 * Reference tx: https://solscan.io/tx/2RNRjzG4L3qAZDNdJ3bsN8FnREEP7iziwyqoD19pqRiNxERuahSMrN8NZ57rEAzTNynLy3eDwk59YSPz4mYU43pN
 */
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import * as crypto from "crypto";

// CCTP V1 (Legacy) — из твоей транзакции
const TOKEN_MESSENGER_MINTER_PROGRAM_ID = new PublicKey(
  "CCTPiPYPc6AsJuwueEnWgSgucamXDZwBd53dQ11YiKX3"
);
const MESSAGE_TRANSMITTER_PROGRAM_ID = new PublicKey(
  "CCTPmbSD7gX1bxKPAmg77w8oFzNFpaQiQUWD43TKaecd"
);
const USDC_MINT = new PublicKey(
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
);
const MESSAGE_TRANSMITTER = new PublicKey(
  "BWrwSWjbikT3H7qHAkUEbLmwDQoB4ZDJ4wcSEhSPTZCu"
);
const TOKEN_MESSENGER = new PublicKey(
  "Afgq3BHEfCE7d78D2XE9Bfyu2ieDqvE24xX8KDwreBms"
);
const REMOTE_TOKEN_MESSENGER_APTOS = new PublicKey(
  "3CTbq3SF9gekPHiJwLsyivfVbuaRFAQwQ6eQgtNy8nP1"
);
const LOCAL_TOKEN = new PublicKey(
  "72bvEFk2Usi2uYc1SnaTNhBcQPc6tiJWXr9oKk7rkd4C"
);
const SENDER_AUTHORITY_PDA = new PublicKey(
  "X5rMYSBWMqeWULSdDKXXATBjqk9AJF8odHpYJYeYA9H"
);

const DESTINATION_DOMAIN_APTOS = 9;
const USDC_DECIMALS = 6;

function aptosAddressToMintRecipient(aptosHex: string): PublicKey {
  const hex = aptosHex.replace(/^0x/, "").toLowerCase();
  if (hex.length !== 64) throw new Error("Aptos address must be 32 bytes (64 hex chars)");
  const bytes = Buffer.from(hex, "hex");
  return new PublicKey(bytes);
}

function getTokenMinterPda(): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("token_minter")],
    TOKEN_MESSENGER_MINTER_PROGRAM_ID
  );
  return pda;
}

function getEventAuthorityPda(): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("__event_authority")],
    TOKEN_MESSENGER_MINTER_PROGRAM_ID
  );
  return pda;
}

function buildDepositForBurnInstruction(
  owner: PublicKey,
  eventRentPayer: PublicKey,
  burnTokenAccount: PublicKey,
  messageSentEventData: PublicKey,
  amount: bigint,
  mintRecipient: PublicKey
): TransactionInstruction {
  const discriminator = crypto
    .createHash("sha256")
    .update("global:deposit_for_burn")
    .digest()
    .slice(0, 8);
  const buffer = Buffer.alloc(8 + 8 + 4 + 32);
  let offset = 0;
  buffer.set(discriminator, offset);
  offset += 8;
  buffer.writeBigUInt64LE(amount, offset);
  offset += 8;
  buffer.writeUInt32LE(DESTINATION_DOMAIN_APTOS, offset);
  offset += 4;
  mintRecipient.toBuffer().copy(buffer, offset);

  const tokenMinter = getTokenMinterPda();
  const eventAuthority = getEventAuthorityPda();

  return new TransactionInstruction({
    programId: TOKEN_MESSENGER_MINTER_PROGRAM_ID,
    keys: [
      { pubkey: owner, isSigner: true, isWritable: false },
      { pubkey: eventRentPayer, isSigner: true, isWritable: true },
      { pubkey: SENDER_AUTHORITY_PDA, isSigner: false, isWritable: false },
      { pubkey: burnTokenAccount, isSigner: false, isWritable: true },
      { pubkey: MESSAGE_TRANSMITTER, isSigner: false, isWritable: true },
      { pubkey: TOKEN_MESSENGER, isSigner: false, isWritable: false },
      { pubkey: REMOTE_TOKEN_MESSENGER_APTOS, isSigner: false, isWritable: false },
      { pubkey: tokenMinter, isSigner: false, isWritable: false },
      { pubkey: LOCAL_TOKEN, isSigner: false, isWritable: true },
      { pubkey: USDC_MINT, isSigner: false, isWritable: true },
      { pubkey: messageSentEventData, isSigner: true, isWritable: true },
      { pubkey: MESSAGE_TRANSMITTER_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: TOKEN_MESSENGER_MINTER_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: new PublicKey("11111111111111111111111111111111"), isSigner: false, isWritable: false },
      { pubkey: eventAuthority, isSigner: false, isWritable: false },
      { pubkey: TOKEN_MESSENGER_MINTER_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: buffer,
  });
}

function usdcToRaw(amountUsdc: number): bigint {
  return BigInt(Math.round(amountUsdc * 10 ** USDC_DECIMALS));
}

async function main(): Promise<void> {
  try {
    const dotenv = await import("dotenv");
    dotenv.config();
  } catch {
    // dotenv optional: use export SOLANA_PRIVATE_KEY=... and run
  }

  const rpc = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
  const privateKeyBase58 = process.env.SOLANA_PRIVATE_KEY ?? "";
  const aptosRecipientHex = process.env.APTOS_RECIPIENT_ADDRESS ?? "";
  const amountUsdc = Number(process.env.DEPOSIT_USDC ?? "50");

  if (!privateKeyBase58) {
    console.error("Set SOLANA_PRIVATE_KEY in .env (base58 secret key)");
    process.exit(1);
  }
  if (!aptosRecipientHex) {
    console.error("Set APTOS_RECIPIENT_ADDRESS in .env (Aptos address hex, 0x..., 32 bytes) — куда минтить USDC на Aptos");
    process.exit(1);
  }

  let kp: Keypair;
  try {
    if (privateKeyBase58.startsWith("[")) {
      kp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(privateKeyBase58)));
    } else {
      const bs58 = await import("bs58");
      kp = Keypair.fromSecretKey(bs58.default.decode(privateKeyBase58));
    }
  } catch (e) {
    console.error("Invalid SOLANA_PRIVATE_KEY (use base58 or JSON array)");
    process.exit(1);
  }

  const connection = new Connection(rpc);
  const mintRecipient = aptosAddressToMintRecipient(aptosRecipientHex);

  const ata = getAssociatedTokenAddressSync(USDC_MINT, kp.publicKey);
  const ataInfo = await connection.getAccountInfo(ata);
  if (!ataInfo) {
    console.error("USDC ATA not found. Create it first or hold some USDC on Solana.");
    process.exit(1);
  }

  const balance = await connection.getTokenAccountBalance(ata);
  const amountRaw = usdcToRaw(amountUsdc);
  if (BigInt(balance.value.amount) < amountRaw) {
    console.error(`Not enough USDC. Have ${balance.value.uiAmount}, need ${amountUsdc}`);
    process.exit(1);
  }

  const eventKeypair = Keypair.generate();

  const ix = buildDepositForBurnInstruction(
    kp.publicKey,
    kp.publicKey,
    ata,
    eventKeypair.publicKey,
    amountRaw,
    mintRecipient
  );

  const tx = new Transaction();
  const computeBudgetProgramId = new PublicKey("ComputeBudget111111111111111111111111111111");
  const setLimitData = Buffer.alloc(5);
  setLimitData.writeUInt8(2, 0);
  setLimitData.writeUInt32LE(73737, 1);
  const setPriceData = Buffer.alloc(9);
  setPriceData.writeUInt8(3, 0);
  setPriceData.writeBigUInt64LE(BigInt(100000), 1);

  tx.add(
    new TransactionInstruction({ programId: computeBudgetProgramId, keys: [], data: setLimitData }),
    new TransactionInstruction({ programId: computeBudgetProgramId, keys: [], data: setPriceData }),
    ix
  );

  const sig = await sendAndConfirmTransaction(connection, tx, [kp, eventKeypair], {
    skipPreflight: false,
    maxRetries: 3,
  });
  console.log(`CCTP depositForBurn ok. Tx: ${sig}`);
  console.log(`  ${amountUsdc} USDC Solana → Aptos (domain 9), recipient: ${aptosRecipientHex.slice(0, 18)}...`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
