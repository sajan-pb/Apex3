import hre from "hardhat";

async function main() {
  const { ethers } = await hre.network.create();
  const accessControlAddress = "0xFE760ccd5E57cAF54640dE9A710605991cCe4acD";
  const commander = "0x9A884d981f512f77c92B95BDB92206A0AA043Fc9";

  const accessControl = await ethers.getContractAt("TimeBoundAccessControl", accessControlAddress);
  const MANAGER_ROLE = await accessControl.MANAGER_ROLE();
  console.log("MANAGER_ROLE hash:", MANAGER_ROLE);
  console.log("Commander hasActiveRole(MANAGER_ROLE)?", await accessControl.hasActiveRole(MANAGER_ROLE, commander));
}

main().catch(console.error);
