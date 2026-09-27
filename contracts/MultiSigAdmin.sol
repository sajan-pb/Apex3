// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title MultiSigAdmin
 * @notice Fixed 2-of-3 multisig with a closed action enum (not arbitrary-call).
 *
 * Supported actions:
 *   - GrantRole:              Grant a role on a target contract
 *   - RevokeRole:             Revoke a role on a target contract
 *   - ChangeCredentialIssuer: Grant CREDENTIAL_ISSUER_ROLE to a new address on
 *                             CredentialRegistry (caller should separately revoke
 *                             the old issuer if needed)
 *   - EmergencyFreeze:        Freeze a single specified asset on AssetNFT —
 *                             blocks assignCustody() and status transitions on
 *                             that token only (scoped to one asset, not a global
 *                             system-wide freeze, to keep the blast radius small)
 *
 * Proposing counts as the proposer's first confirmation.
 * The second confirmation executes the action atomically in that same transaction.
 * The confirm/execute function is guarded with ReentrancyGuard (nonReentrant).
 */
contract MultiSigAdmin is ReentrancyGuard {

    // -----------------------------------------------------------------------
    //  Types
    // -----------------------------------------------------------------------

    enum ActionType {
        GrantRole,
        RevokeRole,
        ChangeCredentialIssuer,
        EmergencyFreeze,
        UnfreezeAsset
    }

    struct Proposal {
        ActionType actionType;
        address    target;          // target contract address
        bytes32    role;            // role hash (for GrantRole/RevokeRole)
        address    subject;         // address to grant/revoke role to, or asset-related
        uint256    assetId;         // token ID for EmergencyFreeze
        address    proposer;
        bool       executed;
        uint8      confirmationCount;
        mapping(address => bool) confirmations;
    }

    // -----------------------------------------------------------------------
    //  Constants
    // -----------------------------------------------------------------------

    uint8 public constant REQUIRED_CONFIRMATIONS = 2;
    uint8 public constant SIGNER_COUNT = 3;

    // -----------------------------------------------------------------------
    //  State
    // -----------------------------------------------------------------------

    address[3] public signers;
    mapping(address => bool) public isSigner;

    uint256 public proposalCount;
    mapping(uint256 => Proposal) public proposals;

    // -----------------------------------------------------------------------
    //  Events
    // -----------------------------------------------------------------------

    event ProposalCreated(
        uint256 indexed proposalId,
        ActionType actionType,
        address target,
        bytes32 role,
        address subject,
        uint256 assetId,
        address indexed proposer
    );

    event ProposalConfirmed(
        uint256 indexed proposalId,
        address indexed confirmer,
        uint8   confirmationCount
    );

    event ProposalExecuted(
        uint256 indexed proposalId,
        ActionType actionType
    );

    // -----------------------------------------------------------------------
    //  Modifiers
    // -----------------------------------------------------------------------

    modifier onlySigner() {
        require(isSigner[msg.sender], "Not a signer");
        _;
    }

    // -----------------------------------------------------------------------
    //  Constructor
    // -----------------------------------------------------------------------

    constructor(address[3] memory _signers) {
        for (uint8 i = 0; i < 3; i++) {
            require(_signers[i] != address(0), "Zero signer address");
            for (uint8 j = 0; j < i; j++) {
                require(_signers[i] != _signers[j], "Duplicate signer");
            }
            signers[i] = _signers[i];
            isSigner[_signers[i]] = true;
        }
    }

    // -----------------------------------------------------------------------
    //  Propose (auto-confirms for proposer)
    // -----------------------------------------------------------------------

    /**
     * @notice Propose a new governance action. The proposer's call counts as
     *         the first confirmation.
     */
    function propose(
        ActionType actionType,
        address    target,
        bytes32    role,
        address    subject,
        uint256    assetId
    ) external onlySigner returns (uint256) {
        require(target != address(0), "Zero target");

        uint256 proposalId = proposalCount++;

        Proposal storage p = proposals[proposalId];
        p.actionType = actionType;
        p.target     = target;
        p.role       = role;
        p.subject    = subject;
        p.assetId    = assetId;
        p.proposer   = msg.sender;
        p.executed   = false;

        // Proposer's confirmation
        p.confirmations[msg.sender] = true;
        p.confirmationCount = 1;

        emit ProposalCreated(
            proposalId,
            actionType,
            target,
            role,
            subject,
            assetId,
            msg.sender
        );

        emit ProposalConfirmed(proposalId, msg.sender, 1);

        return proposalId;
    }

    // -----------------------------------------------------------------------
    //  Confirm + execute (atomic on 2nd confirmation)
    // -----------------------------------------------------------------------

    /**
     * @notice Confirm a proposal. If this is the 2nd confirmation, the action
     *         executes atomically within this same transaction.
     *
     * @dev Guarded with nonReentrant to protect against reentrant calls into
     *      this contract's own functions.
     */
    function confirmAndExecute(uint256 proposalId) external onlySigner nonReentrant {
        Proposal storage p = proposals[proposalId];
        require(!p.executed, "Already executed");
        require(!p.confirmations[msg.sender], "Already confirmed");
        require(p.proposer != address(0), "Proposal does not exist");

        // Record confirmation (effects before interactions)
        p.confirmations[msg.sender] = true;
        p.confirmationCount++;

        emit ProposalConfirmed(proposalId, msg.sender, p.confirmationCount);

        // Execute if threshold reached
        if (p.confirmationCount >= REQUIRED_CONFIRMATIONS) {
            p.executed = true;
            _executeAction(p);
            emit ProposalExecuted(proposalId, p.actionType);
        }
    }

    // -----------------------------------------------------------------------
    //  Internal execution
    // -----------------------------------------------------------------------

    function _executeAction(Proposal storage p) internal {
        if (p.actionType == ActionType.GrantRole) {
            // Call grantRole(role, subject) on target contract
            (bool success, bytes memory returnData) = p.target.call(
                abi.encodeWithSignature("grantRole(bytes32,address)", p.role, p.subject)
            );
            require(success, string(abi.encodePacked("GrantRole failed: ", _getRevertMsg(returnData))));

        } else if (p.actionType == ActionType.RevokeRole) {
            // Call revokeRole(role, subject) on target contract
            (bool success, bytes memory returnData) = p.target.call(
                abi.encodeWithSignature("revokeRole(bytes32,address)", p.role, p.subject)
            );
            require(success, string(abi.encodePacked("RevokeRole failed: ", _getRevertMsg(returnData))));

        } else if (p.actionType == ActionType.ChangeCredentialIssuer) {
            // Grant CREDENTIAL_ISSUER_ROLE to the new issuer on CredentialRegistry
            bytes32 issuerRole = keccak256("CREDENTIAL_ISSUER_ROLE");
            (bool success, bytes memory returnData) = p.target.call(
                abi.encodeWithSignature("grantRole(bytes32,address)", issuerRole, p.subject)
            );
            require(success, string(abi.encodePacked("ChangeCredentialIssuer failed: ", _getRevertMsg(returnData))));

        } else if (p.actionType == ActionType.EmergencyFreeze) {
            // Freeze a single asset on AssetNFT
            (bool success, bytes memory returnData) = p.target.call(
                abi.encodeWithSignature("freezeAsset(uint256)", p.assetId)
            );
            require(success, string(abi.encodePacked("EmergencyFreeze failed: ", _getRevertMsg(returnData))));

        } else if (p.actionType == ActionType.UnfreezeAsset) {
            // Unfreeze a single asset on AssetNFT
            (bool success, bytes memory returnData) = p.target.call(
                abi.encodeWithSignature("unfreezeAsset(uint256)", p.assetId)
            );
            require(success, string(abi.encodePacked("UnfreezeAsset failed: ", _getRevertMsg(returnData))));
        }
    }

    /**
     * @dev Extract revert reason from failed low-level call.
     */
    function _getRevertMsg(bytes memory returnData) internal pure returns (string memory) {
        if (returnData.length < 68) return "No revert reason";
        assembly {
            returnData := add(returnData, 0x04)
        }
        return abi.decode(returnData, (string));
    }

    // -----------------------------------------------------------------------
    //  View helpers
    // -----------------------------------------------------------------------

    function hasConfirmed(uint256 proposalId, address signer) external view returns (bool) {
        return proposals[proposalId].confirmations[signer];
    }

    function getProposal(uint256 proposalId)
        external
        view
        returns (
            ActionType actionType,
            address    target,
            bytes32    role,
            address    subject,
            uint256    assetId,
            address    proposer,
            bool       executed,
            uint8      confirmationCount
        )
    {
        Proposal storage p = proposals[proposalId];
        return (
            p.actionType,
            p.target,
            p.role,
            p.subject,
            p.assetId,
            p.proposer,
            p.executed,
            p.confirmationCount
        );
    }
}
