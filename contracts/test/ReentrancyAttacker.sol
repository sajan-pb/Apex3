// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title MaliciousTarget
 * @notice A contract that pretends to be an AccessControl target.
 *         When grantRole is called on it (during MultiSigAdmin execution),
 *         it re-enters MultiSigAdmin.confirmAndExecute() to try to execute
 *         another proposal.
 */
interface IMultiSigAdmin {
    function confirmAndExecute(uint256 proposalId) external;
}

contract MaliciousTarget is AccessControl {
    IMultiSigAdmin public multiSigAdmin;
    uint256 public reentryProposalId;
    bool public shouldAttack;
    bool public attackAttempted;
    bool public reentrySucceeded;

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function setAttackParams(
        address _multiSig,
        uint256 _reentryProposalId
    ) external {
        multiSigAdmin = IMultiSigAdmin(_multiSig);
        reentryProposalId = _reentryProposalId;
        shouldAttack = true;
        attackAttempted = false;
        reentrySucceeded = false;
    }

    /**
     * @dev Override grantRole to inject re-entry attack.
     *      When MultiSigAdmin calls grantRole on this contract during execution,
     *      we re-enter MultiSigAdmin.confirmAndExecute with a different proposal.
     */
    function grantRole(bytes32 role, address account) public override {
        super.grantRole(role, account);

        if (shouldAttack && !attackAttempted) {
            attackAttempted = true;
            try multiSigAdmin.confirmAndExecute(reentryProposalId) {
                reentrySucceeded = true;
            } catch {
                reentrySucceeded = false;
            }
        }
    }
}
