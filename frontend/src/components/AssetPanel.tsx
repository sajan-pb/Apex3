import React, { useState } from 'react';
import { Contract, ethers } from 'ethers';
import { ASSET_NFT_ABI } from '../abis';
import {
  ADDRESSES,
  ASSET_STATUSES,
  ASSET_STATUS_COLORS,
  VALID_TRANSITIONS,
} from '../config';

interface AssetPanelProps {
  account: string;
  getSigner: () => Promise<ethers.Signer>;
  getProvider: () => ethers.BrowserProvider;
  setResult: (res: { type: 'success' | 'error' | 'info'; message: string; txHash?: string } | null) => void;
}

interface AssetDetails {
  tokenId: number;
  componentType: string;
  batchId: string;
  classificationLevel: number;
  status: number;
  statusName: string;
  custodian: string;
  qualityCertHash: string;
  isLocked: boolean;
  isFrozen: boolean;
  treasury: string;
}

export const AssetPanel: React.FC<AssetPanelProps> = ({
  account,
  getSigner,
  getProvider,
  setResult,
}) => {
  // Query State
  const [queryTokenId, setQueryTokenId] = useState('0');
  const [assetDetails, setAssetDetails] = useState<AssetDetails | null>(null);
  const [queryLoading, setQueryLoading] = useState(false);

  // Mint State
  const [mintComponent, setMintComponent] = useState('BEL-RADAR-X1');
  const [mintBatch, setMintBatch] = useState('BATCH-2026-01');
  const [mintClassification, setMintClassification] = useState('3');
  const [mintCertHash, setMintCertHash] = useState('');

  // Custody Assignment State
  const [custodyTokenId, setCustodyTokenId] = useState('0');
  const [custodyRecipient, setCustodyRecipient] = useState('');
  const [custodyCredType, setCustodyCredType] = useState('CLEARANCE');

  // Status Transition State
  const [statusTokenId, setStatusTokenId] = useState('0');
  const [targetStatus, setTargetStatus] = useState('1'); // QualityCertified

  const queryAsset = async (idToQuery?: string) => {
    const id = idToQuery !== undefined ? idToQuery : queryTokenId;
    if (isNaN(parseInt(id, 10)) || parseInt(id, 10) < 0) {
      setResult({ type: 'error', message: 'Please enter a valid non-negative token ID.' });
      return;
    }
    try {
      setQueryLoading(true);
      const provider = getProvider();
      const contract = new Contract(ADDRESSES.AssetNFT, ASSET_NFT_ABI, provider);
      const tokenIdNum = parseInt(id, 10);

      const [asset, isLocked, isFrozen, treasury] = await Promise.all([
        contract.assets(tokenIdNum),
        contract.locked(tokenIdNum).catch(() => false),
        contract.frozen(tokenIdNum).catch(() => false),
        contract.treasury().catch(() => 'Unknown'),
      ]);

      let compStr = 'Unknown';
      let batchStr = 'Unknown';
      try {
        compStr = ethers.decodeBytes32String(asset[0]);
      } catch {
        compStr = asset[0];
      }
      try {
        batchStr = ethers.decodeBytes32String(asset[1]);
      } catch {
        batchStr = asset[1];
      }

      const statusNum = Number(asset[3]);
      const statusName = ASSET_STATUSES[statusNum] || `Unknown (${statusNum})`;

      const details: AssetDetails = {
        tokenId: tokenIdNum,
        componentType: compStr,
        batchId: batchStr,
        classificationLevel: Number(asset[2]),
        status: statusNum,
        statusName,
        custodian: asset[4],
        qualityCertHash: asset[5],
        isLocked,
        isFrozen,
        treasury,
      };

      setAssetDetails(details);
      setResult({
        type: 'info',
        message: `Asset #${tokenIdNum} Loaded — Status: ${statusName}, Custodian: ${asset[4].slice(0, 10)}…`,
      });
    } catch (err: any) {
      setResult({ type: 'error', message: `Query failed: ${err.reason || err.message}` });
      setAssetDetails(null);
    } finally {
      setQueryLoading(false);
    }
  };

  const handleMintAsset = async () => {
    try {
      setResult({ type: 'info', message: 'Submitting asset minting transaction...' });
      const signer = await getSigner();
      const contract = new Contract(ADDRESSES.AssetNFT, ASSET_NFT_ABI, signer);

      const compBytes = ethers.encodeBytes32String(mintComponent.slice(0, 31));
      const batchBytes = ethers.encodeBytes32String(mintBatch.slice(0, 31));

      let certBytes = mintCertHash;
      if (!certBytes || !ethers.isHexString(certBytes, 32)) {
        certBytes = ethers.keccak256(ethers.toUtf8Bytes(mintCertHash || `CERT-${mintBatch}-${Date.now()}`));
      }

      const tx = await contract.mintAsset(
        compBytes,
        batchBytes,
        parseInt(mintClassification, 10),
        certBytes
      );
      const receipt = await tx.wait();

      setResult({
        type: 'success',
        message: `✔ Soulbound Asset Minted!\nComponent: ${mintComponent}\nBatch: ${mintBatch}\nLevel: ${mintClassification}\nTx: ${receipt.hash}`,
        txHash: receipt.hash,
      });

      queryAsset('0');
    } catch (err: any) {
      setResult({ type: 'error', message: `✘ Minting reverted: ${err.reason || err.message}` });
    }
  };

  const handleAssignCustody = async () => {
    if (!ethers.isAddress(custodyRecipient)) {
      setResult({ type: 'error', message: 'Invalid recipient address for custody assignment.' });
      return;
    }
    try {
      setResult({ type: 'info', message: 'Assigning asset custody...' });
      const signer = await getSigner();
      const contract = new Contract(ADDRESSES.AssetNFT, ASSET_NFT_ABI, signer);
      const credTypeBytes = ethers.encodeBytes32String(custodyCredType);

      const tx = await contract.assignCustody(
        parseInt(custodyTokenId, 10),
        custodyRecipient,
        credTypeBytes
      );
      const receipt = await tx.wait();

      setResult({
        type: 'success',
        message: `✔ Custody transferred!\nAsset #${custodyTokenId} assigned to ${custodyRecipient}\nTx: ${receipt.hash}`,
        txHash: receipt.hash,
      });

      if (queryTokenId === custodyTokenId) {
        queryAsset(custodyTokenId);
      }
    } catch (err: any) {
      setResult({ type: 'error', message: `✘ Custody assignment rejected: ${err.reason || err.message}` });
    }
  };

  const handleTransitionStatus = async () => {
    try {
      setResult({ type: 'info', message: 'Transitioning asset status...' });
      const signer = await getSigner();
      const contract = new Contract(ADDRESSES.AssetNFT, ASSET_NFT_ABI, signer);

      const tx = await contract.transitionStatus(
        parseInt(statusTokenId, 10),
        parseInt(targetStatus, 10)
      );
      const receipt = await tx.wait();

      const newStatusName = ASSET_STATUSES[parseInt(targetStatus, 10)];
      setResult({
        type: 'success',
        message: `✔ Status transitioned!\nAsset #${statusTokenId} is now ${newStatusName}\nTx: ${receipt.hash}`,
        txHash: receipt.hash,
      });

      if (queryTokenId === statusTokenId) {
        queryAsset(statusTokenId);
      }
    } catch (err: any) {
      setResult({ type: 'error', message: `✘ Status transition failed: ${err.reason || err.message}` });
    }
  };

  return (
    <div className="panel-container">
      {/* Overview Card */}
      <div className="info-banner">
        <div className="info-banner-icon">🔒</div>
        <div>
          <h4>Soulbound Asset Lifecycle & Custody Tracking</h4>
          <p>
            Defense hardware assets (Radars, Sonars, Avionics) are permanently owned by the BEL Treasury (ERC-721 + ERC-5192 locked).
            Only the <strong>custodian</strong> changes as assets move through quality certification, deployment, and maintenance.
          </p>
        </div>
      </div>

      {/* Query Asset Section */}
      <div className="section">
        <div className="section-title-row">
          <h3><span className="icon">🔍</span> Query Asset On-Chain</h3>
        </div>

        <div className="form-grid" style={{ gridTemplateColumns: '1fr auto', alignItems: 'flex-end' }}>
          <div className="form-group">
            <label>Asset Token ID</label>
            <input
              type="number"
              min="0"
              value={queryTokenId}
              onChange={(e) => setQueryTokenId(e.target.value)}
              placeholder="e.g. 0"
            />
          </div>
          <button
            className="btn btn-primary"
            onClick={() => queryAsset()}
            disabled={queryLoading}
            style={{ height: '42px', minWidth: '140px' }}
          >
            {queryLoading ? 'Querying...' : 'Fetch Asset'}
          </button>
        </div>

        {/* Asset Details Card */}
        {assetDetails && (
          <div className="asset-card">
            <div className="asset-card-header">
              <div>
                <span className="asset-badge-id">Token #{assetDetails.tokenId}</span>
                <span className="asset-comp-title">{assetDetails.componentType}</span>
                <span className="asset-batch-sub">{assetDetails.batchId}</span>
              </div>
              <div className="asset-status-pills">
                <span
                  className="status-pill"
                  style={{
                    backgroundColor: `${ASSET_STATUS_COLORS[assetDetails.statusName]}22`,
                    color: ASSET_STATUS_COLORS[assetDetails.statusName],
                    borderColor: ASSET_STATUS_COLORS[assetDetails.statusName],
                  }}
                >
                  ● {assetDetails.statusName}
                </span>
                {assetDetails.isFrozen && (
                  <span className="status-pill status-frozen">❄️ EMERGENCY FROZEN</span>
                )}
                {assetDetails.isLocked && (
                  <span className="status-pill status-locked">🔒 SOULBOUND (LOCKED)</span>
                )}
              </div>
            </div>

            <div className="asset-details-grid">
              <div className="detail-item">
                <span className="label">Classification Level</span>
                <span className="value highlight">Level {assetDetails.classificationLevel} (Immutable)</span>
              </div>
              <div className="detail-item">
                <span className="label">Current Physical Custodian</span>
                <span className="value mono">{assetDetails.custodian}</span>
              </div>
              <div className="detail-item">
                <span className="label">Permanent Treasury Owner</span>
                <span className="value mono">{assetDetails.treasury}</span>
              </div>
              <div className="detail-item">
                <span className="label">Quality Certificate Hash</span>
                <span className="value mono text-truncate" title={assetDetails.qualityCertHash}>
                  {assetDetails.qualityCertHash}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Action Sections: Mint, Assign Custody, Transition Status */}
      <div className="three-col-grid">
        {/* Mint Asset */}
        <div className="section">
          <h3><span className="icon">🏭</span> Mint Asset</h3>
          <p className="section-hint">
            Requires <code>ASSET_MINTER_ROLE</code>. Mints permanently to Treasury.
          </p>

          <div className="form-group">
            <label>Component Code</label>
            <input
              type="text"
              value={mintComponent}
              onChange={(e) => setMintComponent(e.target.value)}
              placeholder="e.g. RADAR-TRX-01"
            />
          </div>

          <div className="form-group" style={{ marginTop: 10 }}>
            <label>Batch Identifier</label>
            <input
              type="text"
              value={mintBatch}
              onChange={(e) => setMintBatch(e.target.value)}
              placeholder="e.g. BATCH-2026-A"
            />
          </div>

          <div className="form-group" style={{ marginTop: 10 }}>
            <label>Classification Level (1–5)</label>
            <select
              value={mintClassification}
              onChange={(e) => setMintClassification(e.target.value)}
            >
              <option value="1">1 — Confidential</option>
              <option value="2">2 — Restricted</option>
              <option value="3">3 — Secret</option>
              <option value="4">4 — High Defense</option>
              <option value="5">5 — Top Secret</option>
            </select>
          </div>

          <div className="form-group" style={{ marginTop: 10 }}>
            <label>Quality Cert Hash (optional, or auto-hash)</label>
            <input
              type="text"
              value={mintCertHash}
              onChange={(e) => setMintCertHash(e.target.value)}
              placeholder="0x... or leave empty to auto-hash"
            />
          </div>

          <button
            className="btn btn-primary"
            onClick={handleMintAsset}
            style={{ marginTop: 16, width: '100%' }}
          >
            Mint Soulbound Asset
          </button>
        </div>

        {/* Assign Custody */}
        <div className="section">
          <h3><span className="icon">🤝</span> Assign Custody</h3>
          <p className="section-hint">
            Recipient must hold valid credential &gt;= asset classification level.
          </p>

          <div className="form-group">
            <label>Token ID</label>
            <input
              type="number"
              min="0"
              value={custodyTokenId}
              onChange={(e) => setCustodyTokenId(e.target.value)}
            />
          </div>

          <div className="form-group" style={{ marginTop: 10 }}>
            <label>New Custodian Address</label>
            <input
              type="text"
              placeholder="0x..."
              value={custodyRecipient}
              onChange={(e) => setCustodyRecipient(e.target.value)}
            />
            <button
              className="btn-text"
              style={{ marginTop: 4, alignSelf: 'flex-start' }}
              onClick={() => setCustodyRecipient(account)}
            >
              Assign to Me
            </button>
          </div>

          <div className="form-group" style={{ marginTop: 10 }}>
            <label>Credential Type for Verification</label>
            <select
              value={custodyCredType}
              onChange={(e) => setCustodyCredType(e.target.value)}
            >
              <option value="CLEARANCE">CLEARANCE</option>
              <option value="TRAINING">TRAINING</option>
              <option value="ROLE">ROLE</option>
            </select>
          </div>

          <button
            className="btn btn-primary"
            onClick={handleAssignCustody}
            style={{ marginTop: 16, width: '100%' }}
          >
            Transfer Custody
          </button>
        </div>

        {/* Transition Status */}
        <div className="section">
          <h3><span className="icon">🔄</span> Lifecycle State</h3>
          <p className="section-hint">
            Requires <code>STATUS_MANAGER_ROLE</code>. Enforces strict state sequence.
          </p>

          <div className="form-group">
            <label>Token ID</label>
            <input
              type="number"
              min="0"
              value={statusTokenId}
              onChange={(e) => setStatusTokenId(e.target.value)}
            />
          </div>

          <div className="form-group" style={{ marginTop: 10 }}>
            <label>Target Status</label>
            <select
              value={targetStatus}
              onChange={(e) => setTargetStatus(e.target.value)}
            >
              {ASSET_STATUSES.map((name, idx) => (
                <option key={idx} value={idx}>
                  {idx}: {name}
                </option>
              ))}
            </select>
          </div>

          <div className="state-flow-hint" style={{ marginTop: 12 }}>
            <small>
              <strong>Allowed Transitions:</strong>
              <br />
              0 → 1 (QualityCertified)
              <br />
              1 → 2 (InService)
              <br />
              2 → 3 (InMaintenance) or 4 (Suspended)
              <br />
              4 → 2 (InService) or 5 (Decommissioned)
            </small>
          </div>

          <button
            className="btn btn-warning"
            onClick={handleTransitionStatus}
            style={{ marginTop: 16, width: '100%' }}
          >
            Transition Status
          </button>
        </div>
      </div>
    </div>
  );
};
