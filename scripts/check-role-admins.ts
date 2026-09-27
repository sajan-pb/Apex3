import hre from "hardhat";

async function main() {
  const { ethers } = await hre.network.create();
  const multiSigAddress = "0xCADC64eC6f0AA64B02190589588dD91765Bb1204";
  const assetNftAddress = "0xef8C3D59C33DF4EC6c35b93d0f02a4661f954a09";
  const credRegAddress = "0xB813368bc9E3661F0696FC9D480989c9EF8dba4D";
  const accessControlAddress = "0xFE760ccd5E57cAF54640dE9A710605991cCe4acD";

  const assetNft = await ethers.getContractAt("AssetNFT", assetNftAddress);
  const credReg = await ethers.getContractAt("CredentialRegistry", credRegAddress);
  const accessControl = await ethers.getContractAt("TimeBoundAccessControl", accessControlAddress);

  const DEFAULT_ADMIN = ethers.ZeroHash;
  const ASSET_MINTER_ROLE = await assetNft.ASSET_MINTER_ROLE();
  const STATUS_MANAGER_ROLE = await assetNft.STATUS_MANAGER_ROLE();
  const STATUS_ADMIN_ROLE = await assetNft.STATUS_ADMIN_ROLE();

  console.log("=== AssetNFT ===");
  console.log("STATUS_ADMIN_ROLE hash:", STATUS_ADMIN_ROLE);
  console.log("MultiSig has STATUS_ADMIN_ROLE?", await assetNft.hasRole(STATUS_ADMIN_ROLE, multiSigAddress));
  console.log("MultiSig has DEFAULT_ADMIN_ROLE?", await assetNft.hasRole(DEFAULT_ADMIN, multiSigAddress));
  console.log("Role admin of STATUS_MANAGER_ROLE:", await assetNft.getRoleAdmin(STATUS_MANAGER_ROLE));
  console.log("Role admin of ASSET_MINTER_ROLE:   ", await assetNft.getRoleAdmin(ASSET_MINTER_ROLE));

  console.log("\n=== CredentialRegistry ===");
  const CRED_ISSUER_ROLE = await credReg.CREDENTIAL_ISSUER_ROLE();
  const CRED_ISSUER_ADMIN_ROLE = await credReg.CREDENTIAL_ISSUER_ADMIN_ROLE();
  console.log("MultiSig has CRED_ISSUER_ADMIN_ROLE?", await credReg.hasRole(CRED_ISSUER_ADMIN_ROLE, multiSigAddress));
  console.log("Role admin of CRED_ISSUER_ROLE:     ", await credReg.getRoleAdmin(CRED_ISSUER_ROLE));

  console.log("\n=== TimeBoundAccessControl ===");
  const RBAC_ADMIN_ROLE = await accessControl.RBAC_ADMIN_ROLE();
  const MANAGER_ROLE = await accessControl.MANAGER_ROLE();
  console.log("MultiSig has RBAC_ADMIN_ROLE?", await accessControl.hasRole(RBAC_ADMIN_ROLE, multiSigAddress));
  console.log("Role admin of MANAGER_ROLE:   ", await accessControl.getRoleAdmin(MANAGER_ROLE));
}

main().catch(console.error);
