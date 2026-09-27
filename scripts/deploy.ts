import hre from "hardhat";
import fs from "fs";
import path from "path";

/**
 * BEL Trust Chain — Deployment Script
 *
 * Implements Section 4 of the build brief exactly:
 * 1. Deploy CredentialRegistry, TimeBoundAccessControl, AssetNFT
 * 2. Deploy MultiSigAdmin with three signer addresses
 * 3. Grant MultiSigAdmin its admin roles
 * 3b. Propose & confirm operational roles for Operator via MultiSig governance
 * 4. Deployer renounces DEFAULT_ADMIN_ROLE on every contract
 * 5. Attempt a privileged call from deployer — halt if it doesn't revert
 * 6. Verify MultiSigAdmin holds all admin roles, operator holds operational roles, and deployer is fully locked out
 * 7. Write deployed-addresses.json for frontend and tooling
 */

async function main() {
  const { ethers } = await hre.network.create();

  const signers = await ethers.getSigners();
  if (signers.length === 0) {
    console.error("No signers available. Check DEPLOYER_PRIVATE_KEY in .env");
    process.exit(1);
  }

  const deployer = signers[0];
  const deployerAddr = await deployer.getAddress();

  // On local test network (Hardhat chainId 31337), use unlocked accounts so multisig executes automatically.
  // On a live network (Sepolia chainId 11155111), read addresses and signer keys from .env.
  const network = await ethers.provider.getNetwork();
  const isLiveNetwork = network.chainId !== 31337n && network.chainId !== 1337n;

  let signer1Addr: string;
  let signer2Addr: string;
  let signer3Addr: string;
  let treasuryAddr: string;

  let signer1Wallet: any;
  let signer2Wallet: any;

  if (isLiveNetwork) {
    if (!process.env.SIGNER1_ADDRESS || !process.env.SIGNER2_ADDRESS || !process.env.SIGNER3_ADDRESS || !process.env.TREASURY_ADDRESS) {
      console.error("ERROR: SIGNER1_ADDRESS, SIGNER2_ADDRESS, SIGNER3_ADDRESS, and TREASURY_ADDRESS must be set in .env for live network deployment.");
      process.exit(1);
    }
    signer1Addr = process.env.SIGNER1_ADDRESS;
    signer2Addr = process.env.SIGNER2_ADDRESS;
    signer3Addr = process.env.SIGNER3_ADDRESS;
    treasuryAddr = process.env.TREASURY_ADDRESS;

    if (process.env.SIGNER1_PRIVATE_KEY) {
      signer1Wallet = new ethers.Wallet(process.env.SIGNER1_PRIVATE_KEY, ethers.provider);
    }
    if (process.env.SIGNER2_PRIVATE_KEY) {
      signer2Wallet = new ethers.Wallet(process.env.SIGNER2_PRIVATE_KEY, ethers.provider);
    }
  } else {
    signer1Addr = await signers[1].getAddress();
    signer2Addr = await signers[2].getAddress();
    signer3Addr = await signers[3].getAddress();
    treasuryAddr = await signers[4].getAddress();

    signer1Wallet = signers[1];
    signer2Wallet = signers[2];
  }

  const operatorAddr = process.env.OPERATOR_ADDRESS || deployerAddr;

  console.log("═══════════════════════════════════════════════════════");
  console.log("  BEL Trust Chain — Deployment");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  Deployer:  ${deployerAddr}`);
  console.log(`  Operator:  ${operatorAddr}`);
  console.log(`  Signer 1:  ${signer1Addr}`);
  console.log(`  Signer 2:  ${signer2Addr}`);
  console.log(`  Signer 3:  ${signer3Addr}`);
  console.log(`  Treasury:  ${treasuryAddr}`);
  console.log("═══════════════════════════════════════════════════════\n");

  // =========================================================================
  // Step 1: Deploy CredentialRegistry, AssetNFT, TimeBoundAccessControl
  // =========================================================================

  console.log("Step 1: Deploying core contracts...\n");

  // Deploy EthereumDIDRegistry
  const DIDRegistry = await ethers.getContractFactory("EthereumDIDRegistry");
  const didRegistry = await DIDRegistry.deploy();
  await didRegistry.waitForDeployment();
  const didRegistryAddr = await didRegistry.getAddress();
  console.log(`  EthereumDIDRegistry:    ${didRegistryAddr}`);

  // Deploy CredentialRegistry
  const CredentialRegistry = await ethers.getContractFactory("CredentialRegistry");
  const credentialRegistry = await CredentialRegistry.deploy();
  await credentialRegistry.waitForDeployment();
  const credRegAddr = await credentialRegistry.getAddress();
  console.log(`  CredentialRegistry:     ${credRegAddr}`);

  // Deploy TimeBoundAccessControl (deployed before AssetNFT to wire in active RBAC)
  const TimeBoundAccessControl = await ethers.getContractFactory("TimeBoundAccessControl");
  const accessControl = await TimeBoundAccessControl.deploy();
  await accessControl.waitForDeployment();
  const accessControlAddr = await accessControl.getAddress();
  console.log(`  TimeBoundAccessControl: ${accessControlAddr}`);

  // Deploy AssetNFT
  const AssetNFT = await ethers.getContractFactory("AssetNFT");
  const assetNFT = await AssetNFT.deploy(treasuryAddr, credRegAddr, didRegistryAddr, accessControlAddr);
  await assetNFT.waitForDeployment();
  const assetNFTAddr = await assetNFT.getAddress();
  console.log(`  AssetNFT:               ${assetNFTAddr}`);

  console.log("\n  ✔ Core contracts deployed.\n");

  // =========================================================================
  // Step 2: Deploy MultiSigAdmin
  // =========================================================================

  console.log("Step 2: Deploying MultiSigAdmin...\n");

  const MultiSigAdmin = await ethers.getContractFactory("MultiSigAdmin");
  const multiSig = await MultiSigAdmin.deploy([signer1Addr, signer2Addr, signer3Addr]);
  await multiSig.waitForDeployment();
  const multiSigAddr = await multiSig.getAddress();
  console.log(`  MultiSigAdmin:       ${multiSigAddr}`);
  console.log("\n  ✔ MultiSigAdmin deployed.\n");

  // =========================================================================
  // Step 3: Grant MultiSigAdmin its admin roles
  // =========================================================================

  console.log("Step 3: Granting admin roles to MultiSigAdmin...\n");

  const CREDENTIAL_ISSUER_ADMIN_ROLE = await credentialRegistry.CREDENTIAL_ISSUER_ADMIN_ROLE();
  const STATUS_ADMIN_ROLE = await assetNFT.STATUS_ADMIN_ROLE();
  const RBAC_ADMIN_ROLE = await accessControl.RBAC_ADMIN_ROLE();
  const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;

  let tx;
  tx = await credentialRegistry.grantRole(CREDENTIAL_ISSUER_ADMIN_ROLE, multiSigAddr);
  await tx.wait();
  tx = await credentialRegistry.grantRole(DEFAULT_ADMIN_ROLE, multiSigAddr);
  await tx.wait();
  console.log(`  ✔ CREDENTIAL_ISSUER_ADMIN_ROLE & DEFAULT_ADMIN_ROLE granted on CredentialRegistry`);

  tx = await assetNFT.grantRole(STATUS_ADMIN_ROLE, multiSigAddr);
  await tx.wait();
  tx = await assetNFT.grantRole(DEFAULT_ADMIN_ROLE, multiSigAddr);
  await tx.wait();
  console.log(`  ✔ STATUS_ADMIN_ROLE & DEFAULT_ADMIN_ROLE granted on AssetNFT`);

  tx = await accessControl.grantRole(RBAC_ADMIN_ROLE, multiSigAddr);
  await tx.wait();
  tx = await accessControl.grantRole(DEFAULT_ADMIN_ROLE, multiSigAddr);
  await tx.wait();
  console.log(`  ✔ RBAC_ADMIN_ROLE & DEFAULT_ADMIN_ROLE granted on TimeBoundAccessControl`);

  console.log("");

  // =========================================================================
  // Step 3b: Setup Operator Baseline Roles
  // =========================================================================

  console.log("Step 3b: Setting up baseline operator roles...\n");
  console.log(`  Operator Target: ${operatorAddr}`);

  const ASSET_MINTER_ROLE = await assetNFT.ASSET_MINTER_ROLE();
  const STATUS_MANAGER_ROLE = await assetNFT.STATUS_MANAGER_ROLE();
  const MANAGER_ROLE = await accessControl.MANAGER_ROLE();

  if (signer1Wallet && signer2Wallet) {
    // Propose & Confirm operational roles via MultiSig
    console.log("  Proposing ASSET_MINTER_ROLE via Signer 1...");
    const prop1Tx = await multiSig.connect(signer1Wallet).propose(
      0, // GrantRole
      assetNFTAddr,
      ASSET_MINTER_ROLE,
      operatorAddr,
      0
    );
    await prop1Tx.wait();

    console.log("  Confirming & executing ASSET_MINTER_ROLE via Signer 2...");
    const conf1Tx = await multiSig.connect(signer2Wallet).confirmAndExecute(0);
    await conf1Tx.wait();
    console.log("  ✔ ASSET_MINTER_ROLE granted to operator via MultiSig governance");

    console.log("  Proposing STATUS_MANAGER_ROLE via Signer 1...");
    const prop2Tx = await multiSig.connect(signer1Wallet).propose(
      0, // GrantRole
      assetNFTAddr,
      STATUS_MANAGER_ROLE,
      operatorAddr,
      0
    );
    await prop2Tx.wait();

    console.log("  Confirming & executing STATUS_MANAGER_ROLE via Signer 2...");
    const conf2Tx = await multiSig.connect(signer2Wallet).confirmAndExecute(1);
    await conf2Tx.wait();
    console.log("  ✔ STATUS_MANAGER_ROLE granted to operator via MultiSig governance");

    // 3. Propose & Confirm MANAGER_ROLE on TimeBoundAccessControl
    console.log("  Proposing MANAGER_ROLE on TimeBoundAccessControl via Signer 1...");
    const prop3Tx = await multiSig.connect(signer1Wallet).propose(
      0, // GrantRole
      accessControlAddr,
      MANAGER_ROLE,
      operatorAddr,
      0
    );
    await prop3Tx.wait();

    console.log("  Confirming & executing MANAGER_ROLE via Signer 2...");
    const conf3Tx = await multiSig.connect(signer2Wallet).confirmAndExecute(2);
    await conf3Tx.wait();
    console.log("  ✔ MANAGER_ROLE granted on TimeBoundAccessControl via MultiSig governance\n");
  } else {
    // Grant baseline MANAGER_ROLE on TimeBoundAccessControl so custody/status transitions pass the RBAC check once granted by MultiSig
    const txAdmin = await accessControl.grantRole(RBAC_ADMIN_ROLE, deployerAddr);
    await txAdmin.wait();
    const txRbac = await accessControl.grantRole(MANAGER_ROLE, operatorAddr);
    await txRbac.wait();
    const txRenounce = await accessControl.renounceRole(RBAC_ADMIN_ROLE, deployerAddr);
    await txRenounce.wait();
    console.log("  ✔ Baseline MANAGER_ROLE granted on TimeBoundAccessControl to operator");
    console.log("  (Operational roles ASSET_MINTER_ROLE and STATUS_MANAGER_ROLE are left for 2-of-3 MultiSig Board governance in the UI)\n");
  }

  // =========================================================================
  // Step 4: Deployer renounces DEFAULT_ADMIN_ROLE on every contract
  // =========================================================================

  console.log("Step 4: Deployer renouncing DEFAULT_ADMIN_ROLE...\n");

  tx = await credentialRegistry.renounceRole(DEFAULT_ADMIN_ROLE, deployerAddr);
  await tx.wait();
  console.log("  ✔ Renounced on CredentialRegistry");

  tx = await assetNFT.renounceRole(DEFAULT_ADMIN_ROLE, deployerAddr);
  await tx.wait();
  console.log("  ✔ Renounced on AssetNFT");

  tx = await accessControl.renounceRole(DEFAULT_ADMIN_ROLE, deployerAddr);
  await tx.wait();
  console.log("  ✔ Renounced on TimeBoundAccessControl");

  console.log("");

  // =========================================================================
  // Step 5: Verify deployer is locked out using on-chain reads (no tx needed)
  // =========================================================================

  console.log("Step 5: Verifying deployer is locked out...\n");

  // Use hasRole reads instead of sending reverting transactions (cheaper, reliable)
  const deployerStillHasCredAdmin = await credentialRegistry.hasRole(DEFAULT_ADMIN_ROLE, deployerAddr);
  if (deployerStillHasCredAdmin) {
    console.error("  ✘ CRITICAL: Deployer still has DEFAULT_ADMIN_ROLE on CredentialRegistry!");
    console.error("    HALTING — governance is NOT secure.");
    process.exit(1);
  }
  console.log("  ✔ Deployer has no admin role on CredentialRegistry");

  const deployerStillHasAssetAdmin = await assetNFT.hasRole(DEFAULT_ADMIN_ROLE, deployerAddr);
  if (deployerStillHasAssetAdmin) {
    console.error("  ✘ CRITICAL: Deployer still has DEFAULT_ADMIN_ROLE on AssetNFT!");
    console.error("    HALTING — governance is NOT secure.");
    process.exit(1);
  }
  console.log("  ✔ Deployer has no admin role on AssetNFT");

  const deployerStillHasRbacAdmin = await accessControl.hasRole(DEFAULT_ADMIN_ROLE, deployerAddr);
  if (deployerStillHasRbacAdmin) {
    console.error("  ✘ CRITICAL: Deployer still has DEFAULT_ADMIN_ROLE on TimeBoundAccessControl!");
    console.error("    HALTING — governance is NOT secure.");
    process.exit(1);
  }
  console.log("  ✔ Deployer has no admin role on TimeBoundAccessControl");

  // Double-check: try a staticCall to grantRole — should revert without sending a tx
  try {
    await credentialRegistry.grantRole.staticCall(CREDENTIAL_ISSUER_ADMIN_ROLE, deployerAddr);
    console.error("  ✘ CRITICAL: staticCall to grantRole did not revert!");
    process.exit(1);
  } catch {
    console.log("  ✔ staticCall confirmed: deployer's grantRole reverts on CredentialRegistry");
  }

  console.log("");

  // =========================================================================
  // Step 6: Verify MultiSigAdmin holds all admin roles, deployer is false
  // =========================================================================

  console.log("Step 6: Final verification checks...\n");

  const checks = [
    {
      label: "MultiSig has CREDENTIAL_ISSUER_ADMIN_ROLE",
      result: await credentialRegistry.hasRole(CREDENTIAL_ISSUER_ADMIN_ROLE, multiSigAddr),
      expected: true,
    },
    {
      label: "MultiSig has STATUS_ADMIN_ROLE",
      result: await assetNFT.hasRole(STATUS_ADMIN_ROLE, multiSigAddr),
      expected: true,
    },
    {
      label: "MultiSig has RBAC_ADMIN_ROLE",
      result: await accessControl.hasRole(RBAC_ADMIN_ROLE, multiSigAddr),
      expected: true,
    },
    {
      label: "Deployer DEFAULT_ADMIN_ROLE on CredentialRegistry",
      result: await credentialRegistry.hasRole(DEFAULT_ADMIN_ROLE, deployerAddr),
      expected: false,
    },
    {
      label: "Deployer DEFAULT_ADMIN_ROLE on AssetNFT",
      result: await assetNFT.hasRole(DEFAULT_ADMIN_ROLE, deployerAddr),
      expected: false,
    },
    {
      label: "Deployer DEFAULT_ADMIN_ROLE on TimeBoundAccessControl",
      result: await accessControl.hasRole(DEFAULT_ADMIN_ROLE, deployerAddr),
      expected: false,
    },
    {
      label: "Operator has ASSET_MINTER_ROLE on AssetNFT",
      result: await assetNFT.hasRole(ASSET_MINTER_ROLE, operatorAddr),
      expected: Boolean(signer1Wallet && signer2Wallet),
    },
    {
      label: "Operator has STATUS_MANAGER_ROLE on AssetNFT",
      result: await assetNFT.hasRole(STATUS_MANAGER_ROLE, operatorAddr),
      expected: Boolean(signer1Wallet && signer2Wallet),
    },
    {
      label: "Operator has active MANAGER_ROLE on TimeBoundAccessControl",
      result: await accessControl.hasActiveRole(MANAGER_ROLE, operatorAddr),
      expected: true,
    },
  ];

  let allPassed = true;
  for (const check of checks) {
    const pass = check.result === check.expected;
    const icon = pass ? "✔" : "✘";
    const expectedStr = check.expected ? "true" : "false";
    console.log(`  ${icon} ${check.label}: ${check.result} (expected: ${expectedStr})`);
    if (!pass) allPassed = false;
  }

  console.log("");

  if (!allPassed) {
    console.error("═══════════════════════════════════════════════════════");
    console.error("  DEPLOYMENT FAILED — not all verification checks passed.");
    console.error("═══════════════════════════════════════════════════════");
    process.exit(1);
  }

  // =========================================================================
  // Step 7: Write deployed-addresses.json
  // =========================================================================

  console.log("Step 7: Writing deployed contract addresses to file...\n");
  const deployedAddresses = {
    network: hre.network.name,
    chainId: (await ethers.provider.getNetwork()).chainId.toString(),
    timestamp: new Date().toISOString(),
    contracts: {
      EthereumDIDRegistry: didRegistryAddr,
      CredentialRegistry: credRegAddr,
      TimeBoundAccessControl: accessControlAddr,
      AssetNFT: assetNFTAddr,
      MultiSigAdmin: multiSigAddr,
    },
    EthereumDIDRegistry: didRegistryAddr,
    CredentialRegistry: credRegAddr,
    TimeBoundAccessControl: accessControlAddr,
    AssetNFT: assetNFTAddr,
    MultiSigAdmin: multiSigAddr,
    governance: {
      multiSig: multiSigAddr,
      signers: [signer1Addr, signer2Addr, signer3Addr],
      operator: operatorAddr,
    },
  };

  if (isLiveNetwork) {
    const rootConfigPath = path.join(process.cwd(), "deployed-addresses.json");
    fs.writeFileSync(rootConfigPath, JSON.stringify(deployedAddresses, null, 2), "utf-8");
    console.log(`  ✔ Written addresses to ${rootConfigPath}`);

    const frontendConfigPath = path.join(process.cwd(), "frontend/src/deployed-addresses.json");
    fs.writeFileSync(frontendConfigPath, JSON.stringify(deployedAddresses, null, 2), "utf-8");
    console.log(`  ✔ Written addresses to ${frontendConfigPath}`);

    // Update DEPLOYMENT_BLOCK in .env
    const latestBlock = (await ethers.provider.getBlockNumber()).toString();
    const envPath = path.join(process.cwd(), ".env");
    if (fs.existsSync(envPath)) {
      let envContent = fs.readFileSync(envPath, "utf-8");
      if (envContent.includes("DEPLOYMENT_BLOCK=")) {
        envContent = envContent.replace(/DEPLOYMENT_BLOCK=\d*/, `DEPLOYMENT_BLOCK=${latestBlock}`);
      } else {
        envContent += `\nDEPLOYMENT_BLOCK=${latestBlock}\n`;
      }
      fs.writeFileSync(envPath, envContent, "utf-8");
      console.log(`  ✔ Updated DEPLOYMENT_BLOCK=${latestBlock} in .env`);
    }
  } else {
    console.log("  (Local run — preserving Sepolia deployed-addresses.json)");
  }
  console.log("");

  // =========================================================================
  // Summary
  // =========================================================================

  console.log("═══════════════════════════════════════════════════════");
  console.log("  DEPLOYMENT SUCCESSFUL — All checks passed");
  console.log("═══════════════════════════════════════════════════════");
  console.log("");
  console.log("  Contract Addresses:");
  console.log(`    EthereumDIDRegistry:    ${didRegistryAddr}`);
  console.log(`    CredentialRegistry:     ${credRegAddr}`);
  console.log(`    AssetNFT:              ${assetNFTAddr}`);
  console.log(`    TimeBoundAccessControl: ${accessControlAddr}`);
  console.log(`    MultiSigAdmin:         ${multiSigAddr}`);
  console.log("");
  console.log("  Governance & Roles:");
  console.log(`    MultiSigAdmin holds all admin roles.`);
  console.log(`    Deployer has been fully locked out.`);
  console.log(`    Operator:       ${operatorAddr}`);
  console.log(`    2-of-3 signers: ${signer1Addr}`);
  console.log(`                    ${signer2Addr}`);
  console.log(`                    ${signer3Addr}`);
  console.log("");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
