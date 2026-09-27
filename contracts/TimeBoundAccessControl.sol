// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title TimeBoundAccessControl
 * @notice RBAC with time-bound role expiry, built on OpenZeppelin AccessControl.
 *
 * Roles: ADMIN_ROLE, MANAGER_ROLE, AUDITOR_ROLE, USER_ROLE
 * All four organizational roles have RBAC_ADMIN_ROLE as their admin role.
 * RBAC_ADMIN_ROLE is held by the MultiSigAdmin contract address, never by
 * individual signer EOAs directly.
 *
 * Time-bound extension: each role grant has an associated expiry timestamp.
 * A role is considered active only if hasRole(account, role) AND
 * roleExpiry[account][role] == 0 (no expiry) OR block.timestamp <= roleExpiry.
 */
contract TimeBoundAccessControl is AccessControl {

    // -----------------------------------------------------------------------
    //  Role definitions
    // -----------------------------------------------------------------------

    bytes32 public constant ADMIN_ROLE   = keccak256("ADMIN_ROLE");
    bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");
    bytes32 public constant AUDITOR_ROLE = keccak256("AUDITOR_ROLE");
    bytes32 public constant USER_ROLE    = keccak256("USER_ROLE");

    /// @notice Admin role for all four organizational roles — held by MultiSigAdmin.
    bytes32 public constant RBAC_ADMIN_ROLE = keccak256("RBAC_ADMIN_ROLE");

    // -----------------------------------------------------------------------
    //  Time-bound storage
    // -----------------------------------------------------------------------

    /// @notice account => role => expiry timestamp (0 = no expiry / permanent)
    mapping(address => mapping(bytes32 => uint64)) public roleExpiry;

    // -----------------------------------------------------------------------
    //  Events
    // -----------------------------------------------------------------------

    event RoleGrantedWithExpiry(
        bytes32 indexed role,
        address indexed account,
        uint64  expiresAt
    );

    // -----------------------------------------------------------------------
    //  Constructor
    // -----------------------------------------------------------------------

    constructor() {
        // Deployer gets DEFAULT_ADMIN_ROLE transiently (will be renounced)
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);

        // Set RBAC_ADMIN_ROLE as admin for all four organizational roles
        _setRoleAdmin(ADMIN_ROLE,   RBAC_ADMIN_ROLE);
        _setRoleAdmin(MANAGER_ROLE, RBAC_ADMIN_ROLE);
        _setRoleAdmin(AUDITOR_ROLE, RBAC_ADMIN_ROLE);
        _setRoleAdmin(USER_ROLE,    RBAC_ADMIN_ROLE);
    }

    // -----------------------------------------------------------------------
    //  Time-bound role management
    // -----------------------------------------------------------------------

    /**
     * @notice Grant a role with an expiry timestamp.
     * @param role      The role to grant
     * @param account   The address receiving the role
     * @param expiresAt Expiry timestamp (0 = no expiry)
     */
    function grantRoleWithExpiry(
        bytes32 role,
        address account,
        uint64  expiresAt
    ) external onlyRole(getRoleAdmin(role)) {
        _grantRole(role, account);
        roleExpiry[account][role] = expiresAt;
        emit RoleGrantedWithExpiry(role, account, expiresAt);
    }

    /**
     * @notice Check if an account has an active (non-expired) role.
     * @param role    The role to check
     * @param account The address to check
     * @return True if the account has the role and it hasn't expired
     */
    function hasActiveRole(bytes32 role, address account) public view returns (bool) {
        if (!hasRole(role, account)) return false;
        uint64 expiry = roleExpiry[account][role];
        if (expiry == 0) return true; // no expiry set
        return block.timestamp <= expiry;
    }

    /**
     * @notice Override revokeRole to also clear the expiry.
     */
    function revokeRole(bytes32 role, address account)
        public
        override
        onlyRole(getRoleAdmin(role))
    {
        super.revokeRole(role, account);
        roleExpiry[account][role] = 0;
    }
}
