import { ethers } from "ethers";
import dotenv from "dotenv";

dotenv.config();

async function main() {
  const rpcUrl = "https://ethereum-sepolia-rpc.publicnode.com";
  const provider = new ethers.JsonRpcProvider(rpcUrl);

  const deployer = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY!, provider);
  const signer1 = process.env.SIGNER1_ADDRESS!;
  const signer2 = process.env.SIGNER2_ADDRESS!;
  const signer3 = process.env.SIGNER3_ADDRESS!;
  const treasury = process.env.TREASURY_ADDRESS!;

  console.log("=== SEPOLIA WALLET BALANCES ===");
  console.log("Deployer:", deployer.address, "->", ethers.formatEther(await provider.getBalance(deployer.address)), "ETH");
  console.log("Signer 1:", signer1, "->", ethers.formatEther(await provider.getBalance(signer1)), "ETH");
  console.log("Signer 2:", signer2, "->", ethers.formatEther(await provider.getBalance(signer2)), "ETH");
  console.log("Signer 3:", signer3, "->", ethers.formatEther(await provider.getBalance(signer3)), "ETH");
  console.log("Treasury:", treasury, "->", ethers.formatEther(await provider.getBalance(treasury)), "ETH");
}

main().catch(console.error);
