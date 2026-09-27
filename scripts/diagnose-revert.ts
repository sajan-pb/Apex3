import hre from "hardhat";

async function main() {
  const { ethers } = await hre.network.create();
  const multiSigAddress = "0xCADC64eC6f0AA64B02190589588dD91765Bb1204";
  const signer2Address = "0xFA0C7D03A4D536c93e683784A67f4b349031318A";
  
  const multiSig = await ethers.getContractAt("MultiSigAdmin", multiSigAddress);
  const count = await multiSig.proposalCount();
  console.log("Proposal count:", count.toString());

  const s0 = await multiSig.signers(0);
  const s1 = await multiSig.signers(1);
  const s2 = await multiSig.signers(2);
  console.log("Signers:", [s0, s1, s2]);
  console.log("Is Signer2 authorized?", await multiSig.isSigner(signer2Address));

  for (let i = 0; i < Number(count); i++) {
    const p = await multiSig.getProposal(i);
    console.log(`\nProposal ${i}:`, {
      actionType: p.actionType.toString(),
      target: p.target,
      role: p.role,
      subject: p.subject,
      assetId: p.assetId.toString(),
      proposer: p.proposer,
      executed: p.executed,
      confirmationCount: p.confirmationCount.toString()
    });
    const conf2 = await multiSig.hasConfirmed(i, signer2Address);
    console.log(`Confirmed by Signer2 (${signer2Address})?`, conf2);

    // Let's test simulate confirmAndExecute(i) from Signer 2
    try {
      await multiSig.confirmAndExecute.staticCall(i, { from: signer2Address });
      console.log(`staticCall confirmAndExecute(${i}) from Signer2 SUCCEEDED!`);
    } catch (err: any) {
      console.log(`staticCall confirmAndExecute(${i}) REVERTED:`, err.message);
      if (err.data) {
        console.log("Revert data:", err.data);
      }
    }
  }

  // Also check if MultiSig has DEFAULT_ADMIN_ROLE on AssetNFT and CredentialRegistry
  const assetNft = await ethers.getContractAt("AssetNFT", "0xef8C3D59C33DF4EC6c35b93d0f02a4661f954a09");
  const credReg = await ethers.getContractAt("CredentialRegistry", "0xB813368bc9E3661F0696FC9D480989c9EF8dba4D");
  const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
  console.log("\nMultiSig has DEFAULT_ADMIN on AssetNFT?", await assetNft.hasRole(DEFAULT_ADMIN_ROLE, multiSigAddress));
  console.log("MultiSig has DEFAULT_ADMIN on CredentialRegistry?", await credReg.hasRole(DEFAULT_ADMIN_ROLE, multiSigAddress));
}

main().catch(console.error);
