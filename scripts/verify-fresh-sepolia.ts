import hre from "hardhat";

async function main() {
  const { ethers } = await hre.network.create();
  const multiSigAddress = "0x29E71873c0aB8095eF0D29eCcF7CB19B9FBf815E";
  const assetNftAddress = "0x0bBA3dB04b6fc58C9521B89E830D4Dd7895916E9";
  const signer1Address = "0xa128D37463b7233c7338d6Aef0dd5c347BFdcC70";
  const signer2Address = "0xFA0C7D03A4D536c93e683784A67f4b349031318A";
  const commanderAddress = "0x9A884d981f512f77c92B95BDB92206A0AA043Fc9";

  const multiSig = await ethers.getContractAt("MultiSigAdmin", multiSigAddress);
  const assetNft = await ethers.getContractAt("AssetNFT", assetNftAddress);
  const ASSET_MINTER_ROLE = await assetNft.ASSET_MINTER_ROLE();

  console.log("Proposal count:", (await multiSig.proposalCount()).toString());
  console.log("AssetNFT ASSET_MINTER_ROLE hash:", ASSET_MINTER_ROLE);
  console.log("AssetNFT role admin for ASSET_MINTER_ROLE:", await assetNft.getRoleAdmin(ASSET_MINTER_ROLE));
  console.log("MultiSig has DEFAULT_ADMIN on AssetNFT?", await assetNft.hasRole(ethers.ZeroHash, multiSigAddress));
  console.log("MultiSig has STATUS_ADMIN on AssetNFT? ", await assetNft.hasRole(await assetNft.STATUS_ADMIN_ROLE(), multiSigAddress));

  // Let us simulate propose from signer1 using provider.call
  const proposeData = multiSig.interface.encodeFunctionData("propose", [
    0, // GrantRole
    assetNftAddress,
    ASSET_MINTER_ROLE,
    commanderAddress,
    0
  ]);

  console.log("\nSimulating propose from Signer 1 (0xa128...)...");
  const proposeRes = await ethers.provider.call({
    to: multiSigAddress,
    from: signer1Address,
    data: proposeData
  });
  console.log("✔ Propose simulation SUCCESS! Returned proposalId:", ethers.toBigInt(proposeRes).toString());

  // Now simulate confirmAndExecute(0) if proposal 0 were active
  console.log("MultiSig signers:", [
    await multiSig.signers(0),
    await multiSig.signers(1),
    await multiSig.signers(2)
  ]);
  console.log("Is Signer 2 authorized?", await multiSig.isSigner(signer2Address));
}

main().catch(console.error);
