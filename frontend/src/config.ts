import { id } from 'ethers';
import deployedAddresses from './deployed-addresses.json';

/**
 * BEL Trust Chain — Centralized Configuration
 *
 * All contract addresses, chain config, role constants, and helpers.
 */

export const SEPOLIA_CHAIN_ID = 11155111;
export const SEPOLIA_CHAIN_ID_HEX = '0xaa36a7';

export const SEPOLIA_NETWORK_PARAMS = {
  chainId: SEPOLIA_CHAIN_ID_HEX,
  chainName: 'Sepolia Testnet',
  nativeCurrency: { name: 'SepoliaETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: ['https://rpc.sepolia.org'],
  blockExplorerUrls: ['https://sepolia.etherscan.io'],
};

export const ADDRESSES = {
  DIDRegistry: (deployedAddresses as any)?.contracts?.EthereumDIDRegistry || (deployedAddresses as any)?.EthereumDIDRegistry || import.meta.env.VITE_DID_REGISTRY || '0x4767605b63b9A7fc1A53bF1AD99f06a4B06CA023',
  CredentialRegistry: (deployedAddresses as any)?.contracts?.CredentialRegistry || (deployedAddresses as any)?.CredentialRegistry || import.meta.env.VITE_CREDENTIAL_REGISTRY || '0xfCe7fC7Ac8b23e2d6d1CCe1a8F6Dd07C56dc1Bcf',
  AssetNFT: (deployedAddresses as any)?.contracts?.AssetNFT || (deployedAddresses as any)?.AssetNFT || import.meta.env.VITE_ASSET_NFT || '0x0bBA3dB04b6fc58C9521B89E830D4Dd7895916E9',
  AccessControl: (deployedAddresses as any)?.contracts?.TimeBoundAccessControl || (deployedAddresses as any)?.TimeBoundAccessControl || import.meta.env.VITE_ACCESS_CONTROL || '0xfa6113D9276E8a3d133ceaCea06C549Afa40AEdF',
  MultiSig: (deployedAddresses as any)?.contracts?.MultiSigAdmin || (deployedAddresses as any)?.MultiSigAdmin || import.meta.env.VITE_MULTISIG || '0x29E71873c0aB8095eF0D29eCcF7CB19B9FBf815E',
};

export const ASSET_STATUSES = [
  'Manufactured',       // 0
  'QualityCertified',   // 1
  'InService',          // 2
  'InMaintenance',      // 3
  'Suspended',          // 4
  'Decommissioned',     // 5
] as const;

export const ASSET_STATUS_COLORS: Record<string, string> = {
  Manufactured: '#8b5cf6',
  QualityCertified: '#10b981',
  InService: '#3b82f6',
  InMaintenance: '#f59e0b',
  Suspended: '#ef4444',
  Decommissioned: '#6b7280',
};

export const ACTION_TYPES = [
  'GrantRole',
  'RevokeRole',
  'ChangeCredentialIssuer',
  'EmergencyFreeze',
  'UnfreezeAsset',
] as const;

export const ACTION_TYPE_DESCRIPTIONS = [
  'Grant a privileged role on a target contract',
  'Revoke a privileged role on a target contract',
  'Change / authorize CREDENTIAL_ISSUER_ROLE on CredentialRegistry',
  'Emergency freeze a single suspicious or compromised asset on AssetNFT',
  'Unfreeze a previously frozen asset on AssetNFT via board approval',
];

/** Precomputed keccak256 role hashes */
export const ROLES = {
  // TimeBoundAccessControl
  ADMIN_ROLE: id('ADMIN_ROLE'),
  MANAGER_ROLE: id('MANAGER_ROLE'),
  AUDITOR_ROLE: id('AUDITOR_ROLE'),
  USER_ROLE: id('USER_ROLE'),
  RBAC_ADMIN_ROLE: id('RBAC_ADMIN_ROLE'),

  // CredentialRegistry
  CREDENTIAL_ISSUER_ROLE: id('CREDENTIAL_ISSUER_ROLE'),
  CREDENTIAL_ISSUER_ADMIN_ROLE: id('CREDENTIAL_ISSUER_ADMIN_ROLE'),

  // AssetNFT
  ASSET_MINTER_ROLE: id('ASSET_MINTER_ROLE'),
  STATUS_MANAGER_ROLE: id('STATUS_MANAGER_ROLE'),
  STATUS_ADMIN_ROLE: id('STATUS_ADMIN_ROLE'),
};

/** Valid lifecycle transitions: from → allowed targets */
export const VALID_TRANSITIONS: Record<number, number[]> = {
  0: [1],       // Manufactured → QualityCertified
  1: [2],       // QualityCertified → InService
  2: [3, 4],    // InService → InMaintenance, Suspended
  3: [2, 4],    // InMaintenance → InService, Suspended
  4: [2, 5],    // Suspended → InService, Decommissioned
  5: [],        // Decommissioned → none (terminal)
};

export function getExplorerTxUrl(txHash: string): string {
  return `https://sepolia.etherscan.io/tx/${txHash}`;
}

export function getExplorerAddressUrl(address: string): string {
  return `https://sepolia.etherscan.io/address/${address}`;
}
