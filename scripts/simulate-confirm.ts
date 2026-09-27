import hre from "hardhat";

async function main() {
  const { ethers } = await hre.network.create();
  const multiSigAddress = "0xCADC64eC6f0AA64B02190589588dD91765Bb1204";
  const signer2Address = "0xFA0C7D03A4D536c93e683784A67f4b349031318A";
  
  const provider = ethers.provider;
  const multiSig = await ethers.getContractAt("MultiSigAdmin", multiSigAddress);

  // Proposal 0 details
  const p0 = await multiSig.getProposal(0);
  console.log("Proposal 0:", {
    actionType: p0.actionType.toString(),
    target: p0.target,
    role: p0.role,
    subject: p0.subject,
    assetId: p0.assetId.toString(),
    executed: p0.executed,
    confirmationCount: p0.confirmationCount.toString()
  });

  const ASSET_MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("ASSET_MINTER_ROLE"));
  const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
  console.log("Proposal 0 role:       ", p0.role);
  console.log("ASSET_MINTER_ROLE hash:", ASSET_MINTER_ROLE);
  console.log("MINTER_ROLE hash:      ", MINTER_ROLE);

  const assetNft = await ethers.getContractAt("AssetNFT", p0.target);
  const adminRole = await assetNft.getRoleAdmin(p0.role);
  console.log("Role admin for proposal 0 role:", adminRole);
  console.log("Does MultiSig have this admin role?", await assetNft.hasRole(adminRole, multiSigAddress));
  console.log("Does deployer have this admin role?", await assetNft.hasRole(adminRole, "0x9A884d981f512f77c92B95BDB92206A0AA043Fc9"));

  // Check roles of Commander (0x9A88...)
  console.log("\n--- Commander (0x9A88...) current roles ---");
  console.log("Has ASSET_MINTER_ROLE on AssetNFT?", await assetNft.hasRole(ASSET_MINTER_ROLE, "0x9A884d981f512f77c92B95BDB92206A0AA043Fc9"));
  const STATUS_MANAGER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("STATUS_MANAGER_ROLE"));
  console.log("Has STATUS_MANAGER_ROLE on AssetNFT?", await assetNft.hasRole(STATUS_MANAGER_ROLE, "0x9A884d981f512f77c92B95BDB92206A0AA043Fc9"));
  const credReg = await ethers.getContractAt("CredentialRegistry", "0xB813368bc9E3661F0696FC9D480989c9EF8dba4D");
  const CREDENTIAL_ISSUER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("CREDENTIAL_ISSUER_ROLE"));
  console.log("Has CREDENTIAL_ISSUER_ROLE on CredentialRegistry?", await credReg.hasRole(CREDENTIAL_ISSUER_ROLE, "0x9A884d981f512f77c92B95BDB92206A0AA043Fc9"));

  // Now simulate eth_call from signer2
  const data = multiSig.interface.encodeFunctionData("confirmAndExecute", [0]);
  console.log("\nEncoded call data:", data);
  try {
    const rawResult = await provider.call({
      to: multiSigAddress,
      from: signer2Address,
      data: data,
    });
    console.log("provider.call SUCCESS! Result:", rawResult);
  } catch (err: any) {
    console.log("\nprovider.call REVERTED!");
    console.log("Error reason:", err.reason);
    console.log("Error message:", err.message);
    if (err.data) {
      console.log("Raw revert data:", err.data);
      try {
        const decoded = multiSig.interface.parseError(err.data);
        console.log("Decoded error:", decoded);
      } catch (e) {
        // try decoding standard Error(string)
        try {
          const iface = new ethers.Interface(["function Error(string)"]);
          const dec = iface.decodeFunctionData("Error", err.data);
          console.log("Decoded string error:", dec);
        } catch (e2) {
          console.log("Could not decode error data");
        }
      }
    }
  }
}

main().catch(console.error);
