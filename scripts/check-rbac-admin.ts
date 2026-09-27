import "dotenv/config";
import { ethers } from "ethers";
import fs from "fs";

const deployed = JSON.parse(fs.readFileSync("./deployed-addresses.json", "utf-8"));
const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
const accessControlAbi = [
  "function getRoleAdmin(bytes32) view returns (bytes32)",
  "function hasRole(bytes32, address) view returns (bool)",
  "function RBAC_ADMIN_ROLE() view returns (bytes32)"
];
const contract = new ethers.Contract(deployed.contracts.TimeBoundAccessControl, accessControlAbi, provider);

async function main() {
  const rbacAdminRole = await contract.RBAC_ADMIN_ROLE();
  const adminOfRbacAdmin = await contract.getRoleAdmin(rbacAdminRole);
  console.log("RBAC_ADMIN_ROLE:", rbacAdminRole);
  console.log("Role admin of RBAC_ADMIN_ROLE:", adminOfRbacAdmin);
  console.log("MultiSig has adminOfRbacAdmin?", await contract.hasRole(adminOfRbacAdmin, deployed.contracts.MultiSigAdmin));
  console.log("MultiSig has RBAC_ADMIN_ROLE?", await contract.hasRole(rbacAdminRole, deployed.contracts.MultiSigAdmin));
  console.log("Commander has RBAC_ADMIN_ROLE?", await contract.hasRole(rbacAdminRole, deployed.governance.operator));
}

main().catch(console.error);
