// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/**
 * @title EthereumDIDRegistry
 * @notice ERC-1056–style identity registry for did:ethr identifiers.
 *
 * Design note: ERC-1056's EIP status is Stagnant (a draft that never progressed
 * to Final). We use the *design pattern* — not a finalized standard — because it
 * is the established approach behind `did:ethr`.
 *
 * Any Ethereum address is a valid `did:ethr:sepolia:<address>` identity the
 * instant it exists — no registration transaction is needed. This registry is
 * touched only when identity state changes: transferring control to a new key,
 * adding/revoking a time-bound delegate, or setting/revoking an attribute.
 */
contract EthereumDIDRegistry {

    // -----------------------------------------------------------------------
    //  Storage
    // -----------------------------------------------------------------------

    /// @notice Maps an identity address to its current owner (controller).
    ///         Default: identity == owner (self-sovereign).
    mapping(address => address) public owners;

    /// @notice Nonce per identity, used for meta-transaction replay protection.
    mapping(address => uint256) public nonces;

    /// @notice Delegate validity: identity -> delegateType -> delegate -> validTo
    mapping(address => mapping(bytes32 => mapping(address => uint256))) public delegates;

    /// @notice Tracks the latest block at which an identity's state changed,
    ///         enabling efficient off-chain log traversal.
    mapping(address => uint256) public changed;

    // -----------------------------------------------------------------------
    //  Events (ERC-1056 compatible)
    // -----------------------------------------------------------------------

    event DIDOwnerChanged(
        address indexed identity,
        address owner,
        uint256 previousChange
    );

    event DIDDelegateChanged(
        address indexed identity,
        bytes32 delegateType,
        address delegate,
        uint256 validTo,
        uint256 previousChange
    );

    event DIDAttributeChanged(
        address indexed identity,
        bytes32 name,
        bytes value,
        uint256 validTo,
        uint256 previousChange
    );

    // -----------------------------------------------------------------------
    //  Modifiers
    // -----------------------------------------------------------------------

    /// @dev Resolves the current owner/controller of an identity.
    function identityOwner(address identity) public view returns (address) {
        address owner = owners[identity];
        if (owner != address(0)) return owner;
        return identity; // self-sovereign default
    }

    modifier onlyOwner(address identity, address actor) {
        require(actor == identityOwner(identity), "Not identity owner");
        _;
    }

    // -----------------------------------------------------------------------
    //  Owner management
    // -----------------------------------------------------------------------

    function changeOwner(address identity, address newOwner) public
        onlyOwner(identity, msg.sender)
    {
        _changeOwner(identity, newOwner);
    }

    function changeOwnerSigned(
        address identity,
        uint8 sigV,
        bytes32 sigR,
        bytes32 sigS,
        address newOwner
    ) public {
        bytes32 hash = keccak256(
            abi.encodePacked(
                bytes1(0x19), bytes1(0x00),
                address(this),
                nonces[identityOwner(identity)],
                identity,
                "changeOwner",
                newOwner
            )
        );
        address signer = ecrecover(hash, sigV, sigR, sigS);
        require(signer == identityOwner(identity), "Bad signature");
        nonces[signer]++;
        _changeOwner(identity, newOwner);
    }

    function _changeOwner(address identity, address newOwner) internal {
        owners[identity] = newOwner;
        emit DIDOwnerChanged(identity, newOwner, changed[identity]);
        changed[identity] = block.number;
    }

    // -----------------------------------------------------------------------
    //  Delegate management
    // -----------------------------------------------------------------------

    function validDelegate(
        address identity,
        bytes32 delegateType,
        address delegate
    ) public view returns (bool) {
        return delegates[identity][delegateType][delegate] > block.timestamp;
    }

    function addDelegate(
        address identity,
        bytes32 delegateType,
        address delegate,
        uint256 validity
    ) public onlyOwner(identity, msg.sender) {
        _addDelegate(identity, delegateType, delegate, validity);
    }

    function _addDelegate(
        address identity,
        bytes32 delegateType,
        address delegate,
        uint256 validity
    ) internal {
        delegates[identity][delegateType][delegate] = block.timestamp + validity;
        emit DIDDelegateChanged(
            identity,
            delegateType,
            delegate,
            block.timestamp + validity,
            changed[identity]
        );
        changed[identity] = block.number;
    }

    function revokeDelegate(
        address identity,
        bytes32 delegateType,
        address delegate
    ) public onlyOwner(identity, msg.sender) {
        _revokeDelegate(identity, delegateType, delegate);
    }

    function _revokeDelegate(
        address identity,
        bytes32 delegateType,
        address delegate
    ) internal {
        delegates[identity][delegateType][delegate] = 0;
        emit DIDDelegateChanged(
            identity,
            delegateType,
            delegate,
            0,
            changed[identity]
        );
        changed[identity] = block.number;
    }

    // -----------------------------------------------------------------------
    //  Attribute management
    // -----------------------------------------------------------------------

    function setAttribute(
        address identity,
        bytes32 name,
        bytes calldata value,
        uint256 validity
    ) public onlyOwner(identity, msg.sender) {
        _setAttribute(identity, name, value, validity);
    }

    function _setAttribute(
        address identity,
        bytes32 name,
        bytes memory value,
        uint256 validity
    ) internal {
        emit DIDAttributeChanged(
            identity,
            name,
            value,
            block.timestamp + validity,
            changed[identity]
        );
        changed[identity] = block.number;
    }

    function revokeAttribute(
        address identity,
        bytes32 name,
        bytes calldata value
    ) public onlyOwner(identity, msg.sender) {
        emit DIDAttributeChanged(
            identity,
            name,
            value,
            0,
            changed[identity]
        );
        changed[identity] = block.number;
    }
}
