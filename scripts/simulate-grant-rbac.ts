import "dotenv/config";
import { ethers } from "ethers";
import fs from "fs";

const deployed = JSON.parse(fs.readFileSync("./deployed-addresses.json", "utf-8"));
const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);

async function main() {
  const multiSigAddress = deployed.contracts.MultiSigAdmin;
  const accessControlAddress = deployed.contracts.TimeBoundAccessControl;
  const signer1Address = "0xa128D37463b7233c7338d6Aef0dd5c347BFdcC70";
  const signer2Address = "0xFA0C7D03A4D536c93e683784A67f4b349031318A";
  const commanderAddress = "0x9A884d981f512f77c92B95BDB92206A0AA043Fc9";

  const multiSigAbi = [
    "function propose(uint8, address, bytes32, address, uint256) returns (uint256)",
    "function confirmAndExecute(uint256)",
    "function proposalCount() view returns (uint256)"
  ];
  const accessControlAbi = [
    "function RBAC_ADMIN_ROLE() view returns (bytes32)",
    "function grantRoleWithExpiry(bytes32, address, uint64)",
    "function hasRole(bytes32, address) view returns (bool)",
    "function USER_ROLE() view returns (bytes32)"
  ];

  const multiSig = new ethers.Contract(multiSigAddress, multiSigAbi, provider);
  const accessControl = new ethers.Contract(accessControlAddress, accessControlAbi, provider);

  const RBAC_ADMIN_ROLE = await accessControl.RBAC_ADMIN_ROLE();
  console.log("RBAC_ADMIN_ROLE:", RBAC_ADMIN_ROLE);

  const count = await multiSig.proposalCount();
  console.log("Current proposal count:", count.toString());

  // Encode propose(GrantRole, TimeBoundAccessControl, RBAC_ADMIN_ROLE, commander, 0)
  const proposeData = multiSig.interface.encodeFunctionData("propose", [
    0, // GrantRole
    accessControlAddress,
    RBAC_ADMIN_ROLE,
    commanderAddress,
    0
  ]);

  console.log("Simulating propose from Signer 1...");
  const proposeRes = await provider.call({
    to: multiSigAddress,
    from: signer1Address,
    data: proposeData
  });
  console.log("✔ Propose simulation SUCCESS! Proposal ID will be:", ethers.toBigInt(proposeRes).toString());

  // Simulate confirmAndExecute from Signer 2
  // We can test if MultiSig can call grantRole(RBAC_ADMIN_ROLE, commander)
  console.log("Can MultiSig grant RBAC_ADMIN_ROLE?");
  const iface = new ethers.Interface(["function grantRole(bytes32, address)"]);
  const grantData = iface.encodeFunctionData("grantRole", [RBAC_ADMIN_ROLE, commanderAddress]);
  try {
    await provider.call({
      to: accessControlAddress,
      from: multiSigAddress,
      data: grantData
    });
    console.log("✔ MultiSig -> grantRole(RBAC_ADMIN_ROLE, commander) call simulation SUCCESS!");
  } catch (err: any) {
    console.error("✘ MultiSig grantRole failed:", err.message);
  }
}

main().catch(console.error);
