import hre from "hardhat";

async function main() {
  const { ethers } = await hre.network.create();
  const assetNftAddress = "0xef8C3D59C33DF4EC6c35b93d0f02a4661f954a09";
  const assetNft = await ethers.getContractAt("AssetNFT", assetNftAddress);
  const ASSET_MINTER_ROLE = await assetNft.ASSET_MINTER_ROLE();

  const deployer = "0x9A884d981f512f77c92B95BDB92206A0AA043Fc9";
  const signer1 = "0xa128D37463b7233c7338d6Aef0dd5c347BFdcC70";
  const signer2 = "0xFA0C7D03A4D536c93e683784A67f4b349031318A";
  const signer3 = "0xf7Df06Ccc280F3c7eD9EC8Dd37a7A1Fd11059e76";
  const treasury = "0xfDEfeaAdB51318aC719a219622Ec131EDfcA4bbd";
  const multisig = "0xCADC64eC6f0AA64B02190589588dD91765Bb1204";

  console.log("deployer has ASSET_MINTER_ROLE?", await assetNft.hasRole(ASSET_MINTER_ROLE, deployer));
  console.log("signer1 has ASSET_MINTER_ROLE? ", await assetNft.hasRole(ASSET_MINTER_ROLE, signer1));
  console.log("signer2 has ASSET_MINTER_ROLE? ", await assetNft.hasRole(ASSET_MINTER_ROLE, signer2));
  console.log("signer3 has ASSET_MINTER_ROLE? ", await assetNft.hasRole(ASSET_MINTER_ROLE, signer3));
  console.log("treasury has ASSET_MINTER_ROLE?", await assetNft.hasRole(ASSET_MINTER_ROLE, treasury));
  console.log("multisig has ASSET_MINTER_ROLE?", await assetNft.hasRole(ASSET_MINTER_ROLE, multisig));
}

main().catch(console.error);
