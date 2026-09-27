import React, { useState, useEffect, useCallback } from 'react';
import { Contract, ethers } from 'ethers';
import { MULTISIG_ABI } from '../abis';
import {
  ADDRESSES,
  ACTION_TYPES,
  ACTION_TYPE_DESCRIPTIONS,
  ROLES,
} from '../config';

interface GovernancePanelProps {
  account: string;
  getSigner: () => Promise<ethers.Signer>;
  getProvider: () => ethers.BrowserProvider;
  setResult: (res: { type: 'success' | 'error' | 'info'; message: string; txHash?: string } | null) => void;
}

interface ProposalItem {
  id: number;
  actionType: number;
  actionName: string;
  target: string;
  role: string;
  subject: string;
  assetId: string;
  proposer: string;
  executed: boolean;
  confirmationCount: number;
  hasConfirmedByMe: boolean;
}

export const GovernancePanel: React.FC<GovernancePanelProps> = ({
  account,
  getSigner,
  getProvider,
  setResult,
}) => {
  // Board state
  const [boardSigners, setBoardSigners] = useState<string[]>([]);
  const [isCurrentUserSigner, setIsCurrentUserSigner] = useState(false);
  const [proposals, setProposals] = useState<ProposalItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Propose form state
  const [actionType, setActionType] = useState('0'); // 0: GrantRole
  const [targetAddress, setTargetAddress] = useState(ADDRESSES.AssetNFT);
  const [selectedRole, setSelectedRole] = useState('ASSET_MINTER_ROLE');
  const [customRoleHash, setCustomRoleHash] = useState('');
  const [subjectAddress, setSubjectAddress] = useState('');
  const [assetId, setAssetId] = useState('0');

  // Load signers and proposals
  const loadGovernanceData = useCallback(async () => {
    try {
      setLoading(true);
      const provider = getProvider();
      const contract = new Contract(ADDRESSES.MultiSig, MULTISIG_ABI, provider);

      // Fetch signers
      const signersList: string[] = [];
      for (let i = 0; i < 3; i++) {
        try {
          const s = await contract.signers(i);
          signersList.push(s);
        } catch {
          break;
        }
      }
      setBoardSigners(signersList);

      // Check if current user is signer
      if (account) {
        const isSig = await contract.isSigner(account);
        setIsCurrentUserSigner(isSig);
      }

      // Fetch proposal count
      const countBig = await contract.proposalCount();
      const count = Number(countBig);

      const items: ProposalItem[] = [];
      // Fetch proposals up to last 20
      const start = Math.max(0, count - 20);
      for (let i = start; i < count; i++) {
        const prop = await contract.getProposal(i);
        let hasConfirmed = false;
        if (account) {
          hasConfirmed = await contract.hasConfirmed(i, account).catch(() => false);
        }

        const actNum = Number(prop[0]);
        items.push({
          id: i,
          actionType: actNum,
          actionName: ACTION_TYPES[actNum] || `Action ${actNum}`,
          target: prop[1],
          role: prop[2],
          subject: prop[3],
          assetId: prop[4].toString(),
          proposer: prop[5],
          executed: prop[6],
          confirmationCount: Number(prop[7]),
          hasConfirmedByMe: hasConfirmed,
        });
      }

      setProposals(items.reverse());
    } catch (err: any) {
      console.warn('Governance load error:', err);
    } finally {
      setLoading(false);
    }
  }, [account, getProvider]);

  useEffect(() => {
    loadGovernanceData();
  }, [loadGovernanceData]);

  // Handle Preset changes
  const handleActionChange = (newAct: string) => {
    setActionType(newAct);
    if (newAct === '2') {
      // ChangeCredentialIssuer
      setTargetAddress(ADDRESSES.CredentialRegistry);
    } else if (newAct === '3' || newAct === '4') {
      // EmergencyFreeze or UnfreezeAsset
      setTargetAddress(ADDRESSES.AssetNFT);
    }
  };

  const handlePropose = async () => {
    try {
      setResult({ type: 'info', message: 'Submitting MultiSig proposal...' });
      const signer = await getSigner();
      const contract = new Contract(ADDRESSES.MultiSig, MULTISIG_ABI, signer);

      let roleHash = ethers.ZeroHash;
      if (actionType === '0' || actionType === '1') {
        if (selectedRole === 'CUSTOM') {
          roleHash = customRoleHash.startsWith('0x') ? customRoleHash : ethers.id(customRoleHash);
        } else {
          roleHash = (ROLES as any)[selectedRole] || ethers.ZeroHash;
        }
      }

      const tx = await contract.propose(
        parseInt(actionType, 10),
        targetAddress || ethers.ZeroAddress,
        roleHash,
        subjectAddress || ethers.ZeroAddress,
        BigInt(assetId || '0')
      );
      const receipt = await tx.wait();

      setResult({
        type: 'success',
        message: `✔ MultiSig Proposal Submitted!\nAction: ${ACTION_TYPES[parseInt(actionType, 10)]}\nTx: ${receipt.hash}\nNote: Proposing automatically counts as Confirmation 1/2.`,
        txHash: receipt.hash,
      });

      loadGovernanceData();
    } catch (err: any) {
      setResult({ type: 'error', message: `✘ Propose failed: ${err.reason || err.message}` });
    }
  };

  const handleConfirmAndExecute = async (proposalId: number) => {
    try {
      setResult({ type: 'info', message: `Confirming & executing Proposal #${proposalId}...` });
      const signer = await getSigner();
      const contract = new Contract(ADDRESSES.MultiSig, MULTISIG_ABI, signer);

      const tx = await contract.confirmAndExecute(proposalId);
      const receipt = await tx.wait();

      setResult({
        type: 'success',
        message: `✔ Proposal #${proposalId} Confirmed & Executed atomically!\nTx: ${receipt.hash}`,
        txHash: receipt.hash,
      });

      loadGovernanceData();
    } catch (err: any) {
      setResult({ type: 'error', message: `✘ Confirmation reverted: ${err.reason || err.message}` });
    }
  };

  return (
    <div className="panel-container">
      {/* Overview Card */}
      <div className="info-banner">
        <div className="info-banner-icon">🏛️</div>
        <div>
          <h4>2-of-3 MultiSig Board Governance</h4>
          <p>
            The BEL Trust Chain eliminates single points of failure. The initial deployer has renounced all admin privileges.
            Privileged actions (role grants, credential issuer changes, emergency freezes) require <strong>2 of 3 board signers</strong>.
          </p>
        </div>
      </div>

      {/* Board Status Card */}
      <div className="section governance-board-card">
        <div className="section-title-row">
          <h3><span className="icon">👥</span> Board Signers (2-of-3 Quorum)</h3>
          <div className="board-status-right">
            <span className={`status-badge ${isCurrentUserSigner ? 'status-green' : 'status-amber'}`}>
              {isCurrentUserSigner ? '★ You are an Authorized Board Signer' : 'Observer / Non-Signer'}
            </span>
            <button className="btn btn-secondary btn-sm" onClick={loadGovernanceData} disabled={loading}>
              {loading ? 'Refreshing…' : '🔄 Refresh Board'}
            </button>
          </div>
        </div>

        <div className="signers-list">
          {boardSigners.map((s, idx) => {
            const isMe = account && s.toLowerCase() === account.toLowerCase();
            return (
              <div key={idx} className={`signer-row ${isMe ? 'is-me' : ''}`}>
                <span className="signer-badge">Signer #{idx + 1}</span>
                <span className="signer-address mono">{s}</span>
                {isMe && <span className="you-pill">Connected Wallet</span>}
              </div>
            );
          })}
        </div>
      </div>

      <div className="two-col-grid">
        {/* Create Proposal */}
        <div className="section">
          <h3><span className="icon">📝</span> Create New Proposal</h3>
          <p className="section-hint">
            Must be submitted by an authorized board signer. Submitting automatically registers confirmation 1 of 2.
          </p>

          <div className="form-group">
            <label>Governance Action</label>
            <select value={actionType} onChange={(e) => handleActionChange(e.target.value)}>
              {ACTION_TYPES.map((name, idx) => (
                <option key={idx} value={idx}>
                  {idx}: {name} — {ACTION_TYPE_DESCRIPTIONS[idx]}
                </option>
              ))}
            </select>
          </div>

          {/* Target Address */}
          <div className="form-group" style={{ marginTop: 10 }}>
            <label>Target Contract Address</label>
            <input
              type="text"
              value={targetAddress}
              onChange={(e) => setTargetAddress(e.target.value)}
              placeholder="0x..."
            />
            <div className="quick-presets">
              <span className="preset-lbl">Presets:</span>
              <button
                type="button"
                className="btn-text-preset"
                onClick={() => setTargetAddress(ADDRESSES.AssetNFT)}
              >
                AssetNFT
              </button>
              <button
                type="button"
                className="btn-text-preset"
                onClick={() => setTargetAddress(ADDRESSES.CredentialRegistry)}
              >
                CredentialRegistry
              </button>
              <button
                type="button"
                className="btn-text-preset"
                onClick={() => setTargetAddress(ADDRESSES.AccessControl)}
              >
                TimeBoundAccessControl
              </button>
            </div>
          </div>

          {/* Role selection for GrantRole / RevokeRole */}
          {(actionType === '0' || actionType === '1') && (
            <div className="form-group" style={{ marginTop: 10 }}>
              <label>Role to Manage</label>
              <select
                value={selectedRole}
                onChange={(e) => {
                  const role = e.target.value;
                  setSelectedRole(role);
                  if (role === 'ASSET_MINTER_ROLE' || role === 'STATUS_MANAGER_ROLE') {
                    setTargetAddress(ADDRESSES.AssetNFT);
                  } else if (role === 'CREDENTIAL_ISSUER_ROLE') {
                    setTargetAddress(ADDRESSES.CredentialRegistry);
                  } else if (['RBAC_ADMIN_ROLE', 'ADMIN_ROLE', 'MANAGER_ROLE', 'AUDITOR_ROLE', 'USER_ROLE'].includes(role)) {
                    setTargetAddress(ADDRESSES.AccessControl);
                  }
                }}
              >
                <option value="ASSET_MINTER_ROLE">ASSET_MINTER_ROLE (AssetNFT)</option>
                <option value="STATUS_MANAGER_ROLE">STATUS_MANAGER_ROLE (AssetNFT)</option>
                <option value="CREDENTIAL_ISSUER_ROLE">CREDENTIAL_ISSUER_ROLE (CredentialRegistry)</option>
                <option value="RBAC_ADMIN_ROLE">RBAC_ADMIN_ROLE (TimeBoundAccessControl)</option>
                <option value="ADMIN_ROLE">ADMIN_ROLE (TimeBoundAccessControl)</option>
                <option value="MANAGER_ROLE">MANAGER_ROLE (TimeBoundAccessControl)</option>
                <option value="AUDITOR_ROLE">AUDITOR_ROLE (TimeBoundAccessControl)</option>
                <option value="USER_ROLE">USER_ROLE (TimeBoundAccessControl)</option>
                <option value="CUSTOM">Custom Role Hash</option>
              </select>
            </div>
          )}

          {selectedRole === 'CUSTOM' && (actionType === '0' || actionType === '1') && (
            <div className="form-group" style={{ marginTop: 10 }}>
              <label>Custom Role String or keccak256 Hash</label>
              <input
                type="text"
                value={customRoleHash}
                onChange={(e) => setCustomRoleHash(e.target.value)}
                placeholder="e.g. CUSTOM_ROLE or 0x..."
              />
            </div>
          )}

          {/* Subject Address (Recipient of role or new issuer) */}
          {actionType !== '3' && actionType !== '4' && (
            <div className="form-group" style={{ marginTop: 10 }}>
              <label>Subject / Grantee Address</label>
              <input
                type="text"
                placeholder="0x..."
                value={subjectAddress}
                onChange={(e) => setSubjectAddress(e.target.value)}
              />
            </div>
          )}

          {/* Asset ID for EmergencyFreeze or UnfreezeAsset */}
          {(actionType === '3' || actionType === '4') && (
            <div className="form-group" style={{ marginTop: 10 }}>
              <label>Token ID to {actionType === '3' ? 'Emergency Freeze' : 'Unfreeze'}</label>
              <input
                type="number"
                min="0"
                value={assetId}
                onChange={(e) => setAssetId(e.target.value)}
              />
              <small style={{ color: 'var(--text-secondary)', marginTop: 4 }}>
                {actionType === '3'
                  ? 'Emergency freeze halts all custody transfers on this specific asset without disrupting other defense hardware.'
                  : 'Unfreezing restores normal custody transfers and lifecycle transitions on this asset.'}
              </small>
            </div>
          )}

          <button
            className="btn btn-primary"
            onClick={handlePropose}
            style={{ marginTop: 16, width: '100%' }}
          >
            Submit Governance Proposal
          </button>
        </div>

        {/* Proposals List */}
        <div className="section">
          <h3><span className="icon">📋</span> Proposals & Execution</h3>
          <p className="section-hint">
            Second signer can confirm and execute atomically in one transaction.
          </p>

          {proposals.length === 0 ? (
            <div className="empty-state">
              <span>No proposals submitted yet. Board signers can create proposals using the form.</span>
            </div>
          ) : (
            <div className="proposal-cards-list">
              {proposals.map((p) => {
                const canExecute = !p.executed && isCurrentUserSigner && !p.hasConfirmedByMe;
                return (
                  <div
                    key={p.id}
                    className={`proposal-card ${p.executed ? 'executed' : 'pending'}`}
                  >
                    <div className="proposal-card-top">
                      <div className="prop-id-tag">
                        <span>Proposal #{p.id}</span>
                        <span className="prop-action-badge">{p.actionName}</span>
                      </div>
                      <span className={`status-pill ${p.executed ? 'active' : 'warning'}`}>
                        {p.executed ? '✔ Executed' : `⏳ Confirmed ${p.confirmationCount}/2`}
                      </span>
                    </div>

                    <div className="prop-meta-grid">
                      <div className="p-item">
                        <span className="p-lbl">Target:</span>
                        <span className="p-val mono text-truncate" title={p.target}>
                          {p.target.slice(0, 8)}…{p.target.slice(-6)}
                        </span>
                      </div>
                      {p.actionType === 3 || p.actionType === 4 ? (
                        <div className="p-item">
                          <span className="p-lbl">Asset ID:</span>
                          <span className="p-val highlight">#{p.assetId}</span>
                        </div>
                      ) : (
                        <div className="p-item">
                          <span className="p-lbl">Subject:</span>
                          <span className="p-val mono text-truncate" title={p.subject}>
                            {p.subject !== ethers.ZeroAddress
                              ? `${p.subject.slice(0, 8)}…${p.subject.slice(-6)}`
                              : 'None'}
                          </span>
                        </div>
                      )}
                      <div className="p-item full">
                        <span className="p-lbl">Proposer:</span>
                        <span className="p-val mono">{p.proposer}</span>
                      </div>
                    </div>

                    {!p.executed && (
                      <div className="proposal-card-actions">
                        {p.hasConfirmedByMe ? (
                          <span className="already-confirmed-note">✓ You have confirmed this proposal</span>
                        ) : canExecute ? (
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => handleConfirmAndExecute(p.id)}
                          >
                            Confirm & Execute (2/2)
                          </button>
                        ) : (
                          <span className="cannot-confirm-note">Awaiting 2nd board confirmation</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
