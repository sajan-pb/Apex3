import React, { useState } from 'react';
import { Contract, ethers } from 'ethers';
import { CREDENTIAL_REGISTRY_ABI } from '../abis';
import { ADDRESSES } from '../config';

interface CredentialPanelProps {
  account: string;
  getSigner: () => Promise<ethers.Signer>;
  getProvider: () => ethers.BrowserProvider;
  setResult: (res: { type: 'success' | 'error' | 'info'; message: string; txHash?: string } | null) => void;
}

interface CredentialData {
  exists: boolean;
  revoked: boolean;
  level: number;
  issuedAt: number;
  expiresAt: number;
  version: number;
  issuer: string;
  isValid: boolean;
}

export const CredentialPanel: React.FC<CredentialPanelProps> = ({
  account,
  getSigner,
  getProvider,
  setResult,
}) => {
  // Query state
  const [querySubject, setQuerySubject] = useState(account);
  const [queryType, setQueryType] = useState('CLEARANCE');
  const [queriedCred, setQueriedCred] = useState<CredentialData | null>(null);
  const [queryLoading, setQueryLoading] = useState(false);

  // Issue state
  const [issueSubject, setIssueSubject] = useState('');
  const [issueType, setIssueType] = useState('CLEARANCE');
  const [issueLevel, setIssueLevel] = useState('3');
  const [issueExpiryPreset, setIssueExpiryPreset] = useState('0'); // 0 = never

  // Revoke state
  const [revokeSubject, setRevokeSubject] = useState('');
  const [revokeType, setRevokeType] = useState('CLEARANCE');

  const checkCredential = async () => {
    if (!ethers.isAddress(querySubject)) {
      setResult({ type: 'error', message: 'Please enter a valid Ethereum address for the subject.' });
      return;
    }
    try {
      setQueryLoading(true);
      const provider = getProvider();
      const contract = new Contract(ADDRESSES.CredentialRegistry, CREDENTIAL_REGISTRY_ABI, provider);
      const typeBytes = ethers.encodeBytes32String(queryType);

      const isValid = await contract.isCredentialValid(querySubject, typeBytes);
      const credTuple = await contract.credentials(querySubject, typeBytes);

      const data: CredentialData = {
        exists: credTuple[0],
        revoked: credTuple[1],
        level: Number(credTuple[2]),
        issuedAt: Number(credTuple[3]),
        expiresAt: Number(credTuple[4]),
        version: Number(credTuple[5]),
        issuer: credTuple[6],
        isValid,
      };

      setQueriedCred(data);
      if (isValid) {
        setResult({
          type: 'success',
          message: `✔ Valid Credential Found!\nSubject: ${querySubject}\nType: ${queryType}\nLevel: ${data.level}\nVersion: ${data.version}\nIssuer: ${data.issuer}`,
        });
      } else if (!data.exists) {
        setResult({
          type: 'info',
          message: `ℹ No credential found for subject ${querySubject} under type "${queryType}".`,
        });
      } else {
        const reason = data.revoked ? 'Revoked' : 'Expired';
        setResult({
          type: 'error',
          message: `✘ Credential exists but is invalid (${reason}).`,
        });
      }
    } catch (err: any) {
      setResult({ type: 'error', message: `Query failed: ${err.reason || err.message}` });
    } finally {
      setQueryLoading(false);
    }
  };

  const handleIssueCredential = async () => {
    if (!ethers.isAddress(issueSubject)) {
      setResult({ type: 'error', message: 'Invalid subject address.' });
      return;
    }

    let calculatedExpiry = 0;
    if (issueExpiryPreset !== '0') {
      const now = Math.floor(Date.now() / 1000);
      calculatedExpiry = now + parseInt(issueExpiryPreset, 10);
    }

    try {
      setResult({ type: 'info', message: 'Issuing verifiable credential on-chain...' });
      const signer = await getSigner();
      const contract = new Contract(ADDRESSES.CredentialRegistry, CREDENTIAL_REGISTRY_ABI, signer);
      const typeBytes = ethers.encodeBytes32String(issueType);

      const tx = await contract.issueCredential(
        issueSubject,
        typeBytes,
        parseInt(issueLevel, 10),
        calculatedExpiry
      );
      const receipt = await tx.wait();

      setResult({
        type: 'success',
        message: `✔ Credential successfully issued!\nSubject: ${issueSubject}\nType: ${issueType}\nLevel: ${issueLevel}\nTx: ${receipt.hash}`,
        txHash: receipt.hash,
      });

      // Update query subject if same
      if (querySubject.toLowerCase() === issueSubject.toLowerCase()) {
        checkCredential();
      }
    } catch (err: any) {
      setResult({ type: 'error', message: `✘ Issue credential reverted: ${err.reason || err.message}` });
    }
  };

  const handleRevokeCredential = async () => {
    if (!ethers.isAddress(revokeSubject)) {
      setResult({ type: 'error', message: 'Invalid subject address.' });
      return;
    }
    try {
      setResult({ type: 'info', message: 'Submitting credential revocation on-chain...' });
      const signer = await getSigner();
      const contract = new Contract(ADDRESSES.CredentialRegistry, CREDENTIAL_REGISTRY_ABI, signer);
      const typeBytes = ethers.encodeBytes32String(revokeType);

      const tx = await contract.revokeCredential(revokeSubject, typeBytes);
      const receipt = await tx.wait();

      setResult({
        type: 'success',
        message: `✔ Credential revoked successfully!\nSubject: ${revokeSubject}\nType: ${revokeType}\nTx: ${receipt.hash}`,
        txHash: receipt.hash,
      });

      if (querySubject.toLowerCase() === revokeSubject.toLowerCase()) {
        checkCredential();
      }
    } catch (err: any) {
      setResult({ type: 'error', message: `✘ Revoke reverted: ${err.reason || err.message}` });
    }
  };

  return (
    <div className="panel-container">
      {/* Overview Card */}
      <div className="info-banner">
        <div className="info-banner-icon">📜</div>
        <div>
          <h4>Verifiable Credentials & Security Clearance Registry</h4>
          <p>
            On-chain credentials gate who is allowed to take physical custody of defense components.
            Personnel must hold an active credential with a clearance level equal to or higher than the asset's classification level.
          </p>
        </div>
      </div>

      {/* Query & Verification Tool */}
      <div className="section">
        <div className="section-title-row">
          <h3><span className="icon">🔍</span> Query / Verify Credential</h3>
          <button
            className="btn-text"
            onClick={() => setQuerySubject(account)}
            title="Fill in my connected wallet address"
          >
            Use My Address
          </button>
        </div>

        <div className="form-grid">
          <div className="form-group full">
            <label>Subject Address (Defense Personnel / Node)</label>
            <input
              type="text"
              placeholder="0x..."
              value={querySubject}
              onChange={(e) => setQuerySubject(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Credential Type</label>
            <select value={queryType} onChange={(e) => setQueryType(e.target.value)}>
              <option value="CLEARANCE">CLEARANCE (Security Clearance 1-5)</option>
              <option value="TRAINING">TRAINING (Technical Certification)</option>
              <option value="ROLE">ROLE (Functional Assignment)</option>
              <option value="AVIONICS_CERT">AVIONICS_CERT</option>
            </select>
          </div>
          <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button
              className="btn btn-primary"
              style={{ width: '100%', height: '42px' }}
              onClick={checkCredential}
              disabled={queryLoading}
            >
              {queryLoading ? 'Verifying...' : 'Check Validity'}
            </button>
          </div>
        </div>

        {/* Credential Query Result Card */}
        {queriedCred && (
          <div className={`cred-detail-card ${queriedCred.isValid ? 'valid' : 'invalid'}`}>
            <div className="cred-detail-header">
              <div className="cred-title">
                <span className="cred-badge-type">{queryType}</span>
                <span className="cred-subject-short">{querySubject}</span>
              </div>
              <span className={`status-pill ${queriedCred.isValid ? 'active' : 'inactive'}`}>
                {queriedCred.isValid ? '✔ VALID' : queriedCred.revoked ? '✘ REVOKED' : !queriedCred.exists ? 'NOT FOUND' : 'EXPIRED'}
              </span>
            </div>

            {queriedCred.exists && (
              <div className="cred-detail-grid">
                <div className="cred-item">
                  <span className="lbl">Clearance Level</span>
                  <span className="val highlight">Level {queriedCred.level}</span>
                </div>
                <div className="cred-item">
                  <span className="lbl">Version</span>
                  <span className="val">v{queriedCred.version}</span>
                </div>
                <div className="cred-item">
                  <span className="lbl">Issued At</span>
                  <span className="val">
                    {queriedCred.issuedAt ? new Date(queriedCred.issuedAt * 1000).toLocaleString() : 'N/A'}
                  </span>
                </div>
                <div className="cred-item">
                  <span className="lbl">Expires At</span>
                  <span className="val">
                    {queriedCred.expiresAt === 0
                      ? 'Never (Permanent)'
                      : new Date(queriedCred.expiresAt * 1000).toLocaleString()}
                  </span>
                </div>
                <div className="cred-item full">
                  <span className="lbl">Authorized Issuer</span>
                  <span className="val mono">{queriedCred.issuer}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Two Column Actions: Issue and Revoke */}
      <div className="two-col-grid">
        {/* Issue Credential */}
        <div className="section">
          <h3><span className="icon">✍️</span> Issue Credential</h3>
          <p className="section-hint">
            Requires <code>CREDENTIAL_ISSUER_ROLE</code>. Reissuing to an existing subject increments the version.
          </p>

          <div className="form-group">
            <label>Subject Address</label>
            <input
              type="text"
              placeholder="0x..."
              value={issueSubject}
              onChange={(e) => setIssueSubject(e.target.value)}
            />
          </div>

          <div className="form-group" style={{ marginTop: 10 }}>
            <label>Credential Type</label>
            <select value={issueType} onChange={(e) => setIssueType(e.target.value)}>
              <option value="CLEARANCE">CLEARANCE</option>
              <option value="TRAINING">TRAINING</option>
              <option value="ROLE">ROLE</option>
              <option value="AVIONICS_CERT">AVIONICS_CERT</option>
            </select>
          </div>

          <div className="form-grid" style={{ marginTop: 10, marginBottom: 0 }}>
            <div className="form-group">
              <label>Clearance Level (0–5)</label>
              <select value={issueLevel} onChange={(e) => setIssueLevel(e.target.value)}>
                <option value="1">Level 1 — Confidential</option>
                <option value="2">Level 2 — Restricted</option>
                <option value="3">Level 3 — Secret</option>
                <option value="4">Level 4 — High Defense</option>
                <option value="5">Level 5 — Top Secret</option>
              </select>
            </div>
            <div className="form-group">
              <label>Validity Duration</label>
              <select value={issueExpiryPreset} onChange={(e) => setIssueExpiryPreset(e.target.value)}>
                <option value="0">Never Expires (Permanent)</option>
                <option value="86400">1 Day (86,400s)</option>
                <option value="2592000">30 Days</option>
                <option value="7776000">90 Days</option>
                <option value="31536000">1 Year (365 Days)</option>
              </select>
            </div>
          </div>

          <button
            className="btn btn-primary"
            onClick={handleIssueCredential}
            style={{ marginTop: 16 }}
          >
            Issue Credential
          </button>
        </div>

        {/* Revoke Credential */}
        <div className="section">
          <h3><span className="icon">🚫</span> Revoke Credential</h3>
          <p className="section-hint">
            Immediately invalidates security clearance or authorization on-chain.
          </p>

          <div className="form-group">
            <label>Subject Address to Revoke</label>
            <input
              type="text"
              placeholder="0x..."
              value={revokeSubject}
              onChange={(e) => setRevokeSubject(e.target.value)}
            />
          </div>

          <div className="form-group" style={{ marginTop: 10 }}>
            <label>Credential Type</label>
            <select value={revokeType} onChange={(e) => setRevokeType(e.target.value)}>
              <option value="CLEARANCE">CLEARANCE</option>
              <option value="TRAINING">TRAINING</option>
              <option value="ROLE">ROLE</option>
              <option value="AVIONICS_CERT">AVIONICS_CERT</option>
            </select>
          </div>

          <button
            className="btn btn-danger"
            onClick={handleRevokeCredential}
            style={{ marginTop: 16 }}
          >
            Revoke Credential
          </button>
        </div>
      </div>
    </div>
  );
};
