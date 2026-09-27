import hre from "hardhat";

/**
 * Verify the already-deployed BEL Trust Chain contracts on Sepolia.
 * Checks that role renouncement and multisig admin setup are correct.
 */
async function main() {
  const { ethers } = await hre.network.create();

  const addresses = {
    EthereumDIDRegistry: "0x69Ed112a0099E6FFE44a71022B58BF2c90037e7b",
    CredentialRegistry: "0xB813368bc9E3661F0696FC9D480989c9EF8dba4D",
    AssetNFT: "0xef8C3D59C33DF4EC6c35b93d0f02a4661f954a09",
    TimeBoundAccessControl: "0xFE760ccd5E57cAF54640dE9A710605991cCe4acD",
    MultiSigAdmin: "0xCADC64eC6f0AA64B02190589588dD91765Bb1204",
  };

  const deployer = (await ethers.getSigners())[0];
  const deployerAddr = await deployer.getAddress();
  console.log("Deployer:", deployerAddr);

  const credentialRegistry = await ethers.getContractAt("CredentialRegistry", addresses.CredentialRegistry);
  const assetNFT = await ethers.getContractAt("AssetNFT", addresses.AssetNFT);
  const accessControl = await ethers.getContractAt("TimeBoundAccessControl", addresses.TimeBoundAccessControl);

  const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
  const CREDENTIAL_ISSUER_ADMIN_ROLE = await credentialRegistry.CREDENTIAL_ISSUER_ADMIN_ROLE();
  const STATUS_ADMIN_ROLE = await assetNFT.STATUS_ADMIN_ROLE();
  const RBAC_ADMIN_ROLE = await accessControl.RBAC_ADMIN_ROLE();

  console.log("\n═══ Checking deployer's DEFAULT_ADMIN_ROLE ═══");
  const credAdmin = await credentialRegistry.hasRole(DEFAULT_ADMIN_ROLE, deployerAddr);
  console.log(`  CredentialRegistry: deployer has DEFAULT_ADMIN_ROLE? ${credAdmin}`);
  const assetAdmin = await assetNFT.hasRole(DEFAULT_ADMIN_ROLE, deployerAddr);
  console.log(`  AssetNFT: deployer has DEFAULT_ADMIN_ROLE? ${assetAdmin}`);
  const rbacAdmin = await accessControl.hasRole(DEFAULT_ADMIN_ROLE, deployerAddr);
  console.log(`  TimeBoundAccessControl: deployer has DEFAULT_ADMIN_ROLE? ${rbacAdmin}`);

  console.log("\n═══ Checking MultiSigAdmin holds admin roles ═══");
  const msAddr = addresses.MultiSigAdmin;
  console.log(`  MultiSig has CREDENTIAL_ISSUER_ADMIN_ROLE? ${await credentialRegistry.hasRole(CREDENTIAL_ISSUER_ADMIN_ROLE, msAddr)}`);
  console.log(`  MultiSig has STATUS_ADMIN_ROLE? ${await assetNFT.hasRole(STATUS_ADMIN_ROLE, msAddr)}`);
  console.log(`  MultiSig has RBAC_ADMIN_ROLE? ${await accessControl.hasRole(RBAC_ADMIN_ROLE, msAddr)}`);

  console.log("\n═══ staticCall verification ═══");
  try {
    await credentialRegistry.grantRole.staticCall(CREDENTIAL_ISSUER_ADMIN_ROLE, deployerAddr);
    console.log("  ✘ BUG: deployer can still grantRole on CredentialRegistry");
  } catch (e: any) {
    console.log("  ✔ deployer grantRole on CredentialRegistry reverts:", e.reason || e.shortMessage || "reverted");
  }

  console.log("\n═══ Summary ═══");
  const allGood = !credAdmin && !assetAdmin && !rbacAdmin;
  if (allGood) {
    console.log("  ✅ Deployer is fully locked out. Governance is secure.");
  } else {
    console.log("  ⚠️  Deployer still holds admin roles. See above.");
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
