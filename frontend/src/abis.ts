/**
 * BEL Trust Chain — Contract ABI fragments
 * Comprehensive ABIs for all 5 deployed contracts.
 */

export const CREDENTIAL_REGISTRY_ABI = [
  "function issueCredential(address subject, bytes32 credType, uint8 level, uint64 expiresAt) external",
  "function revokeCredential(address subject, bytes32 credType) external",
  "function isCredentialValid(address subject, bytes32 credType) external view returns (bool)",
  "function getValidLevel(address subject, bytes32 credType) external view returns (uint8)",
  "function credentials(address, bytes32) external view returns (bool exists, bool revoked, uint8 level, uint64 issuedAt, uint64 expiresAt, uint32 version, address issuer)",
  "function CREDENTIAL_ISSUER_ROLE() external view returns (bytes32)",
  "function CREDENTIAL_ISSUER_ADMIN_ROLE() external view returns (bytes32)",
  "function hasRole(bytes32 role, address account) external view returns (bool)",
  "function grantRole(bytes32 role, address account) external",
  "function revokeRole(bytes32 role, address account) external",
  "event CredentialIssued(address indexed subject, bytes32 indexed credentialType, uint8 level, uint64 issuedAt, uint64 expiresAt, uint32 version, address indexed issuer)",
  "event CredentialRevoked(address indexed subject, bytes32 indexed credentialType, uint32 version, address indexed revoker)",
];

export const ASSET_NFT_ABI = [
  "function mintAsset(bytes32 componentType, bytes32 batchId, uint8 classificationLevel, bytes32 qualityCertHash) external returns (uint256)",
  "function assignCustody(uint256 tokenId, address newCustodian, bytes32 credentialType) external",
  "function transitionStatus(uint256 tokenId, uint8 newStatus) external",
  "function assets(uint256) external view returns (bytes32 componentType, bytes32 batchId, uint8 classificationLevel, uint8 status, address custodian, bytes32 qualityCertHash)",
  "function locked(uint256 tokenId) external view returns (bool)",
  "function frozen(uint256 tokenId) external view returns (bool)",
  "function ownerOf(uint256 tokenId) external view returns (address)",
  "function treasury() external view returns (address)",
  "function STATUS_MANAGER_ROLE() external view returns (bytes32)",
  "function STATUS_ADMIN_ROLE() external view returns (bytes32)",
  "function ASSET_MINTER_ROLE() external view returns (bytes32)",
  "function hasRole(bytes32 role, address account) external view returns (bool)",
  "event AssetMinted(uint256 indexed tokenId, bytes32 componentType, bytes32 batchId, uint8 classificationLevel, address indexed treasury)",
  "event CustodyAssigned(uint256 indexed tokenId, address indexed previousCustodian, address indexed newCustodian)",
  "event AssetStatusChanged(uint256 indexed tokenId, uint8 previousStatus, uint8 newStatus)",
  "event AssetFrozen(uint256 indexed tokenId)",
  "event AssetUnfrozen(uint256 indexed tokenId)",
  "event Locked(uint256 tokenId)",
];

export const DID_REGISTRY_ABI = [
  "function identityOwner(address identity) external view returns (address)",
  "function changeOwner(address identity, address newOwner) external",
  "function addDelegate(address identity, bytes32 delegateType, address delegate, uint256 validity) external",
  "function revokeDelegate(address identity, bytes32 delegateType, address delegate) external",
  "function validDelegate(address identity, bytes32 delegateType, address delegate) external view returns (bool)",
  "function owners(address) external view returns (address)",
  "event DIDOwnerChanged(address indexed identity, address owner, uint256 previousChange)",
  "event DIDDelegateChanged(address indexed identity, bytes32 delegateType, address delegate, uint256 validTo, uint256 previousChange)",
];

export const MULTISIG_ABI = [
  "function propose(uint8 actionType, address target, bytes32 role, address subject, uint256 assetId) external returns (uint256)",
  "function confirmAndExecute(uint256 proposalId) external",
  "function getProposal(uint256 proposalId) external view returns (uint8 actionType, address target, bytes32 role, address subject, uint256 assetId, address proposer, bool executed, uint8 confirmationCount)",
  "function hasConfirmed(uint256 proposalId, address signer) external view returns (bool)",
  "function proposalCount() external view returns (uint256)",
  "function isSigner(address) external view returns (bool)",
  "function signers(uint256) external view returns (address)",
  "function REQUIRED_CONFIRMATIONS() external view returns (uint8)",
  "event ProposalCreated(uint256 indexed proposalId, uint8 actionType, address target, bytes32 role, address subject, uint256 assetId, address indexed proposer)",
  "event ProposalConfirmed(uint256 indexed proposalId, address indexed confirmer, uint8 confirmationCount)",
  "event ProposalExecuted(uint256 indexed proposalId, uint8 actionType)",
];

export const ACCESS_CONTROL_ABI = [
  "function hasActiveRole(bytes32 role, address account) external view returns (bool)",
  "function grantRoleWithExpiry(bytes32 role, address account, uint64 expiresAt) external",
  "function revokeRole(bytes32 role, address account) external",
  "function roleExpiry(address, bytes32) external view returns (uint64)",
  "function ADMIN_ROLE() external view returns (bytes32)",
  "function MANAGER_ROLE() external view returns (bytes32)",
  "function AUDITOR_ROLE() external view returns (bytes32)",
  "function USER_ROLE() external view returns (bytes32)",
  "function RBAC_ADMIN_ROLE() external view returns (bytes32)",
  "function hasRole(bytes32 role, address account) external view returns (bool)",
  "event RoleGrantedWithExpiry(bytes32 indexed role, address indexed account, uint64 expiresAt)",
];
