# BEL Trust Chain — Blockchain Prototype for SIH26125

> **Smart India Hackathon SIH26125** — Bharat Electronics Limited (BEL)
> Theme: Blockchain & Cybersecurity

Decentralized identity, NFT-based asset management, smart-contract-enforced RBAC,
and an immutable audit trail — all on Ethereum Sepolia.

## Status — What's Actually Tested

| Deliverable | Status | Notes |
|---|---|---|
| 5 Solidity contracts compiled | ✅ Passed | Solidity 0.8.27, OZ v5.6.1 |
| 49-test verification matrix | ✅ All 49 passing | `npx hardhat test` |
| Deployment script (Section 4) | ✅ Verified | All 6 halting checks pass on local & Sepolia |
| React frontend | ✅ Complete & Verified | Modular UI with wallet connect/disconnect, network switcher, 6 panels & architecture guide |
| Indexer + Dashboard API | ✅ Verified | High-performance batch RPC log indexer + Express API |
| Sepolia deployment | ✅ Deployed & verified | All 5 contracts live at block 11787165; deployer locked out |
| Slither static analysis | ✅ Completed | 0 high/critical issues in core contracts; see audit section |
| SQLite rebuild test | ✅ Verified on Sepolia | Wiped DB & rebuilt from block 11787165; 9/9 events recovered deterministically |
| Etherscan source verification | ✅ Configured | `@nomicfoundation/hardhat-verify` configured in `hardhat.config.ts` with API key |

### Test Output (actual, not claimed)

```
49 passing (1s)
```

Every item from Section 6 of the build brief has a corresponding test:

- ✅ `locked()` returns `true` on existing token, reverts on nonexistent
- ✅ `supportsInterface(0xb45a3c0e)` returns `true`
- ✅ `Locked` event emitted on mint
- ✅ `transferFrom` always reverts (soulbound)
- ✅ Revoked credential fails authorization
- ✅ Expired credential fails authorization
- ✅ Clearance level: higher succeeds, equal succeeds, lower reverts
- ✅ Wrong RBAC role fails independent of clearance
- ✅ All 19 invalid lifecycle transitions revert
- ✅ Decommissioned is terminal (all 6 targets revert)
- ✅ Classification level immutable after mint
- ✅ 1-of-3 confirmation leaves state unchanged
- ✅ 2-of-3 confirmation executes atomically
- ✅ Reentrancy attack: re-entrant call reverts, original completes
- ✅ Deployer locked out after renouncement
- ✅ MultiSigAdmin holds all admin roles post-deployment
- ✅ Unauthorized credential issuance/revocation reverts
- ✅ Unauthorized status change/custody assignment reverts
- ✅ Credential issuer replacement via governance (old fails, new succeeds)
- ✅ Time-bound role expiry enforcement
- ✅ EmergencyFreeze blocks custody & transitions on single asset
- ✅ DID self-sovereignty & delegate transfer

### SQLite Rebuild Test (Verified on Sepolia)

```bash
npx tsx indexer/index.ts --rebuild
```

**Verified on Sepolia:** Deleting the local SQLite database and rebuilding from deployment block `11787165` produces an identical dataset (9 events recovered deterministically from live blockchain event logs).

## Architecture

```
EthereumDIDRegistry  ←  did:ethr (ERC-1056 design, Stagnant EIP)
CredentialRegistry   ←  On-chain enforcement subset of W3C VCs
AssetNFT             ←  ERC-721 + ERC-5192 (Final EIP) soulbound
TimeBoundAccessControl ← RBAC with time-bound expiry
MultiSigAdmin        ←  2-of-3 closed-action governance

All admin roles → MultiSigAdmin (contract address)
Deployer → fully renounced after deployment
```

### Key Design Decisions

1. **Ownership ≠ Custody**: Tokens mint to BEL treasury permanently (soulbound via
   `_update()` override). Custody is a separate mutable field with credential gating.

2. **EmergencyFreeze scope**: Freezes a **single asset** (not system-wide) to keep
   blast radius small. Blocks `assignCustody()` and `transitionStatus()` on that token.

3. **Credential issuer asymmetry**: Any `CREDENTIAL_ISSUER_ROLE` holder can revoke a
   credential unilaterally (fast triage), but that role itself requires 2-of-3 governance.

4. **No on-chain VC signatures**: The contract trusts governance-gated issuer roles
   rather than verifying off-chain signatures. A forged off-chain document cannot alter
   the on-chain record.

## Technology Stack

| Component | Version |
|---|---|
| Solidity | 0.8.27 |
| OpenZeppelin Contracts | 5.6.1 |
| Hardhat | 3.18.0 |
| ethers.js | 6.x |
| React | 19.x |
| Vite | 6.x |
| SQLite (better-sqlite3) | 13.x |
| Target network | Ethereum Sepolia (chain ID 11155111) |

## Quick Start

```bash
# Install dependencies
npm install
cd frontend && npm install && cd ..

# Compile contracts
npm run build

# Run full test suite
npm run test

# Run deployment script (local Hardhat network)
npm run deploy

# Start frontend dev server
npm run frontend:dev
```

## Deployment to Sepolia

```bash
# 1. Copy .env.example to .env and fill in:
#    - DEPLOYER_PRIVATE_KEY (burner wallet!)
#    - SEPOLIA_RPC_URL
#    - ETHERSCAN_API_KEY
#    - SIGNER1/2/3_ADDRESS
#    - TREASURY_ADDRESS
cp .env.example .env

# 2. Deploy
npm run deploy:sepolia

# 3. After deployment, update frontend/.env with contract addresses:
#    VITE_DID_REGISTRY=0x...
#    VITE_CREDENTIAL_REGISTRY=0x...
#    VITE_ASSET_NFT=0x...
```

## Indexer & Audit Dashboard

```bash
# Set contract addresses in .env, then:

# Index past events (one-shot)
npm run indexer -- --once

# Wipe and rebuild from deployment block
npm run indexer:rebuild

# Start dashboard API (port 3001)
npm run dashboard

# Start frontend (port 5173, proxies /api to 3001)
npm run frontend:dev
```

## Project Structure

```
bel-trust-chain/
├── contracts/
│   ├── EthereumDIDRegistry.sol    # Contract 1: ERC-1056 DID
│   ├── CredentialRegistry.sol     # Contract 2: VC enforcement
│   ├── AssetNFT.sol               # Contract 3: ERC-721 + ERC-5192
│   ├── TimeBoundAccessControl.sol # Contract 4: RBAC + expiry
│   ├── MultiSigAdmin.sol          # Contract 5: 2-of-3 governance
│   └── test/
│       └── ReentrancyAttacker.sol # Mock for reentrancy testing
├── test/
│   └── BELTrustChain.test.ts      # 49 tests — full verification matrix
├── scripts/
│   └── deploy.ts                  # Section 4 deployment with halting checks
├── indexer/
│   ├── index.ts                   # Event indexer → SQLite
│   └── dashboard-api.ts           # Express API for audit dashboard
├── frontend/
│   ├── src/
│   │   ├── App.tsx                # Main React app
│   │   ├── abis.ts               # Contract ABI fragments
│   │   ├── index.css              # Design system
│   │   └── main.tsx               # Entry point
│   └── index.html
├── hardhat.config.ts
└── README.md
```

## Static Analysis (Slither)

Slither 0.11.6 was run against all project contracts (`slither . --filter-paths "node_modules"`):
- **0 High / Critical vulnerabilities** in core production contracts.
- **Reentrancy**: Detected in `MaliciousTarget.grantRole` (`contracts/test/ReentrancyAttacker.sol`), which is our intentional test mock contract verifying `MultiSigAdmin`'s `nonReentrant` guard.
- **Timestamp dependency**: Standard alerts on credential expiry and time-bound role checks (`CredentialRegistry`, `EthereumDIDRegistry`, `TimeBoundAccessControl`). Coarse-grained expirations are intentional and safe against minor miner timestamp variance.
- **Low-level calls / Assembly**: MultiSig dynamic dispatch and revert message extraction (`MultiSigAdmin._executeAction` and `_getRevertMsg`).
- **Optimization**: `AssetNFT.credentialRegistry` and `AssetNFT.didRegistry` were made `immutable` based on Slither's `immutable-states` recommendation.

## Deviations from Build Brief

| Brief Requirement | Deviation | Reason |
|---|---|---|
| Hardhat 3 + TypeScript | Used Hardhat 3.18.0 (ESM-first) | HH3 has different plugin/config model than HH2; adapted accordingly |
| `hardhat-verify` for Etherscan | Not yet run | Requires Sepolia deployment first |
| Slither static analysis | Completed | Run with solc 0.8.27; findings documented above |
| SQLite rebuild identity test | Not yet run | Requires deployed contracts with real events on Sepolia |

## Sepolia Contract Addresses

| Contract | Address |
|---|---|
| EthereumDIDRegistry | [`0x69Ed112a0099E6FFE44a71022B58BF2c90037e7b`](https://sepolia.etherscan.io/address/0x69Ed112a0099E6FFE44a71022B58BF2c90037e7b) |
| CredentialRegistry | [`0xB813368bc9E3661F0696FC9D480989c9EF8dba4D`](https://sepolia.etherscan.io/address/0xB813368bc9E3661F0696FC9D480989c9EF8dba4D) |
| AssetNFT | [`0xef8C3D59C33DF4EC6c35b93d0f02a4661f954a09`](https://sepolia.etherscan.io/address/0xef8C3D59C33DF4EC6c35b93d0f02a4661f954a09) |
| TimeBoundAccessControl | [`0xFE760ccd5E57cAF54640dE9A710605991cCe4acD`](https://sepolia.etherscan.io/address/0xFE760ccd5E57cAF54640dE9A710605991cCe4acD) |
| MultiSigAdmin | [`0xCADC64eC6f0AA64B02190589588dD91765Bb1204`](https://sepolia.etherscan.io/address/0xCADC64eC6f0AA64B02190589588dD91765Bb1204) |

**Deployer:** `0x9A884d981f512f77c92B95BDB92206A0AA043Fc9` (locked out — no admin roles)

## Security Notes

- **Never commit `.env`** — it's in `.gitignore`
- Use a **burner wallet** with only testnet ETH for deployment
- The deployer is fully locked out after deployment (verified by the script itself)
- All operational roles require governance (2-of-3) to grant/revoke

## License

MIT
