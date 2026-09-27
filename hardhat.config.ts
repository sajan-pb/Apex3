import { defineConfig } from "hardhat/config";
import hardhatToolboxMochaEthers from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import hardhatVerify from "@nomicfoundation/hardhat-verify";
import dotenv from "dotenv";

dotenv.config();

const DEPLOYER_KEY = process.env.DEPLOYER_PRIVATE_KEY
  ? (process.env.DEPLOYER_PRIVATE_KEY.startsWith("0x")
    ? process.env.DEPLOYER_PRIVATE_KEY
    : `0x${process.env.DEPLOYER_PRIVATE_KEY}`)
  : undefined;

export default defineConfig({
  plugins: [hardhatToolboxMochaEthers, hardhatVerify],
  solidity: {
    version: "0.8.27",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      evmVersion: "cancun",
    },
  },
  networks: {
    ...(process.env.SEPOLIA_RPC_URL && DEPLOYER_KEY
      ? {
          sepolia: {
            type: "http" as const,
            url: process.env.SEPOLIA_RPC_URL,
            accounts: [DEPLOYER_KEY],
          },
        }
      : {}),
  },
  verify: {
    etherscan: {
      apiKey: process.env.ETHERSCAN_API_KEY || "",
    },
    sourcify: {
      enabled: false,
    },
  },
});
