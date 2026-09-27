import hre from "hardhat";

async function main() {
  const { ethers } = await hre.network.create();

  const addresses = {
    CredentialRegistry: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
    AssetNFT: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
    MultiSigAdmin: "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9",
  };

  const [deployer, signer1, signer2, signer3, treasury, tech] = await ethers.getSigners();

  const credentials = await ethers.getContractAt("CredentialRegistry", addresses.CredentialRegistry);
  const multisig = await ethers.getContractAt("MultiSigAdmin", addresses.MultiSigAdmin);

  const CREDENTIAL_ISSUER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("CREDENTIAL_ISSUER_ROLE"));
  console.log("CREDENTIAL_ISSUER_ROLE hash:", CREDENTIAL_ISSUER_ROLE);

  // ActionType.GrantRole = 0 (first entry in the enum)
  const GrantRole = 0;

  console.log("\n--- Step 1: signer1 proposes granting CREDENTIAL_ISSUER_ROLE to signer1 ---");
  const proposeTx = await multisig.connect(signer1).propose(
    GrantRole,
    addresses.CredentialRegistry,   // target
    CREDENTIAL_ISSUER_ROLE,         // role
    signer1.address,                // subject (who receives the role)
    0                                // assetId (unused for GrantRole)
  );
  const proposeReceipt = await proposeTx.wait();
  console.log("Proposal submitted, tx:", proposeReceipt?.hash);

  // proposalCount was incremented after use, so this proposal's id is proposalCount - 1
  // Easiest reliable way: read it back off the contract rather than guessing the index
  const proposalId = 0n; // first-ever proposal on a fresh MultiSigAdmin should be id 0 — verify below

  console.log("\n--- Step 2: check confirmation state after only 1 signer ---");
  const proposalAfter1 = await multisig.getProposal(proposalId);
  console.log("Executed after 1 confirmation?", proposalAfter1.executed);

  console.log("\n--- Step 3: signer2 confirms — this should execute atomically ---");
  const confirmTx = await multisig.connect(signer2).confirmAndExecute(proposalId);
  const confirmReceipt = await confirmTx.wait();
  console.log("Confirm+execute tx:", confirmReceipt?.hash);

  const proposalAfter2 = await multisig.getProposal(proposalId);
  console.log("Executed after 2nd confirmation?", proposalAfter2.executed);

  console.log("\n--- Step 4: confirm signer1 now actually holds CREDENTIAL_ISSUER_ROLE ---");
  const hasRole = await credentials.hasRole(CREDENTIAL_ISSUER_ROLE, signer1.address);
  console.log("signer1 has CREDENTIAL_ISSUER_ROLE?", hasRole);

  console.log("\n--- Step 5: signer1 issues a Level 3 credential to 'tech' ---");
  try {
    const issueTx = await credentials.connect(signer1).issueCredential(
      tech.address,
      ethers.id("CLEARANCE"),
      3,
      0
    );
    await issueTx.wait();
    console.log("Credential issued successfully to", tech.address);
  } catch (e: any) {
    console.log("FAILED to issue credential:", e.reason || e.shortMessage || e.message);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
