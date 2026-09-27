import hre from "hardhat";
import { ethers } from "ethers";
import dotenv from "dotenv";

dotenv.config();

/**
 * Bootstrap operational roles on existing Sepolia deployment via 2-of-3 MultiSig
 *
 * Grants ASSET_MINTER_ROLE and STATUS_MANAGER_ROLE on AssetNFT to OPERATOR_ADDRESS.
 * Also grants MANAGER_ROLE on TimeBoundAccessControl.
 *
 * Requires SIGNER1_PRIVATE_KEY and SIGNER2_PRIVATE_KEY in .env.
 */
async function main() {
  const rpcUrl = process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
  const provider = new ethers.JsonRpcProvider(rpcUrl);

  const signer1Key = process.env.SIGNER1_PRIVATE_KEY;
  const signer2Key = process.env.SIGNER2_PRIVATE_KEY;

  if (!signer1Key || !signer2Key) {
    console.error("ERROR: SIGNER1_PRIVATE_KEY and SIGNER2_PRIVATE_KEY must be set in .env to sign MultiSig transactions.");
    console.log("Alternatively, execute the proposals through the GovernancePanel in the UI using MetaMask connected to Signer 1 and Signer 2.");
    process.exit(1);
  }

  const signer1 = new ethers.Wallet(signer1Key, provider);
  const signer2 = new ethers.Wallet(signer2Key, provider);

  const multiSigAddr = "0xCADC64eC6f0AA64B02190589588dD91765Bb1204";
  const assetNftAddr = "0xef8C3D59C33DF4EC6c35b93d0f02a4661f954a09";
  const accessControlAddr = "0xFE760ccd5E57cAF54640dE9A710605991cCe4acD";

  const operator = process.env.OPERATOR_ADDRESS || "0x9A88c227f2E0576e330592923984E290C056E0F1";

  const multiSigAbi = [
    "function propose(uint8 actionType, address target, bytes32 role, address subject, uint256 assetId) returns (uint256)",
    "function confirmAndExecute(uint256 proposalId)",
    "function proposalCount() view returns (uint256)",
    "function isSigner(address) view returns (bool)",
  ];

  const assetNftAbi = [
    "function ASSET_MINTER_ROLE() view returns (bytes32)",
    "function STATUS_MANAGER_ROLE() view returns (bytes32)",
    "function hasRole(bytes32,address) view returns (bool)",
  ];

  const accessControlAbi = [
    "function MANAGER_ROLE() view returns (bytes32)",
    "function hasActiveRole(bytes32,address) view returns (bool)",
  ];

  const multiSig1 = new ethers.Contract(multiSigAddr, multiSigAbi, signer1);
  const multiSig2 = new ethers.Contract(multiSigAddr, multiSigAbi, signer2);
  const assetNFT = new ethers.Contract(assetNftAddr, assetNftAbi, provider);
  const accessControl = new ethers.Contract(accessControlAddr, accessControlAbi, provider);

  console.log("═══════════════════════════════════════════════════════");
  console.log("  Sepolia MultiSig Operational Role Bootstrapper");
  console.log("═══════════════════════════════════════════════════════");
  console.log("  Target Operator: ", operator);
  console.log("  Signer 1 Address:", signer1.address);
  console.log("  Signer 2 Address:", signer2.address);
  console.log("═══════════════════════════════════════════════════════\n");

  const minterRole = await assetNFT.ASSET_MINTER_ROLE();
  const statusManagerRole = await assetNFT.STATUS_MANAGER_ROLE();
  const managerRole = await accessControl.MANAGER_ROLE();

  let nextId = Number(await multiSig1.proposalCount());

  // 1. ASSET_MINTER_ROLE
  const hasMinter = await assetNFT.hasRole(minterRole, operator);
  if (!hasMinter) {
    console.log(`[1/3] Proposing ASSET_MINTER_ROLE (Proposal #${nextId})...`);
    const tx1 = await multiSig1.propose(0, assetNftAddr, minterRole, operator, 0);
    console.log("  Tx sent:", tx1.hash);
    await tx1.wait();

    console.log(`  Confirming & executing Proposal #${nextId} via Signer 2...`);
    const tx2 = await multiSig2.confirmAndExecute(nextId);
    console.log("  Tx sent:", tx2.hash);
    await tx2.wait();
    console.log("  ✔ ASSET_MINTER_ROLE granted!\n");
    nextId++;
  } else {
    console.log("✔ ASSET_MINTER_ROLE is already held by operator.");
  }

  // 2. STATUS_MANAGER_ROLE
  const hasStatusManager = await assetNFT.hasRole(statusManagerRole, operator);
  if (!hasStatusManager) {
    console.log(`[2/3] Proposing STATUS_MANAGER_ROLE (Proposal #${nextId})...`);
    const tx1 = await multiSig1.propose(0, assetNftAddr, statusManagerRole, operator, 0);
    console.log("  Tx sent:", tx1.hash);
    await tx1.wait();

    console.log(`  Confirming & executing Proposal #${nextId} via Signer 2...`);
    const tx2 = await multiSig2.confirmAndExecute(nextId);
    console.log("  Tx sent:", tx2.hash);
    await tx2.wait();
    console.log("  ✔ STATUS_MANAGER_ROLE granted!\n");
    nextId++;
  } else {
    console.log("✔ STATUS_MANAGER_ROLE is already held by operator.");
  }

  // 3. MANAGER_ROLE on TimeBoundAccessControl
  const hasRbac = await accessControl.hasActiveRole(managerRole, operator);
  if (!hasRbac) {
    console.log(`[3/3] Proposing MANAGER_ROLE on TimeBoundAccessControl (Proposal #${nextId})...`);
    const tx1 = await multiSig1.propose(0, accessControlAddr, managerRole, operator, 0);
    console.log("  Tx sent:", tx1.hash);
    await tx1.wait();

    console.log(`  Confirming & executing Proposal #${nextId} via Signer 2...`);
    const tx2 = await multiSig2.confirmAndExecute(nextId);
    console.log("  Tx sent:", tx2.hash);
    await tx2.wait();
    console.log("  ✔ MANAGER_ROLE granted on TimeBoundAccessControl!\n");
    nextId++;
  } else {
    console.log("✔ MANAGER_ROLE is already active for operator.");
  }

  console.log("═══════════════════════════════════════════════════════");
  console.log("  BOOTSTRAP COMPLETE — Operator is ready to mint & manage assets");
  console.log("═══════════════════════════════════════════════════════");
}

main().catch(console.error);
