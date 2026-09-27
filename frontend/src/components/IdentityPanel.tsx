import React, { useState, useEffect, useCallback } from 'react';
import { Contract, ethers } from 'ethers';
import { DID_REGISTRY_ABI } from '../abis';
import { ADDRESSES } from '../config';

interface IdentityPanelProps {
  account: string;
  getSigner: () => Promise<ethers.Signer>;
  getProvider: () => ethers.BrowserProvider;
  setResult: (res: { type: 'success' | 'error' | 'info'; message: string; txHash?: string } | null) => void;
}

export const IdentityPanel: React.FC<IdentityPanelProps> = ({
  account,
  getSigner,
  getProvider,
  setResult,
}) => {
  const [controller, setController] = useState<string | null>(null);
  const [isSelfSovereign, setIsSelfSovereign] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);

  // Change Owner State
  const [newOwner, setNewOwner] = useState('');

  // Delegate State
  const [delegateType, setDelegateType] = useState('veriKey');
  const [delegateAddress, setDelegateAddress] = useState('');
  const [delegateValidity, setDelegateValidity] = useState('86400'); // 1 day in seconds
  const [delegateValidStatus, setDelegateValidStatus] = useState<string | null>(null);

  const didString = `did:ethr:sepolia:${account}`;

  const resolveIdentity = useCallback(async () => {
    if (!account) return;
    try {
      setLoading(true);
      const provider = getProvider();
      const contract = new Contract(ADDRESSES.DIDRegistry, DID_REGISTRY_ABI, provider);
      const owner = await contract.identityOwner(account);
      setController(owner);
      setIsSelfSovereign(owner.toLowerCase() === account.toLowerCase());
    } catch (err: any) {
      setResult({ type: 'error', message: `DID Resolution failed: ${err.reason || err.message}` });
    } finally {
      setLoading(false);
    }
  }, [account, getProvider, setResult]);

  useEffect(() => {
    resolveIdentity();
  }, [resolveIdentity]);

  const handleChangeOwner = async () => {
    if (!ethers.isAddress(newOwner)) {
      setResult({ type: 'error', message: 'Invalid new owner address format.' });
      return;
    }
    try {
      setResult({ type: 'info', message: 'Submitting DID ownership transfer transaction...' });
      const signer = await getSigner();
      const contract = new Contract(ADDRESSES.DIDRegistry, DID_REGISTRY_ABI, signer);
      const tx = await contract.changeOwner(account, newOwner);
      const receipt = await tx.wait();
      setResult({
        type: 'success',
        message: `✔ DID Owner changed successfully!\nNew Controller: ${newOwner}\nTx: ${receipt.hash}`,
        txHash: receipt.hash,
      });
      setNewOwner('');
      resolveIdentity();
    } catch (err: any) {
      setResult({ type: 'error', message: `✘ Change owner failed: ${err.reason || err.message}` });
    }
  };

  const handleAddDelegate = async () => {
    if (!ethers.isAddress(delegateAddress)) {
      setResult({ type: 'error', message: 'Invalid delegate address format.' });
      return;
    }
    try {
      setResult({ type: 'info', message: 'Adding DID delegate on-chain...' });
      const signer = await getSigner();
      const contract = new Contract(ADDRESSES.DIDRegistry, DID_REGISTRY_ABI, signer);
      const typeBytes = ethers.encodeBytes32String(delegateType);
      const tx = await contract.addDelegate(account, typeBytes, delegateAddress, BigInt(delegateValidity));
      const receipt = await tx.wait();
      setResult({
        type: 'success',
        message: `✔ Delegate added!\nType: ${delegateType}\nDelegate: ${delegateAddress}\nValidity: ${delegateValidity}s\nTx: ${receipt.hash}`,
        txHash: receipt.hash,
      });
      checkDelegateValidity();
    } catch (err: any) {
      setResult({ type: 'error', message: `✘ Add delegate failed: ${err.reason || err.message}` });
    }
  };

  const checkDelegateValidity = async () => {
    if (!ethers.isAddress(delegateAddress)) {
      setResult({ type: 'error', message: 'Please provide a valid delegate address to check.' });
      return;
    }
    try {
      const provider = getProvider();
      const contract = new Contract(ADDRESSES.DIDRegistry, DID_REGISTRY_ABI, provider);
      const typeBytes = ethers.encodeBytes32String(delegateType);
      const isValid = await contract.validDelegate(account, typeBytes, delegateAddress);
      setDelegateValidStatus(isValid ? 'Active & Valid ✔' : 'Invalid or Expired ✘');
      setResult({
        type: isValid ? 'success' : 'info',
        message: `Delegate status for ${delegateAddress}: ${isValid ? 'VALID' : 'EXPIRED or NOT FOUND'}`,
      });
    } catch (err: any) {
      setResult({ type: 'error', message: `Check failed: ${err.reason || err.message}` });
    }
  };

  const handleRevokeDelegate = async () => {
    if (!ethers.isAddress(delegateAddress)) {
      setResult({ type: 'error', message: 'Invalid delegate address format.' });
      return;
    }
    try {
      setResult({ type: 'info', message: 'Revoking DID delegate...' });
      const signer = await getSigner();
      const contract = new Contract(ADDRESSES.DIDRegistry, DID_REGISTRY_ABI, signer);
      const typeBytes = ethers.encodeBytes32String(delegateType);
      const tx = await contract.revokeDelegate(account, typeBytes, delegateAddress);
      const receipt = await tx.wait();
      setResult({
        type: 'success',
        message: `✔ Delegate revoked!\nTx: ${receipt.hash}`,
        txHash: receipt.hash,
      });
      setDelegateValidStatus('Revoked ✘');
    } catch (err: any) {
      setResult({ type: 'error', message: `✘ Revoke delegate failed: ${err.reason || err.message}` });
    }
  };

  return (
    <div className="panel-container">
      {/* Overview Card */}
      <div className="info-banner">
        <div className="info-banner-icon">🪪</div>
        <div>
          <h4>Decentralized Identity (ERC-1056 did:ethr)</h4>
          <p>
            In the BEL defense ecosystem, every address is an instant, self-sovereign DID without centralized registration.
            You can verify control, transfer identity ownership, or grant time-bound delegation keys for automated systems.
          </p>
        </div>
      </div>

      {/* Identity Status Card */}
      <div className="section identity-card">
        <div className="identity-header">
          <div>
            <div className="panel-sublabel">Your Decentralized Identifier</div>
            <div className="did-display-code">{didString}</div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={resolveIdentity} disabled={loading}>
            {loading ? 'Resolving…' : '🔄 Refresh Resolution'}
          </button>
        </div>

        <div className="did-meta-grid">
          <div className="meta-item">
            <span className="meta-label">Controller / Owner</span>
            <span className="meta-value mono">{controller || 'Resolving...'}</span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Sovereignty Status</span>
            <span className={`status-badge ${isSelfSovereign ? 'status-green' : 'status-amber'}`}>
              {isSelfSovereign === null
                ? 'Loading...'
                : isSelfSovereign
                ? 'Self-Sovereign (Self Controlled)'
                : 'Delegated / Transferred'}
            </span>
          </div>
          <div className="meta-item">
            <span className="meta-label">DID Registry Contract</span>
            <span className="meta-value mono">{ADDRESSES.DIDRegistry}</span>
          </div>
        </div>
      </div>

      <div className="two-col-grid">
        {/* Transfer Ownership */}
        <div className="section">
          <h3><span className="icon">🔄</span> Transfer Identity Control</h3>
          <p className="section-hint">
            Assign a new controller to your DID (e.g. transfer to a MultiSig wallet or Cold Storage).
          </p>
          <div className="form-group">
            <label>New Owner / Controller Address</label>
            <input
              type="text"
              placeholder="0x..."
              value={newOwner}
              onChange={(e) => setNewOwner(e.target.value)}
            />
          </div>
          <button
            className="btn btn-warning"
            onClick={handleChangeOwner}
            disabled={!newOwner}
            style={{ marginTop: 12 }}
          >
            Transfer DID Control
          </button>
        </div>

        {/* Delegate Management */}
        <div className="section">
          <h3><span className="icon">🔑</span> Delegate Authority (Time-Bound)</h3>
          <p className="section-hint">
            Grant temporary signing or authentication capability without handing over your primary key.
          </p>
          <div className="form-group">
            <label>Delegate Type</label>
            <select value={delegateType} onChange={(e) => setDelegateType(e.target.value)}>
              <option value="veriKey">veriKey (Verification Key)</option>
              <option value="sigAuth">sigAuth (Signature Authority)</option>
              <option value="adm">adm (Administrative)</option>
            </select>
          </div>
          <div className="form-group" style={{ marginTop: 10 }}>
            <label>Delegate Address</label>
            <input
              type="text"
              placeholder="0x..."
              value={delegateAddress}
              onChange={(e) => setDelegateAddress(e.target.value)}
            />
          </div>
          <div className="form-group" style={{ marginTop: 10 }}>
            <label>Validity Duration</label>
            <select value={delegateValidity} onChange={(e) => setDelegateValidity(e.target.value)}>
              <option value="3600">1 Hour (3,600s)</option>
              <option value="86400">24 Hours (86,400s)</option>
              <option value="604800">7 Days (604,800s)</option>
              <option value="2592000">30 Days (2,592,000s)</option>
            </select>
          </div>

          {delegateValidStatus && (
            <div className="validity-indicator">
              <span>Status:</span> <strong>{delegateValidStatus}</strong>
            </div>
          )}

          <div className="button-row" style={{ marginTop: 16 }}>
            <button className="btn btn-primary" onClick={handleAddDelegate}>
              Add Delegate
            </button>
            <button className="btn btn-info" onClick={checkDelegateValidity}>
              Check Validity
            </button>
            <button className="btn btn-danger" onClick={handleRevokeDelegate}>
              Revoke
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
