import "dotenv/config";
import { ethers } from "ethers";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * BEL Trust Chain — Event Indexer
 *
 * Listens to blockchain events from all five contracts and indexes them
 * into a SQLite database. The database is disposable — it can be wiped
 * and rebuilt from chain state at any time.
 *
 * Usage:
 *   npx tsx indexer/index.ts                    # Live indexing (follows new blocks)
 *   npx tsx indexer/index.ts --rebuild          # Wipe and rebuild from deployment block
 *   npx tsx indexer/index.ts --once             # Index once and exit
 *   npx tsx indexer/index.ts --from-block=1234  # Start indexing from a specific block
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "bel_audit.db");

// Prefer dedicated indexer RPC or publicnode to avoid Alchemy free-tier block range restrictions
const RPC_URL =
  process.env.INDEXER_RPC_URL ||
  "https://ethereum-sepolia-rpc.publicnode.com";

import fs from "fs";

let deployedJson: any = {};
try {
  const jsonPath = path.join(__dirname, "../deployed-addresses.json");
  if (fs.existsSync(jsonPath)) {
    deployedJson = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
  }
} catch {
  // fallback to defaults
}

// Contract addresses — latest Sepolia deployment from deployed-addresses.json
const CONTRACTS = {
  DIDRegistry: process.env.DID_REGISTRY_ADDRESS || deployedJson.contracts?.EthereumDIDRegistry || "0x4767605b63b9A7fc1A53bF1AD99f06a4B06CA023",
  CredentialRegistry: process.env.CREDENTIAL_REGISTRY_ADDRESS || deployedJson.contracts?.CredentialRegistry || "0xfCe7fC7Ac8b23e2d6d1CCe1a8F6Dd07C56dc1Bcf",
  AssetNFT: process.env.ASSET_NFT_ADDRESS || deployedJson.contracts?.AssetNFT || "0x0bBA3dB04b6fc58C9521B89E830D4Dd7895916E9",
  TimeBoundAccessControl: process.env.ACCESS_CONTROL_ADDRESS || deployedJson.contracts?.TimeBoundAccessControl || "0xfa6113D9276E8a3d133ceaCea06C549Afa40AEdF",
  MultiSigAdmin: process.env.MULTISIG_ADDRESS || deployedJson.contracts?.MultiSigAdmin || "0x29E71873c0aB8095eF0D29eCcF7CB19B9FBf815E",
};

// Sepolia deployment block for BEL Trust Chain
const DEPLOYMENT_BLOCK = parseInt(process.env.DEPLOYMENT_BLOCK || "11793684");
const CHUNK_SIZE = 1000;

// ---------------------------------------------------------------------------
// ABI fragments (events only)
// ---------------------------------------------------------------------------

const EVENT_ABIS = {
  CredentialRegistry: [
    "event CredentialIssued(address indexed subject, bytes32 indexed credentialType, uint8 level, uint64 issuedAt, uint64 expiresAt, uint32 version, address indexed issuer)",
    "event CredentialRevoked(address indexed subject, bytes32 indexed credentialType, uint32 version, address indexed revoker)",
    "event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender)",
    "event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender)",
  ],
  AssetNFT: [
    "event AssetMinted(uint256 indexed tokenId, bytes32 componentType, bytes32 batchId, uint8 classificationLevel, address indexed treasury)",
    "event CustodyAssigned(uint256 indexed tokenId, address indexed previousCustodian, address indexed newCustodian)",
    "event AssetStatusChanged(uint256 indexed tokenId, uint8 previousStatus, uint8 newStatus)",
    "event AssetFrozen(uint256 indexed tokenId)",
    "event AssetUnfrozen(uint256 indexed tokenId)",
    "event Locked(uint256 tokenId)",
    "event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender)",
    "event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender)",
  ],
  MultiSigAdmin: [
    "event ProposalCreated(uint256 indexed proposalId, uint8 actionType, address target, bytes32 role, address subject, uint256 assetId, address indexed proposer)",
    "event ProposalConfirmed(uint256 indexed proposalId, address indexed confirmer, uint8 confirmationCount)",
    "event ProposalExecuted(uint256 indexed proposalId, uint8 actionType)",
  ],
  DIDRegistry: [
    "event DIDOwnerChanged(address indexed identity, address owner, uint256 previousChange)",
    "event DIDDelegateChanged(address indexed identity, bytes32 delegateType, address delegate, uint256 validTo, uint256 previousChange)",
    "event DIDAttributeChanged(address indexed identity, bytes32 name, bytes value, uint256 validTo, uint256 previousChange)",
  ],
  TimeBoundAccessControl: [
    "event RoleGrantedWithExpiry(bytes32 indexed role, address indexed account, uint64 expiresAt)",
    "event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender)",
    "event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender)",
  ],
};

// ---------------------------------------------------------------------------
// Database setup
// ---------------------------------------------------------------------------

function initDB(dbPath: string) {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      block_number INTEGER NOT NULL,
      tx_hash TEXT NOT NULL,
      log_index INTEGER NOT NULL,
      contract_name TEXT NOT NULL,
      event_name TEXT NOT NULL,
      args_json TEXT NOT NULL,
      timestamp INTEGER,
      UNIQUE(tx_hash, log_index)
    );

    CREATE INDEX IF NOT EXISTS idx_events_block ON events(block_number);
    CREATE INDEX IF NOT EXISTS idx_events_contract ON events(contract_name);
    CREATE INDEX IF NOT EXISTS idx_events_name ON events(event_name);

    CREATE TABLE IF NOT EXISTS indexer_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  return db;
}

function wipeDB(db: ReturnType<typeof Database>) {
  db.exec("DELETE FROM events");
  db.exec("DELETE FROM indexer_state");
  console.log("Database wiped clean.");
}

function getLastIndexedBlock(db: ReturnType<typeof Database>): number {
  const row = db.prepare("SELECT value FROM indexer_state WHERE key = 'last_block'").get() as
    | { value: string }
    | undefined;
  return row ? parseInt(row.value) : DEPLOYMENT_BLOCK;
}

function setLastIndexedBlock(db: ReturnType<typeof Database>, block: number) {
  db.prepare(
    "INSERT OR REPLACE INTO indexer_state (key, value) VALUES ('last_block', ?)"
  ).run(block.toString());
}

function insertEvent(
  db: ReturnType<typeof Database>,
  blockNumber: number,
  txHash: string,
  logIndex: number,
  contractName: string,
  eventName: string,
  argsJson: string,
  timestamp: number | null
) {
  db.prepare(
    `INSERT OR IGNORE INTO events
     (block_number, tx_hash, log_index, contract_name, event_name, args_json, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(blockNumber, txHash, logIndex, contractName, eventName, argsJson, timestamp);
}

// ---------------------------------------------------------------------------
// High-performance batch indexing logic
// ---------------------------------------------------------------------------

const ifaceMap: Record<string, { name: string; iface: ethers.Interface }> = {};
for (const [name, addr] of Object.entries(CONTRACTS)) {
  if (addr && (EVENT_ABIS as any)[name]) {
    ifaceMap[addr.toLowerCase()] = {
      name,
      iface: new ethers.Interface((EVENT_ABIS as any)[name]),
    };
  }
}

async function indexRange(
  db: ReturnType<typeof Database>,
  provider: ethers.JsonRpcProvider,
  startBlock: number,
  endBlock: number
) {
  const addresses = Object.keys(ifaceMap);
  if (addresses.length === 0) return;

  try {
    const logs = await provider.getLogs({
      address: addresses,
      fromBlock: startBlock,
      toBlock: endBlock,
    });

    for (const log of logs) {
      const mapping = ifaceMap[log.address.toLowerCase()];
      if (!mapping) continue;

      let parsed: ethers.LogDescription | null = null;
      try {
        parsed = mapping.iface.parseLog({
          topics: log.topics as string[],
          data: log.data,
        });
      } catch {
        continue;
      }

      if (!parsed) continue;

      let blockTimestamp: number | null = null;
      try {
        const block = await provider.getBlock(log.blockNumber);
        if (block) blockTimestamp = block.timestamp;
      } catch {
        // non-fatal
      }

      const argsObj: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(parsed.args)) {
        if (isNaN(Number(key))) {
          argsObj[key] = typeof value === "bigint" ? value.toString() : value;
        }
      }

      insertEvent(
        db,
        log.blockNumber,
        log.transactionHash,
        log.index,
        mapping.name,
        parsed.name,
        JSON.stringify(argsObj),
        blockTimestamp
      );

      console.log(`  ✔ [${mapping.name}] ${parsed.name} (Block ${log.blockNumber}, Tx ${log.transactionHash.slice(0, 10)}…)`);
    }
  } catch (err: any) {
    console.warn(`  ⚠️ Error indexing range [${startBlock}-${endBlock}]:`, err.message);
  }
}

async function indexPastEvents(
  db: ReturnType<typeof Database>,
  provider: ethers.JsonRpcProvider,
  fromBlock: number,
  toBlock: number
) {
  console.log(`Indexing blocks ${fromBlock} to ${toBlock} (step size ${CHUNK_SIZE})...`);

  for (let b = fromBlock; b <= toBlock; b += CHUNK_SIZE) {
    const end = Math.min(b + CHUNK_SIZE - 1, toBlock);
    await indexRange(db, provider, b, end);
    setLastIndexedBlock(db, end);
  }

  console.log(`✔ Finished indexing up to block ${toBlock}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const rebuild = args.includes("--rebuild");
  const once = args.includes("--once");
  const fromBlockArg = args.find((a) => a.startsWith("--from-block="));
  const specifiedFromBlock = fromBlockArg
    ? parseInt(fromBlockArg.split("=")[1]!)
    : null;

  const db = initDB(DB_PATH);

  if (rebuild) {
    wipeDB(db);
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const currentBlock = await provider.getBlockNumber();
  const fromBlock = specifiedFromBlock ?? (rebuild ? DEPLOYMENT_BLOCK : getLastIndexedBlock(db));

  console.log(`Connecting to ${RPC_URL}`);
  console.log(`Current Sepolia Block: ${currentBlock}`);
  console.log(`Start Block: ${fromBlock}`);

  if (fromBlock <= currentBlock) {
    await indexPastEvents(db, provider, fromBlock, currentBlock);
  }

  // Print summary
  const count = (
    db.prepare("SELECT COUNT(*) as cnt FROM events").get() as { cnt: number }
  ).cnt;
  console.log(`\n=========================================`);
  console.log(`Total events indexed in SQLite: ${count}`);
  console.log(`=========================================\n`);

  if (rebuild || once) {
    db.close();
    return;
  }

  // Auto-start Audit Dashboard API server on port 3001
  try {
    const { startDashboardApi } = await import("./dashboard-api.js");
    startDashboardApi();
  } catch (err: any) {
    console.warn("Could not start dashboard API:", err.message);
  }

  // Live mode: follow new blocks
  console.log("Listening for new Sepolia blocks...");
  provider.on("block", async (blockNumber: number) => {
    try {
      await indexRange(db, provider, blockNumber, blockNumber);
      setLastIndexedBlock(db, blockNumber);
    } catch (err: any) {
      console.error("Error indexing block", blockNumber, err.message);
    }
  });
}

main().catch(console.error);
