// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title IERC5192 — Minimal Soulbound Token interface (Final EIP)
 */
interface IERC5192 {
    /// @notice Emitted when a token is locked (SHOULD emit on locked mint).
    event Locked(uint256 tokenId);
    /// @notice Emitted when a token is unlocked.
    event Unlocked(uint256 tokenId);
    /// @notice Returns true if the token is locked. MUST revert for invalid/nonexistent tokens.
    function locked(uint256 tokenId) external view returns (bool);
}

/**
 * @title AssetNFT
 * @notice ERC-721 soulbound asset token with ERC-5192 lock interface.
 *
 * Ownership vs. custody — these are NOT conflated:
 *   - Every token mints to a fixed BEL treasury address. Ownership is permanently
 *     non-transferable (the OZ v5.x `_update()` hook blocks all transfers after mint).
 *   - Custody is a separate mutable field changed only via `assignCustody()`, which
 *     enforces: asset not Suspended/Decommissioned, caller has valid DID, caller
 *     holds a valid credential with level >= classificationLevel.
 *
 * Classification level is immutable after mint — no function may change it.
 */
contract AssetNFT is ERC721, AccessControl, IERC5192 {

    // -----------------------------------------------------------------------
    //  Roles
    // -----------------------------------------------------------------------

    /// @notice Role that can mint new assets.
    bytes32 public constant ASSET_MINTER_ROLE = keccak256("ASSET_MINTER_ROLE");

    /// @notice Role that can transition asset status.
    bytes32 public constant STATUS_MANAGER_ROLE = keccak256("STATUS_MANAGER_ROLE");

    /// @notice Admin role for STATUS_MANAGER_ROLE — held by MultiSigAdmin.
    bytes32 public constant STATUS_ADMIN_ROLE = keccak256("STATUS_ADMIN_ROLE");

    // -----------------------------------------------------------------------
    //  Enums
    // -----------------------------------------------------------------------

    enum AssetStatus {
        Manufactured,       // 0
        QualityCertified,   // 1
        InService,          // 2
        InMaintenance,      // 3
        Suspended,          // 4
        Decommissioned      // 5
    }

    // -----------------------------------------------------------------------
    //  Data structures
    // -----------------------------------------------------------------------

    struct AssetData {
        bytes32     componentType;
        bytes32     batchId;
        uint8       classificationLevel;    // immutable after mint
        AssetStatus status;
        address     custodian;
        bytes32     qualityCertHash;        // SHA-256 commitment to off-chain cert
    }

    // -----------------------------------------------------------------------
    //  State
    // -----------------------------------------------------------------------

    /// @notice The fixed BEL treasury address — permanent owner of all tokens.
    address public immutable treasury;

    /// @notice Reference to the CredentialRegistry for authorization checks.
    address public immutable credentialRegistry;

    /// @notice Reference to the EthereumDIDRegistry for identity checks.
    address public immutable didRegistry;

    /// @notice Reference to the TimeBoundAccessControl for time-bound role checks.
    address public immutable accessControl;

    /// @notice Manager role required in TimeBoundAccessControl.
    bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");

    /// @notice Token ID counter.
    uint256 private _nextTokenId;

    /// @notice tokenId => AssetData
    mapping(uint256 => AssetData) public assets;

    /// @notice tokenId => frozen flag (set by EmergencyFreeze governance action)
    mapping(uint256 => bool) public frozen;

    // -----------------------------------------------------------------------
    //  Events
    // -----------------------------------------------------------------------

    event AssetMinted(
        uint256 indexed tokenId,
        bytes32 componentType,
        bytes32 batchId,
        uint8   classificationLevel,
        address indexed treasury
    );

    event CustodyAssigned(
        uint256 indexed tokenId,
        address indexed previousCustodian,
        address indexed newCustodian
    );

    event AssetStatusChanged(
        uint256 indexed tokenId,
        AssetStatus previousStatus,
        AssetStatus newStatus
    );

    event AssetFrozen(uint256 indexed tokenId);
    event AssetUnfrozen(uint256 indexed tokenId);

    // -----------------------------------------------------------------------
    //  Constructor
    // -----------------------------------------------------------------------

    /**
     * @param _treasury           Fixed BEL treasury address (permanent token owner)
     * @param _credentialRegistry Address of the CredentialRegistry contract
     * @param _didRegistry        Address of the EthereumDIDRegistry contract
     * @param _accessControl      Address of the TimeBoundAccessControl contract (optional, can be address(0))
     */
    constructor(
        address _treasury,
        address _credentialRegistry,
        address _didRegistry,
        address _accessControl
    ) ERC721("BEL Trust Chain Asset", "BELA") {
        require(_treasury != address(0), "Zero treasury");
        require(_credentialRegistry != address(0), "Zero credential registry");
        require(_didRegistry != address(0), "Zero DID registry");

        treasury = _treasury;
        credentialRegistry = _credentialRegistry;
        didRegistry = _didRegistry;
        accessControl = _accessControl;

        // Deployer gets DEFAULT_ADMIN_ROLE transiently
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);

        // Set STATUS_ADMIN_ROLE as admin for STATUS_MANAGER_ROLE and ASSET_MINTER_ROLE
        _setRoleAdmin(STATUS_MANAGER_ROLE, STATUS_ADMIN_ROLE);
        _setRoleAdmin(ASSET_MINTER_ROLE, STATUS_ADMIN_ROLE);
    }

    // -----------------------------------------------------------------------
    //  ERC-5192 implementation
    // -----------------------------------------------------------------------

    /**
     * @notice All tokens are permanently locked (soulbound). Reverts for
     *         invalid/nonexistent tokens per ERC-5192 spec.
     */
    function locked(uint256 tokenId) external view override returns (bool) {
        // _requireOwned reverts for nonexistent tokens (OZ v5.x)
        _requireOwned(tokenId);
        return true; // always locked
    }

    /**
     * @notice ERC-165: advertise ERC-721, AccessControl, and ERC-5192 support.
     */
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, AccessControl)
        returns (bool)
    {
        // ERC-5192 interface ID = 0xb45a3c0e
        return interfaceId == 0xb45a3c0e || super.supportsInterface(interfaceId);
    }

    // -----------------------------------------------------------------------
    //  Soulbound enforcement — override _update() to block all transfers
    // -----------------------------------------------------------------------

    /**
     * @dev Override OZ v5.x _update() hook. Only the initial mint (from == address(0))
     *      is allowed; all other transfer paths revert.
     */
    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address)
    {
        address from = _ownerOf(tokenId);
        // Allow mint (from zero address); block everything else
        if (from != address(0)) {
            revert("Soulbound: transfer blocked");
        }
        return super._update(to, tokenId, auth);
    }

    // -----------------------------------------------------------------------
    //  Minting
    // -----------------------------------------------------------------------

    /**
     * @notice Mint a new soulbound asset token to the BEL treasury.
     * @param componentType       Type identifier for the component
     * @param batchId             Batch identifier
     * @param classificationLevel Security classification (immutable after mint)
     * @param qualityCertHash     SHA-256 hash of off-chain quality certificate
     */
    function mintAsset(
        bytes32 componentType,
        bytes32 batchId,
        uint8   classificationLevel,
        bytes32 qualityCertHash
    ) external onlyRole(ASSET_MINTER_ROLE) returns (uint256) {
        uint256 tokenId = _nextTokenId++;

        // Mint to treasury — this goes through _update() which allows from==address(0)
        _safeMint(treasury, tokenId);

        assets[tokenId] = AssetData({
            componentType:       componentType,
            batchId:             batchId,
            classificationLevel: classificationLevel,
            status:              AssetStatus.Manufactured,
            custodian:           treasury,
            qualityCertHash:     qualityCertHash
        });

        // ERC-5192: SHOULD emit Locked on locked mint
        emit Locked(tokenId);

        emit AssetMinted(
            tokenId,
            componentType,
            batchId,
            classificationLevel,
            treasury
        );

        return tokenId;
    }

    // -----------------------------------------------------------------------
    //  Custody management
    // -----------------------------------------------------------------------

    /**
     * @notice Assign custody of an asset to a new custodian.
     *         Checks in order:
     *         1. Asset not frozen
     *         2. Asset not Suspended or Decommissioned
     *         3. New custodian has a valid DID (identity owner == self, i.e. active)
     *         4. New custodian holds a valid credential with level >= classificationLevel
     */
    function assignCustody(
        uint256 tokenId,
        address newCustodian,
        bytes32 credentialType
    ) external onlyRole(STATUS_MANAGER_ROLE) {
        require(!frozen[tokenId], "Asset is frozen");
        _requireOwned(tokenId);

        // 1. TimeBoundAccessControl check: operator must hold active MANAGER_ROLE
        if (accessControl != address(0)) {
            require(
                ITimeBoundAccessControl(accessControl).hasActiveRole(MANAGER_ROLE, msg.sender),
                "Operator lacking active RBAC role"
            );
        }

        AssetData storage asset = assets[tokenId];
        require(
            asset.status != AssetStatus.Suspended &&
            asset.status != AssetStatus.Decommissioned,
            "Asset not available for custody"
        );

        // 2. DID Registry check: new custodian's DID must be self-sovereign (owner == self)
        require(
            IEthereumDIDRegistry(didRegistry).identityOwner(newCustodian) == newCustodian,
            "Custodian DID not self-sovereign"
        );

        // 3. Credential validity and clearance level check
        ICredentialCheck credReg = ICredentialCheck(credentialRegistry);
        require(
            credReg.isCredentialValid(newCustodian, credentialType),
            "Invalid credential"
        );
        uint8 heldLevel = credReg.getValidLevel(newCustodian, credentialType);
        require(
            heldLevel >= asset.classificationLevel,
            "Insufficient clearance level"
        );

        address previousCustodian = asset.custodian;
        asset.custodian = newCustodian;

        emit CustodyAssigned(tokenId, previousCustodian, newCustodian);
    }

    // -----------------------------------------------------------------------
    //  Lifecycle transitions
    // -----------------------------------------------------------------------

    /**
     * @notice Transition an asset's status. Only the exact transitions listed
     *         in the spec are allowed; all others revert.
     *
     * Allowed transitions:
     *   Manufactured     -> QualityCertified
     *   QualityCertified -> InService
     *   InService        -> InMaintenance
     *   InMaintenance    -> InService
     *   InService        -> Suspended
     *   InMaintenance    -> Suspended
     *   Suspended        -> InService
     *   Suspended        -> Decommissioned
     *   Decommissioned   -> (nothing — terminal)
     */
    function transitionStatus(uint256 tokenId, AssetStatus newStatus)
        external
        onlyRole(STATUS_MANAGER_ROLE)
    {
        require(!frozen[tokenId], "Asset is frozen");
        _requireOwned(tokenId);

        // TimeBoundAccessControl check: operator must hold active MANAGER_ROLE
        if (accessControl != address(0)) {
            require(
                ITimeBoundAccessControl(accessControl).hasActiveRole(MANAGER_ROLE, msg.sender),
                "Operator lacking active RBAC role"
            );
        }

        AssetData storage asset = assets[tokenId];
        AssetStatus current = asset.status;

        require(_isValidTransition(current, newStatus), "Invalid status transition");

        // Checks-effects-interactions: update state before any external calls
        asset.status = newStatus;

        emit AssetStatusChanged(tokenId, current, newStatus);
    }

    /**
     * @notice Enforce the exact transition table from the spec.
     */
    function _isValidTransition(AssetStatus from, AssetStatus to)
        internal
        pure
        returns (bool)
    {
        if (from == AssetStatus.Manufactured && to == AssetStatus.QualityCertified) return true;
        if (from == AssetStatus.QualityCertified && to == AssetStatus.InService) return true;
        if (from == AssetStatus.InService && to == AssetStatus.InMaintenance) return true;
        if (from == AssetStatus.InMaintenance && to == AssetStatus.InService) return true;
        if (from == AssetStatus.InService && to == AssetStatus.Suspended) return true;
        if (from == AssetStatus.InMaintenance && to == AssetStatus.Suspended) return true;
        if (from == AssetStatus.Suspended && to == AssetStatus.InService) return true;
        if (from == AssetStatus.Suspended && to == AssetStatus.Decommissioned) return true;
        return false;
    }

    // -----------------------------------------------------------------------
    //  Emergency freeze (called by MultiSigAdmin governance)
    // -----------------------------------------------------------------------

    /**
     * @notice Freeze a single asset — blocks assignCustody() and status
     *         transitions on that token only. Scoped to one asset to keep
     *         the blast radius small.
     */
    function freezeAsset(uint256 tokenId) external onlyRole(STATUS_ADMIN_ROLE) {
        _requireOwned(tokenId);
        require(!frozen[tokenId], "Already frozen");
        frozen[tokenId] = true;
        emit AssetFrozen(tokenId);
    }

    /**
     * @notice Unfreeze a previously frozen asset.
     */
    function unfreezeAsset(uint256 tokenId) external onlyRole(STATUS_ADMIN_ROLE) {
        _requireOwned(tokenId);
        require(frozen[tokenId], "Not frozen");
        frozen[tokenId] = false;
        emit AssetUnfrozen(tokenId);
    }
}

// -----------------------------------------------------------------------
//  External interfaces for cross-contract checks
// -----------------------------------------------------------------------

interface ICredentialCheck {
    function isCredentialValid(address subject, bytes32 credType) external view returns (bool);
    function getValidLevel(address subject, bytes32 credType) external view returns (uint8);
}

interface IEthereumDIDRegistry {
    function identityOwner(address identity) external view returns (address);
}

interface ITimeBoundAccessControl {
    function hasActiveRole(bytes32 role, address account) external view returns (bool);
}
