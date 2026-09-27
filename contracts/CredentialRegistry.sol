// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title CredentialRegistry
 * @notice On-chain enforcement subset of W3C Verifiable Credentials.
 *
 * Stores only enforcement-relevant data keyed by (subject, credentialType).
 * One current record per pair — reissuing overwrites and increments version.
 * The full signed VC lives off-chain; this contract does not verify VC signatures,
 * relying instead on governance-gated issuer roles.
 *
 * Revocation and expiry are independent: a credential is valid iff
 *   exists && !revoked && (expiresAt == 0 || block.timestamp <= expiresAt)
 */
contract CredentialRegistry is AccessControl {

    // -----------------------------------------------------------------------
    //  Roles
    // -----------------------------------------------------------------------

    /// @notice Role that can issue and revoke credentials.
    bytes32 public constant CREDENTIAL_ISSUER_ROLE =
        keccak256("CREDENTIAL_ISSUER_ROLE");

    /// @notice Admin role for CREDENTIAL_ISSUER_ROLE — held by MultiSigAdmin.
    bytes32 public constant CREDENTIAL_ISSUER_ADMIN_ROLE =
        keccak256("CREDENTIAL_ISSUER_ADMIN_ROLE");

    // -----------------------------------------------------------------------
    //  Data structures
    // -----------------------------------------------------------------------

    struct Credential {
        bool    exists;
        bool    revoked;
        uint8   level;       // clearance level, 0 for non-leveled types
        uint64  issuedAt;
        uint64  expiresAt;   // 0 = no expiry
        uint32  version;     // incremented on reissue
        address issuer;
    }

    /// @notice subject => credentialType => Credential
    mapping(address => mapping(bytes32 => Credential)) public credentials;

    // -----------------------------------------------------------------------
    //  Events
    // -----------------------------------------------------------------------

    event CredentialIssued(
        address indexed subject,
        bytes32 indexed credentialType,
        uint8   level,
        uint64  issuedAt,
        uint64  expiresAt,
        uint32  version,
        address indexed issuer
    );

    event CredentialRevoked(
        address indexed subject,
        bytes32 indexed credentialType,
        uint32  version,
        address indexed revoker
    );

    // -----------------------------------------------------------------------
    //  Constructor
    // -----------------------------------------------------------------------

    constructor() {
        // Deployer gets DEFAULT_ADMIN_ROLE transiently; will be renounced
        // after MultiSigAdmin is wired up.
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);

        // Set CREDENTIAL_ISSUER_ADMIN_ROLE as admin for CREDENTIAL_ISSUER_ROLE
        _setRoleAdmin(CREDENTIAL_ISSUER_ROLE, CREDENTIAL_ISSUER_ADMIN_ROLE);
    }

    // -----------------------------------------------------------------------
    //  Issue / reissue
    // -----------------------------------------------------------------------

    /**
     * @notice Issue or reissue a credential for a subject.
     *         Reissuing overwrites the current record, increments version,
     *         and emits CredentialIssued — never a silent mutation.
     * @param subject      The address receiving the credential
     * @param credType     The credential type identifier
     * @param level        Clearance level (0 for non-leveled types)
     * @param expiresAt    Expiration timestamp (0 = no expiry)
     */
    function issueCredential(
        address subject,
        bytes32 credType,
        uint8   level,
        uint64  expiresAt
    ) external onlyRole(CREDENTIAL_ISSUER_ROLE) {
        require(subject != address(0), "Zero address subject");

        Credential storage cred = credentials[subject][credType];
        uint32 newVersion = cred.exists ? cred.version + 1 : 1;

        cred.exists    = true;
        cred.revoked   = false;
        cred.level     = level;
        cred.issuedAt  = uint64(block.timestamp);
        cred.expiresAt = expiresAt;
        cred.version   = newVersion;
        cred.issuer    = msg.sender;

        emit CredentialIssued(
            subject,
            credType,
            level,
            uint64(block.timestamp),
            expiresAt,
            newVersion,
            msg.sender
        );
    }

    // -----------------------------------------------------------------------
    //  Revocation (unilateral by any CREDENTIAL_ISSUER_ROLE holder — fast triage)
    // -----------------------------------------------------------------------

    /**
     * @notice Revoke a credential. This is a unilateral action available to
     *         any CREDENTIAL_ISSUER_ROLE holder for fast triage. The role
     *         itself can only be granted/revoked via 2-of-3 governance.
     */
    function revokeCredential(
        address subject,
        bytes32 credType
    ) external onlyRole(CREDENTIAL_ISSUER_ROLE) {
        Credential storage cred = credentials[subject][credType];
        require(cred.exists, "Credential does not exist");
        require(!cred.revoked, "Already revoked");

        cred.revoked = true;

        emit CredentialRevoked(subject, credType, cred.version, msg.sender);
    }

    // -----------------------------------------------------------------------
    //  Validation (view)
    // -----------------------------------------------------------------------

    /**
     * @notice Check if a credential is currently valid.
     *         isValid = exists && !revoked && (expiresAt == 0 || now <= expiresAt)
     */
    function isCredentialValid(
        address subject,
        bytes32 credType
    ) public view returns (bool) {
        Credential storage cred = credentials[subject][credType];
        if (!cred.exists) return false;
        if (cred.revoked) return false;
        if (cred.expiresAt != 0 && block.timestamp > cred.expiresAt) return false;
        return true;
    }

    /**
     * @notice Get the clearance level of a currently-valid credential.
     *         Reverts if the credential is not valid.
     */
    function getValidLevel(
        address subject,
        bytes32 credType
    ) external view returns (uint8) {
        require(isCredentialValid(subject, credType), "Invalid credential");
        return credentials[subject][credType].level;
    }
}
