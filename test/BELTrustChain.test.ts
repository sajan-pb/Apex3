import hre from "hardhat";
import { expect } from "chai";

// Create network connection for all tests (HH3 pattern)
const { ethers, networkHelpers } = await hre.network.create();

/**
 * BEL Trust Chain — Full Verification Matrix Test Suite
 *
 * Covers every item in Section 6 of the build brief.
 * Tests are organized by contract / concern area.
 */

// ============================================================================
// Helper: Deploy the full system
// ============================================================================

async function deployFullSystem() {
  const [deployer, signer1, signer2, signer3, treasury, user1, user2, user3] =
    await ethers.getSigners();

  // 1. Deploy EthereumDIDRegistry
  const DIDRegistry = await ethers.getContractFactory("EthereumDIDRegistry");
  const didRegistry = await DIDRegistry.deploy();
  await didRegistry.waitForDeployment();

  // 2. Deploy CredentialRegistry
  const CredentialRegistry = await ethers.getContractFactory("CredentialRegistry");
  const credentialRegistry = await CredentialRegistry.deploy();
  await credentialRegistry.waitForDeployment();

  // 3. Deploy TimeBoundAccessControl
  const TimeBoundAccessControl = await ethers.getContractFactory("TimeBoundAccessControl");
  const accessControl = await TimeBoundAccessControl.deploy();
  await accessControl.waitForDeployment();

  // 4. Deploy AssetNFT
  const AssetNFT = await ethers.getContractFactory("AssetNFT");
  const assetNFT = await AssetNFT.deploy(
    await treasury.getAddress(),
    await credentialRegistry.getAddress(),
    await didRegistry.getAddress(),
    await accessControl.getAddress()
  );
  await assetNFT.waitForDeployment();

  // 5. Deploy MultiSigAdmin
  const MultiSigAdmin = await ethers.getContractFactory("MultiSigAdmin");
  const multiSig = await MultiSigAdmin.deploy([
    await signer1.getAddress(),
    await signer2.getAddress(),
    await signer3.getAddress(),
  ]);
  await multiSig.waitForDeployment();

  // ---- Grab role constants ----
  const CREDENTIAL_ISSUER_ADMIN_ROLE = await credentialRegistry.CREDENTIAL_ISSUER_ADMIN_ROLE();
  const CREDENTIAL_ISSUER_ROLE = await credentialRegistry.CREDENTIAL_ISSUER_ROLE();
  const STATUS_ADMIN_ROLE = await assetNFT.STATUS_ADMIN_ROLE();
  const STATUS_MANAGER_ROLE = await assetNFT.STATUS_MANAGER_ROLE();
  const ASSET_MINTER_ROLE = await assetNFT.ASSET_MINTER_ROLE();
  const RBAC_ADMIN_ROLE = await accessControl.RBAC_ADMIN_ROLE();
  const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
  const multiSigAddr = await multiSig.getAddress();

  // ---- Wire up governance: grant admin roles to MultiSigAdmin ----
  // Deployer has DEFAULT_ADMIN_ROLE which is the admin for the *_ADMIN_ROLE roles
  await credentialRegistry.grantRole(CREDENTIAL_ISSUER_ADMIN_ROLE, multiSigAddr);
  await assetNFT.grantRole(STATUS_ADMIN_ROLE, multiSigAddr);
  await accessControl.grantRole(RBAC_ADMIN_ROLE, multiSigAddr);

  // Also give MultiSigAdmin DEFAULT_ADMIN_ROLE on each contract so governance can manage
  await credentialRegistry.grantRole(DEFAULT_ADMIN_ROLE, multiSigAddr);
  await assetNFT.grantRole(DEFAULT_ADMIN_ROLE, multiSigAddr);
  await accessControl.grantRole(DEFAULT_ADMIN_ROLE, multiSigAddr);

  return {
    deployer, signer1, signer2, signer3, treasury,
    user1, user2, user3,
    didRegistry, credentialRegistry, assetNFT, accessControl, multiSig,
    CREDENTIAL_ISSUER_ADMIN_ROLE, STATUS_ADMIN_ROLE, RBAC_ADMIN_ROLE,
    CREDENTIAL_ISSUER_ROLE, ASSET_MINTER_ROLE, STATUS_MANAGER_ROLE,
    DEFAULT_ADMIN_ROLE,
  };
}

/**
 * Deploy system AND grant operational roles to the deployer for convenient testing.
 * The deployer still holds DEFAULT_ADMIN_ROLE here — not yet renounced.
 *
 * CREDENTIAL_ISSUER_ROLE admin is CREDENTIAL_ISSUER_ADMIN_ROLE.
 * STATUS_MANAGER_ROLE admin is STATUS_ADMIN_ROLE.
 * ASSET_MINTER_ROLE admin is DEFAULT_ADMIN_ROLE (OZ default since we didn't call _setRoleAdmin for it).
 *
 * So we need to grant deployer the correct admin roles first, then grant operational roles.
 */
async function deployWithOperationalRoles() {
  const system = await deployFullSystem();
  const {
    deployer, credentialRegistry, assetNFT, accessControl,
    CREDENTIAL_ISSUER_ROLE, CREDENTIAL_ISSUER_ADMIN_ROLE,
    ASSET_MINTER_ROLE, STATUS_MANAGER_ROLE, STATUS_ADMIN_ROLE,
  } = system;

  const deployerAddr = await deployer.getAddress();

  // Deployer has DEFAULT_ADMIN_ROLE, which is admin-of all the *_ADMIN_ROLE roles.
  // Grant deployer the intermediate admin roles so it can grant operational roles.
  await credentialRegistry.grantRole(CREDENTIAL_ISSUER_ADMIN_ROLE, deployerAddr);
  await assetNFT.grantRole(STATUS_ADMIN_ROLE, deployerAddr);

  // Now grant operational roles to deployer
  await credentialRegistry.grantRole(CREDENTIAL_ISSUER_ROLE, deployerAddr);
  await assetNFT.grantRole(ASSET_MINTER_ROLE, deployerAddr);
  await assetNFT.grantRole(STATUS_MANAGER_ROLE, deployerAddr);

  // Grant deployer active MANAGER_ROLE in TimeBoundAccessControl for operational actions
  const MANAGER_ROLE = await accessControl.MANAGER_ROLE();
  const RBAC_ADMIN_ROLE = await accessControl.RBAC_ADMIN_ROLE();
  await accessControl.grantRole(RBAC_ADMIN_ROLE, deployerAddr);
  await accessControl.grantRoleWithExpiry(MANAGER_ROLE, deployerAddr, 0); // permanent for test deployer

  return system;
}

// ============================================================================
// Test Suite: ERC-5192 Soulbound Token
// ============================================================================

describe("AssetNFT — ERC-5192 Soulbound", function () {
  it("locked() returns true on an existing token", async function () {
    const sys = await deployWithOperationalRoles();
    const componentType = ethers.encodeBytes32String("RADAR");
    const batchId = ethers.encodeBytes32String("BATCH001");
    const certHash = ethers.keccak256(ethers.toUtf8Bytes("quality-cert"));

    await sys.assetNFT.mintAsset(componentType, batchId, 3, certHash);
    expect(await sys.assetNFT.locked(0)).to.equal(true);
  });

  it("locked() reverts on an invalid/nonexistent token", async function () {
    const sys = await deployWithOperationalRoles();
    await expect(sys.assetNFT.locked(999)).to.be.revert(ethers);
  });

  it("supportsInterface(0xb45a3c0e) returns true", async function () {
    const sys = await deployWithOperationalRoles();
    expect(await sys.assetNFT.supportsInterface("0xb45a3c0e")).to.equal(true);
  });

  it("emits Locked event on mint", async function () {
    const sys = await deployWithOperationalRoles();
    const componentType = ethers.encodeBytes32String("RADAR");
    const batchId = ethers.encodeBytes32String("BATCH001");
    const certHash = ethers.keccak256(ethers.toUtf8Bytes("quality-cert"));

    await expect(sys.assetNFT.mintAsset(componentType, batchId, 3, certHash))
      .to.emit(sys.assetNFT, "Locked")
      .withArgs(0);
  });
});

// ============================================================================
// Test Suite: Soulbound — transfer always reverts
// ============================================================================

describe("AssetNFT — Soulbound Transfer Block", function () {
  it("transferFrom always reverts", async function () {
    const sys = await deployWithOperationalRoles();
    const componentType = ethers.encodeBytes32String("RADAR");
    const batchId = ethers.encodeBytes32String("BATCH001");
    const certHash = ethers.keccak256(ethers.toUtf8Bytes("quality-cert"));

    await sys.assetNFT.mintAsset(componentType, batchId, 3, certHash);

    const treasuryAddr = await sys.treasury.getAddress();
    const user1Addr = await sys.user1.getAddress();

    await expect(
      sys.assetNFT.connect(sys.treasury).transferFrom(treasuryAddr, user1Addr, 0)
    ).to.be.revert(ethers);
  });
});

// ============================================================================
// Test Suite: CredentialRegistry — revocation and expiry
// ============================================================================

describe("CredentialRegistry — Revocation & Expiry", function () {
  it("revoked credential fails authorization even if level is sufficient", async function () {
    const sys = await deployWithOperationalRoles();
    const credType = ethers.encodeBytes32String("CLEARANCE");
    const user1Addr = await sys.user1.getAddress();

    await sys.credentialRegistry.issueCredential(user1Addr, credType, 5, 0);
    await sys.credentialRegistry.revokeCredential(user1Addr, credType);

    expect(await sys.credentialRegistry.isCredentialValid(user1Addr, credType))
      .to.equal(false);
  });

  it("expired credential fails authorization", async function () {
    const sys = await deployWithOperationalRoles();
    const credType = ethers.encodeBytes32String("CLEARANCE");
    const user1Addr = await sys.user1.getAddress();
    const now = (await ethers.provider.getBlock("latest"))!.timestamp;

    await sys.credentialRegistry.issueCredential(user1Addr, credType, 5, now + 10);
    await networkHelpers.time.increase(20);

    expect(await sys.credentialRegistry.isCredentialValid(user1Addr, credType))
      .to.equal(false);
  });
});

// ============================================================================
// Test Suite: Clearance level checks
// ============================================================================

describe("AssetNFT — Clearance Level Enforcement", function () {
  async function setupCustodyTest() {
    const sys = await deployWithOperationalRoles();
    const componentType = ethers.encodeBytes32String("RADAR");
    const batchId = ethers.encodeBytes32String("BATCH001");
    const certHash = ethers.keccak256(ethers.toUtf8Bytes("quality-cert"));
    const credType = ethers.encodeBytes32String("CLEARANCE");

    // Mint asset with classificationLevel 3
    await sys.assetNFT.mintAsset(componentType, batchId, 3, certHash);
    // Transition to InService
    await sys.assetNFT.transitionStatus(0, 1); // Manufactured -> QualityCertified
    await sys.assetNFT.transitionStatus(0, 2); // QualityCertified -> InService

    return { ...sys, credType };
  }

  it("higher-than-required clearance level succeeds", async function () {
    const sys = await setupCustodyTest();
    const user1Addr = await sys.user1.getAddress();

    await sys.credentialRegistry.issueCredential(user1Addr, sys.credType, 5, 0);
    await expect(sys.assetNFT.assignCustody(0, user1Addr, sys.credType))
      .to.not.be.revert(ethers);
  });

  it("equal clearance level succeeds", async function () {
    const sys = await setupCustodyTest();
    const user1Addr = await sys.user1.getAddress();

    await sys.credentialRegistry.issueCredential(user1Addr, sys.credType, 3, 0);
    await expect(sys.assetNFT.assignCustody(0, user1Addr, sys.credType))
      .to.not.be.revert(ethers);
  });

  it("lower clearance level reverts", async function () {
    const sys = await setupCustodyTest();
    const user1Addr = await sys.user1.getAddress();

    await sys.credentialRegistry.issueCredential(user1Addr, sys.credType, 1, 0);
    await expect(sys.assetNFT.assignCustody(0, user1Addr, sys.credType))
      .to.be.revertedWith("Insufficient clearance level");
  });
});

// ============================================================================
// Test Suite: RBAC role check independent of clearance
// ============================================================================

describe("AssetNFT — RBAC Check Independent of Clearance", function () {
  it("wrong RBAC role fails even if clearance is sufficient", async function () {
    const sys = await deployWithOperationalRoles();
    const componentType = ethers.encodeBytes32String("RADAR");
    const batchId = ethers.encodeBytes32String("BATCH001");
    const certHash = ethers.keccak256(ethers.toUtf8Bytes("quality-cert"));
    const credType = ethers.encodeBytes32String("CLEARANCE");

    await sys.assetNFT.mintAsset(componentType, batchId, 3, certHash);
    await sys.assetNFT.transitionStatus(0, 1);
    await sys.assetNFT.transitionStatus(0, 2);

    const user1Addr = await sys.user1.getAddress();
    await sys.credentialRegistry.issueCredential(user1Addr, credType, 5, 0);

    // user1 does NOT have STATUS_MANAGER_ROLE
    await expect(
      sys.assetNFT.connect(sys.user1).assignCustody(0, user1Addr, credType)
    ).to.be.revert(ethers);
  });

  it("caller with STATUS_MANAGER_ROLE but without TimeBoundAccessControl MANAGER_ROLE reverts", async function () {
    const sys = await deployWithOperationalRoles();
    const componentType = ethers.encodeBytes32String("RADAR");
    const batchId = ethers.encodeBytes32String("BATCH001");
    const certHash = ethers.keccak256(ethers.toUtf8Bytes("quality-cert"));
    const credType = ethers.encodeBytes32String("CLEARANCE");

    await sys.assetNFT.mintAsset(componentType, batchId, 3, certHash);
    await sys.assetNFT.transitionStatus(0, 1);
    await sys.assetNFT.transitionStatus(0, 2);

    const user1Addr = await sys.user1.getAddress();
    await sys.credentialRegistry.issueCredential(user1Addr, credType, 5, 0);

    // Grant user1 STATUS_MANAGER_ROLE on AssetNFT, but do NOT grant MANAGER_ROLE on TimeBoundAccessControl
    await sys.assetNFT.grantRole(sys.STATUS_MANAGER_ROLE, user1Addr);

    // Calling assignCustody reverts on TimeBoundAccessControl gate
    await expect(
      sys.assetNFT.connect(sys.user1).assignCustody(0, user1Addr, credType)
    ).to.be.revertedWith("Operator lacking active RBAC role");

    // Calling transitionStatus reverts on TimeBoundAccessControl gate
    await expect(
      sys.assetNFT.connect(sys.user1).transitionStatus(0, 3)
    ).to.be.revertedWith("Operator lacking active RBAC role");
  });

  it("caller with expired TimeBoundAccessControl role reverts even if STATUS_MANAGER_ROLE is held", async function () {
    const sys = await deployWithOperationalRoles();
    const componentType = ethers.encodeBytes32String("RADAR");
    const batchId = ethers.encodeBytes32String("BATCH001");
    const certHash = ethers.keccak256(ethers.toUtf8Bytes("quality-cert"));
    const credType = ethers.encodeBytes32String("CLEARANCE");

    await sys.assetNFT.mintAsset(componentType, batchId, 3, certHash);
    await sys.assetNFT.transitionStatus(0, 1);
    await sys.assetNFT.transitionStatus(0, 2);

    const user1Addr = await sys.user1.getAddress();
    await sys.credentialRegistry.issueCredential(user1Addr, credType, 5, 0);

    // Grant user1 STATUS_MANAGER_ROLE on AssetNFT
    await sys.assetNFT.grantRole(sys.STATUS_MANAGER_ROLE, user1Addr);

    // Grant user1 MANAGER_ROLE on TimeBoundAccessControl with short expiry (10 seconds)
    const MANAGER_ROLE = await sys.accessControl.MANAGER_ROLE();
    const currentBlock = await ethers.provider.getBlock("latest");
    const expiresAt = (currentBlock?.timestamp ?? Math.floor(Date.now() / 1000)) + 10;
    await sys.accessControl.grantRoleWithExpiry(MANAGER_ROLE, user1Addr, expiresAt);

    // Before expiry: succeeds
    await expect(
      sys.assetNFT.connect(sys.user1).assignCustody(0, user1Addr, credType)
    ).to.emit(sys.assetNFT, "CustodyAssigned");

    // Fast-forward time past expiration
    await networkHelpers.time.increase(20);

    // After expiry: reverts with "Operator lacking active RBAC role"
    await expect(
      sys.assetNFT.connect(sys.user1).transitionStatus(0, 3)
    ).to.be.revertedWith("Operator lacking active RBAC role");
  });
});

// ============================================================================
// Test Suite: Lifecycle transitions
// ============================================================================

describe("AssetNFT — Lifecycle Transitions", function () {
  async function mintAsset() {
    const sys = await deployWithOperationalRoles();
    const componentType = ethers.encodeBytes32String("RADAR");
    const batchId = ethers.encodeBytes32String("BATCH001");
    const certHash = ethers.keccak256(ethers.toUtf8Bytes("quality-cert"));
    await sys.assetNFT.mintAsset(componentType, batchId, 3, certHash);
    return sys;
  }

  it("valid transitions succeed (full path)", async function () {
    const sys = await mintAsset();
    await expect(sys.assetNFT.transitionStatus(0, 1)).to.not.be.revert(ethers);
    await expect(sys.assetNFT.transitionStatus(0, 2)).to.not.be.revert(ethers);
    await expect(sys.assetNFT.transitionStatus(0, 3)).to.not.be.revert(ethers);
    await expect(sys.assetNFT.transitionStatus(0, 4)).to.not.be.revert(ethers);
    await expect(sys.assetNFT.transitionStatus(0, 5)).to.not.be.revert(ethers);
  });

  const invalidTransitions: [number, number, string][] = [
    [0, 2, "Manufactured -> InService"],
    [0, 3, "Manufactured -> InMaintenance"],
    [0, 4, "Manufactured -> Suspended"],
    [0, 5, "Manufactured -> Decommissioned"],
    [1, 0, "QualityCertified -> Manufactured"],
    [1, 3, "QualityCertified -> InMaintenance"],
    [1, 4, "QualityCertified -> Suspended"],
    [1, 5, "QualityCertified -> Decommissioned"],
    [2, 0, "InService -> Manufactured"],
    [2, 1, "InService -> QualityCertified"],
    [2, 5, "InService -> Decommissioned"],
    [3, 0, "InMaintenance -> Manufactured"],
    [3, 1, "InMaintenance -> QualityCertified"],
    [3, 3, "InMaintenance -> InMaintenance"],
    [3, 5, "InMaintenance -> Decommissioned"],
    [4, 0, "Suspended -> Manufactured"],
    [4, 1, "Suspended -> QualityCertified"],
    [4, 3, "Suspended -> InMaintenance"],
    [4, 4, "Suspended -> Suspended"],
  ];

  // Valid path to reach each status
  const pathTo: Record<number, number[]> = {
    0: [],
    1: [1],
    2: [1, 2],
    3: [1, 2, 3],
    4: [1, 2, 4],
  };

  for (const [from, to, label] of invalidTransitions) {
    it(`invalid transition reverts: ${label}`, async function () {
      const sys = await mintAsset();

      for (const step of pathTo[from]!) {
        await sys.assetNFT.transitionStatus(0, step);
      }

      await expect(sys.assetNFT.transitionStatus(0, to))
        .to.be.revertedWith("Invalid status transition");
    });
  }

  it("Decommissioned never transitions to anything", async function () {
    const sys = await mintAsset();
    // Drive to Decommissioned: 0->1->2->4->5
    await sys.assetNFT.transitionStatus(0, 1);
    await sys.assetNFT.transitionStatus(0, 2);
    await sys.assetNFT.transitionStatus(0, 4);
    await sys.assetNFT.transitionStatus(0, 5);

    for (let target = 0; target <= 5; target++) {
      await expect(sys.assetNFT.transitionStatus(0, target))
        .to.be.revertedWith("Invalid status transition");
    }
  });
});

// ============================================================================
// Test Suite: Classification level immutability
// ============================================================================

describe("AssetNFT — Classification Level Immutability", function () {
  it("classificationLevel cannot be changed after mint", async function () {
    const sys = await deployWithOperationalRoles();
    const componentType = ethers.encodeBytes32String("RADAR");
    const batchId = ethers.encodeBytes32String("BATCH001");
    const certHash = ethers.keccak256(ethers.toUtf8Bytes("quality-cert"));

    await sys.assetNFT.mintAsset(componentType, batchId, 3, certHash);

    const asset = await sys.assetNFT.assets(0);
    expect(asset.classificationLevel).to.equal(3);

    // No setter function exists — immutable by design.
    // Verify value persists through status transitions.
    await sys.assetNFT.transitionStatus(0, 1);
    await sys.assetNFT.transitionStatus(0, 2);

    const assetAfter = await sys.assetNFT.assets(0);
    expect(assetAfter.classificationLevel).to.equal(3);
  });
});

// ============================================================================
// Test Suite: MultiSigAdmin — 2-of-3 governance
// ============================================================================

describe("MultiSigAdmin — 2-of-3 Governance", function () {
  it("single confirmation (1-of-3) leaves state unchanged", async function () {
    const sys = await deployFullSystem();
    const credRegAddr = await sys.credentialRegistry.getAddress();
    const user1Addr = await sys.user1.getAddress();

    await sys.multiSig.connect(sys.signer1).propose(
      0, credRegAddr, sys.CREDENTIAL_ISSUER_ROLE, user1Addr, 0
    );

    const proposal = await sys.multiSig.getProposal(0);
    expect(proposal.confirmationCount).to.equal(1);
    expect(proposal.executed).to.equal(false);

    expect(await sys.credentialRegistry.hasRole(sys.CREDENTIAL_ISSUER_ROLE, user1Addr))
      .to.equal(false);
  });

  it("second confirmation (2-of-3) executes atomically", async function () {
    const sys = await deployFullSystem();
    const credRegAddr = await sys.credentialRegistry.getAddress();
    const user1Addr = await sys.user1.getAddress();

    await sys.multiSig.connect(sys.signer1).propose(
      0, credRegAddr, sys.CREDENTIAL_ISSUER_ROLE, user1Addr, 0
    );
    await sys.multiSig.connect(sys.signer2).confirmAndExecute(0);

    const proposal = await sys.multiSig.getProposal(0);
    expect(proposal.confirmationCount).to.equal(2);
    expect(proposal.executed).to.equal(true);

    expect(await sys.credentialRegistry.hasRole(sys.CREDENTIAL_ISSUER_ROLE, user1Addr))
      .to.equal(true);
  });
});

// ============================================================================
// Test Suite: Reentrancy guard on MultiSigAdmin
// ============================================================================

describe("MultiSigAdmin — Reentrancy Guard", function () {
  it("reentrant call to confirmAndExecute reverts, original action completes", async function () {
    const [deployer, signer1, signer2, signer3] = await ethers.getSigners();

    // Deploy a MaliciousTarget that will re-enter MultiSigAdmin during grantRole
    const MaliciousTargetFactory = await ethers.getContractFactory("MaliciousTarget");
    const maliciousTarget = await MaliciousTargetFactory.deploy();
    await maliciousTarget.waitForDeployment();

    // Deploy MultiSigAdmin with signer1, signer2, signer3
    const MultiSigAdmin = await ethers.getContractFactory("MultiSigAdmin");
    const multiSig = await MultiSigAdmin.deploy([
      await signer1.getAddress(),
      await signer2.getAddress(),
      await signer3.getAddress(),
    ]);
    await multiSig.waitForDeployment();

    const maliciousAddr = await maliciousTarget.getAddress();
    const multiSigAddr = await multiSig.getAddress();
    const someRole = ethers.keccak256(ethers.toUtf8Bytes("SOME_ROLE"));

    // Give MultiSigAdmin DEFAULT_ADMIN_ROLE on MaliciousTarget so grantRole succeeds
    await maliciousTarget.grantRole(ethers.ZeroHash, multiSigAddr);

    // Proposal 0: GrantRole on MaliciousTarget (this will trigger re-entry)
    await multiSig.connect(signer1).propose(
      0, // GrantRole
      maliciousAddr,
      someRole,
      await signer3.getAddress(),
      0
    );

    // Proposal 1: another GrantRole (the re-entry target)
    await multiSig.connect(signer1).propose(
      0, // GrantRole
      maliciousAddr,
      someRole,
      await signer2.getAddress(),
      0
    );

    // signer2 also confirms proposal 1 (so it has 1 confirmation from signer1 + will need signer2)
    // Actually proposal 1 was proposed by signer1 (1 confirmation). We need signer2 to confirm it
    // during re-entry. But signer2 is the one confirming proposal 0.
    // The re-entry: during execution of proposal 0, MaliciousTarget.grantRole calls back to
    // multiSig.confirmAndExecute(1). Since signer2 called proposal 0's confirmAndExecute, and
    // nonReentrant is on, this re-entrant call should be blocked.

    // Set up the attack: when grantRole is called on MaliciousTarget, it re-enters
    // multiSig.confirmAndExecute(1)
    await maliciousTarget.setAttackParams(multiSigAddr, 1);

    // signer2 confirms proposal 0 → executes → calls MaliciousTarget.grantRole → re-entry attempt
    // The original call should still succeed despite the re-entry being blocked
    await multiSig.connect(signer2).confirmAndExecute(0);

    // Verify: proposal 0 executed successfully (the original action completed)
    const proposal0 = await multiSig.getProposal(0);
    expect(proposal0.executed).to.equal(true);

    // Verify: the re-entry was attempted but failed
    expect(await maliciousTarget.attackAttempted()).to.equal(true);
    expect(await maliciousTarget.reentrySucceeded()).to.equal(false);

    // Verify: proposal 1 was NOT executed by the re-entrant call
    const proposal1 = await multiSig.getProposal(1);
    expect(proposal1.executed).to.equal(false);
  });
});

// ============================================================================
// Test Suite: Deployer renouncement
// ============================================================================

describe("Deployment — Deployer Renouncement", function () {
  it("deployer cannot perform privileged operations after renouncement", async function () {
    const sys = await deployFullSystem();
    const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
    const deployerAddr = await sys.deployer.getAddress();

    // Renounce DEFAULT_ADMIN_ROLE from all contracts
    await sys.credentialRegistry.renounceRole(DEFAULT_ADMIN_ROLE, deployerAddr);
    await sys.assetNFT.renounceRole(DEFAULT_ADMIN_ROLE, deployerAddr);
    await sys.accessControl.renounceRole(DEFAULT_ADMIN_ROLE, deployerAddr);

    expect(await sys.credentialRegistry.hasRole(DEFAULT_ADMIN_ROLE, deployerAddr))
      .to.equal(false);
    expect(await sys.assetNFT.hasRole(DEFAULT_ADMIN_ROLE, deployerAddr))
      .to.equal(false);
    expect(await sys.accessControl.hasRole(DEFAULT_ADMIN_ROLE, deployerAddr))
      .to.equal(false);

    // Deployer attempts to grant a role — should revert
    await expect(
      sys.credentialRegistry.grantRole(sys.CREDENTIAL_ISSUER_ADMIN_ROLE, deployerAddr)
    ).to.be.revert(ethers);

    await expect(
      sys.assetNFT.grantRole(sys.ASSET_MINTER_ROLE, deployerAddr)
    ).to.be.revert(ethers);
  });
});

// ============================================================================
// Test Suite: MultiSigAdmin holds correct admin roles after deployment
// ============================================================================

describe("Deployment — MultiSigAdmin Holds Admin Roles", function () {
  it("MultiSigAdmin holds RBAC_ADMIN_ROLE, CREDENTIAL_ISSUER_ADMIN_ROLE, STATUS_ADMIN_ROLE", async function () {
    const sys = await deployFullSystem();
    const multiSigAddr = await sys.multiSig.getAddress();

    expect(await sys.credentialRegistry.hasRole(sys.CREDENTIAL_ISSUER_ADMIN_ROLE, multiSigAddr))
      .to.equal(true);
    expect(await sys.assetNFT.hasRole(sys.STATUS_ADMIN_ROLE, multiSigAddr))
      .to.equal(true);
    expect(await sys.accessControl.hasRole(sys.RBAC_ADMIN_ROLE, multiSigAddr))
      .to.equal(true);
  });
});

// ============================================================================
// Test Suite: Unauthorized operations
// ============================================================================

describe("Authorization — Unauthorized Operations Revert", function () {
  it("unauthorized credential issuance reverts", async function () {
    const sys = await deployFullSystem();
    const credType = ethers.encodeBytes32String("CLEARANCE");

    await expect(
      sys.credentialRegistry.connect(sys.user1).issueCredential(
        await sys.user2.getAddress(), credType, 3, 0
      )
    ).to.be.revert(ethers);
  });

  it("unauthorized credential revocation reverts", async function () {
    const sys = await deployWithOperationalRoles();
    const credType = ethers.encodeBytes32String("CLEARANCE");
    const user2Addr = await sys.user2.getAddress();

    await sys.credentialRegistry.issueCredential(user2Addr, credType, 3, 0);

    await expect(
      sys.credentialRegistry.connect(sys.user1).revokeCredential(user2Addr, credType)
    ).to.be.revert(ethers);
  });

  it("unauthorized asset status change reverts", async function () {
    const sys = await deployWithOperationalRoles();
    const componentType = ethers.encodeBytes32String("RADAR");
    const batchId = ethers.encodeBytes32String("BATCH001");
    const certHash = ethers.keccak256(ethers.toUtf8Bytes("quality-cert"));

    await sys.assetNFT.mintAsset(componentType, batchId, 3, certHash);

    await expect(
      sys.assetNFT.connect(sys.user1).transitionStatus(0, 1)
    ).to.be.revert(ethers);
  });

  it("unauthorized custody assignment reverts", async function () {
    const sys = await deployWithOperationalRoles();
    const componentType = ethers.encodeBytes32String("RADAR");
    const batchId = ethers.encodeBytes32String("BATCH001");
    const certHash = ethers.keccak256(ethers.toUtf8Bytes("quality-cert"));
    const credType = ethers.encodeBytes32String("CLEARANCE");

    await sys.assetNFT.mintAsset(componentType, batchId, 3, certHash);
    await sys.assetNFT.transitionStatus(0, 1);
    await sys.assetNFT.transitionStatus(0, 2);

    const user1Addr = await sys.user1.getAddress();
    await sys.credentialRegistry.issueCredential(user1Addr, credType, 5, 0);

    await expect(
      sys.assetNFT.connect(sys.user1).assignCustody(0, user1Addr, credType)
    ).to.be.revert(ethers);
  });
});

// ============================================================================
// Test Suite: Credential issuer replacement via governance
// ============================================================================

describe("Governance — Credential Issuer Replacement", function () {
  it("old issuer revoked, new issuer granted, old fails, new succeeds", async function () {
    const sys = await deployFullSystem();
    const credRegAddr = await sys.credentialRegistry.getAddress();
    const user1Addr = await sys.user1.getAddress();
    const user2Addr = await sys.user2.getAddress();
    const user3Addr = await sys.user3.getAddress();

    // Step 1: Grant CREDENTIAL_ISSUER_ROLE to user1 via governance
    await sys.multiSig.connect(sys.signer1).propose(
      0, credRegAddr, sys.CREDENTIAL_ISSUER_ROLE, user1Addr, 0
    );
    await sys.multiSig.connect(sys.signer2).confirmAndExecute(0);

    // Verify user1 can issue
    const credType = ethers.encodeBytes32String("CLEARANCE");
    await sys.credentialRegistry.connect(sys.user1).issueCredential(user2Addr, credType, 3, 0);
    expect(await sys.credentialRegistry.isCredentialValid(user2Addr, credType)).to.equal(true);

    // Step 2: Revoke CREDENTIAL_ISSUER_ROLE from user1 via governance
    await sys.multiSig.connect(sys.signer1).propose(
      1, credRegAddr, sys.CREDENTIAL_ISSUER_ROLE, user1Addr, 0
    );
    await sys.multiSig.connect(sys.signer2).confirmAndExecute(1);

    // Step 3: Grant CREDENTIAL_ISSUER_ROLE to user3 via governance
    await sys.multiSig.connect(sys.signer1).propose(
      0, credRegAddr, sys.CREDENTIAL_ISSUER_ROLE, user3Addr, 0
    );
    await sys.multiSig.connect(sys.signer2).confirmAndExecute(2);

    // Step 4: Old issuer (user1) fails
    const trainType = ethers.encodeBytes32String("TRAINING");
    await expect(
      sys.credentialRegistry.connect(sys.user1).issueCredential(user2Addr, trainType, 1, 0)
    ).to.be.revert(ethers);

    // Step 5: New issuer (user3) succeeds
    await sys.credentialRegistry.connect(sys.user3).issueCredential(user2Addr, trainType, 1, 0);
    expect(await sys.credentialRegistry.isCredentialValid(user2Addr, trainType)).to.equal(true);
  });
});

// ============================================================================
// Test Suite: TimeBoundAccessControl
// ============================================================================

describe("TimeBoundAccessControl — Time-bound Roles", function () {
  it("expired role returns false from hasActiveRole", async function () {
    const sys = await deployFullSystem();
    const deployerAddr = await sys.deployer.getAddress();
    const user1Addr = await sys.user1.getAddress();
    const ADMIN_ROLE = await sys.accessControl.ADMIN_ROLE();
    const now = (await ethers.provider.getBlock("latest"))!.timestamp;

    // Deployer grants itself RBAC_ADMIN_ROLE to call grantRoleWithExpiry
    await sys.accessControl.grantRole(sys.RBAC_ADMIN_ROLE, deployerAddr);
    await sys.accessControl.grantRoleWithExpiry(ADMIN_ROLE, user1Addr, now + 10);

    expect(await sys.accessControl.hasActiveRole(ADMIN_ROLE, user1Addr)).to.equal(true);

    await networkHelpers.time.increase(20);

    expect(await sys.accessControl.hasActiveRole(ADMIN_ROLE, user1Addr)).to.equal(false);
  });
});

// ============================================================================
// Test Suite: EmergencyFreeze
// ============================================================================

describe("AssetNFT — EmergencyFreeze", function () {
  it("frozen asset blocks custody assignment and status transition", async function () {
    const sys = await deployWithOperationalRoles();
    const componentType = ethers.encodeBytes32String("RADAR");
    const batchId = ethers.encodeBytes32String("BATCH001");
    const certHash = ethers.keccak256(ethers.toUtf8Bytes("quality-cert"));
    const credType = ethers.encodeBytes32String("CLEARANCE");

    await sys.assetNFT.mintAsset(componentType, batchId, 3, certHash);
    await sys.assetNFT.transitionStatus(0, 1);
    await sys.assetNFT.transitionStatus(0, 2);

    // Deployer grants itself STATUS_ADMIN_ROLE so it can freeze
    const deployerAddr = await sys.deployer.getAddress();
    await sys.assetNFT.grantRole(sys.STATUS_ADMIN_ROLE, deployerAddr);
    await sys.assetNFT.freezeAsset(0);

    // Status transition blocked
    await expect(sys.assetNFT.transitionStatus(0, 3))
      .to.be.revertedWith("Asset is frozen");

    // Custody assignment blocked
    const user1Addr = await sys.user1.getAddress();
    await sys.credentialRegistry.issueCredential(user1Addr, credType, 5, 0);
    await expect(sys.assetNFT.assignCustody(0, user1Addr, credType))
      .to.be.revertedWith("Asset is frozen");
  });

  it("frozen asset can be unfrozen via 2-of-3 governance and custody/status succeed afterward", async function () {
    const sys = await deployWithOperationalRoles();
    const componentType = ethers.encodeBytes32String("RADAR");
    const batchId = ethers.encodeBytes32String("BATCH001");
    const certHash = ethers.keccak256(ethers.toUtf8Bytes("quality-cert"));
    const credType = ethers.encodeBytes32String("CLEARANCE");

    await sys.assetNFT.mintAsset(componentType, batchId, 3, certHash);
    await sys.assetNFT.transitionStatus(0, 1);
    await sys.assetNFT.transitionStatus(0, 2);

    const assetNftAddr = await sys.assetNFT.getAddress();

    // 1. Propose & Confirm EmergencyFreeze (ActionType 3) via 2-of-3 MultiSig
    // ActionType: GrantRole=0, RevokeRole=1, ChangeCredentialIssuer=2, EmergencyFreeze=3, UnfreezeAsset=4
    const freezeTx = await sys.multiSig.connect(sys.signer1).propose(
      3, // EmergencyFreeze
      assetNftAddr,
      ethers.ZeroHash,
      ethers.ZeroAddress,
      0 // tokenId
    );
    await freezeTx.wait();
    await sys.multiSig.connect(sys.signer2).confirmAndExecute(0);

    // Verify asset is frozen
    expect(await sys.assetNFT.frozen(0)).to.equal(true);

    // Verify custody and status transitions revert
    const user1Addr = await sys.user1.getAddress();
    await sys.credentialRegistry.issueCredential(user1Addr, credType, 5, 0);
    await expect(sys.assetNFT.assignCustody(0, user1Addr, credType))
      .to.be.revertedWith("Asset is frozen");
    await expect(sys.assetNFT.transitionStatus(0, 3))
      .to.be.revertedWith("Asset is frozen");

    // 2. Propose & Confirm UnfreezeAsset (ActionType 4) via 2-of-3 MultiSig
    const unfreezeTx = await sys.multiSig.connect(sys.signer1).propose(
      4, // UnfreezeAsset
      assetNftAddr,
      ethers.ZeroHash,
      ethers.ZeroAddress,
      0 // tokenId
    );
    await unfreezeTx.wait();
    await sys.multiSig.connect(sys.signer2).confirmAndExecute(1);

    // Verify asset is now unfrozen
    expect(await sys.assetNFT.frozen(0)).to.equal(false);

    // Verify custody assignment and status transition succeed afterward
    await expect(sys.assetNFT.assignCustody(0, user1Addr, credType))
      .to.emit(sys.assetNFT, "CustodyAssigned");

    await expect(sys.assetNFT.transitionStatus(0, 3))
      .to.emit(sys.assetNFT, "AssetStatusChanged");
  });
});

// ============================================================================
// Test Suite: EthereumDIDRegistry basic operations
// ============================================================================

describe("EthereumDIDRegistry — Basic Operations", function () {
  it("any address is self-sovereign by default", async function () {
    const sys = await deployFullSystem();
    const user1Addr = await sys.user1.getAddress();
    expect(await sys.didRegistry.identityOwner(user1Addr)).to.equal(user1Addr);
  });

  it("owner can transfer identity control", async function () {
    const sys = await deployFullSystem();
    const user1Addr = await sys.user1.getAddress();
    const user2Addr = await sys.user2.getAddress();

    await sys.didRegistry.connect(sys.user1).changeOwner(user1Addr, user2Addr);
    expect(await sys.didRegistry.identityOwner(user1Addr)).to.equal(user2Addr);
  });

  it("non-owner cannot transfer identity control", async function () {
    const sys = await deployFullSystem();
    const user1Addr = await sys.user1.getAddress();
    const user2Addr = await sys.user2.getAddress();

    await expect(
      sys.didRegistry.connect(sys.user2).changeOwner(user1Addr, user2Addr)
    ).to.be.revertedWith("Not identity owner");
  });

  it("assignCustody reverts if custodian DID is transferred away (not self-sovereign)", async function () {
    const sys = await deployWithOperationalRoles();
    const componentType = ethers.encodeBytes32String("RADAR");
    const batchId = ethers.encodeBytes32String("BATCH001");
    const certHash = ethers.keccak256(ethers.toUtf8Bytes("quality-cert"));
    const credType = ethers.encodeBytes32String("CLEARANCE");

    await sys.assetNFT.mintAsset(componentType, batchId, 3, certHash);
    await sys.assetNFT.transitionStatus(0, 1);
    await sys.assetNFT.transitionStatus(0, 2);

    const user1Addr = await sys.user1.getAddress();
    const user2Addr = await sys.user2.getAddress();
    await sys.credentialRegistry.issueCredential(user1Addr, credType, 5, 0);

    // Transfer identity control of user1 away to user2
    await sys.didRegistry.connect(sys.user1).changeOwner(user1Addr, user2Addr);
    expect(await sys.didRegistry.identityOwner(user1Addr)).to.equal(user2Addr);

    // Attempting to assign custody to user1 must revert because identity is not self-sovereign
    await expect(
      sys.assetNFT.assignCustody(0, user1Addr, credType)
    ).to.be.revertedWith("Custodian DID not self-sovereign");
  });
});

// ============================================================================
// Test Suite: Credential versioning
// ============================================================================

describe("CredentialRegistry — Versioning", function () {
  it("reissuing increments version and emits event", async function () {
    const sys = await deployWithOperationalRoles();
    const credType = ethers.encodeBytes32String("CLEARANCE");
    const user1Addr = await sys.user1.getAddress();

    await sys.credentialRegistry.issueCredential(user1Addr, credType, 3, 0);
    let cred = await sys.credentialRegistry.credentials(user1Addr, credType);
    expect(cred.version).to.equal(1);

    await expect(sys.credentialRegistry.issueCredential(user1Addr, credType, 5, 0))
      .to.emit(sys.credentialRegistry, "CredentialIssued");

    cred = await sys.credentialRegistry.credentials(user1Addr, credType);
    expect(cred.version).to.equal(2);
    expect(cred.level).to.equal(5);
    expect(cred.revoked).to.equal(false);
  });
});
