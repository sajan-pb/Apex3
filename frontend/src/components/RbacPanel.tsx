import React, { useState } from 'react';
import { Contract, ethers } from 'ethers';
import { ACCESS_CONTROL_ABI } from '../abis';
import { ADDRESSES, ROLES } from '../config';

interface RbacPanelProps {
  account: string;
  getSigner: () => Promise<ethers.Signer>;
  getProvider: () => ethers.BrowserProvider;
  setResult: (res: { type: 'success' | 'error' | 'info'; message: string; txHash?: string } | null) => void;
}

interface RoleStatus {
  hasRole: boolean;
  isActive: boolean;
  expiryTimestamp: number;
}

export const RbacPanel: React.FC<RbacPanelProps> = ({
  account,
  getSigner,
  getProvider,
  setResult,
}) => {
  // Query state
  const [queryAddress, setQueryAddress] = useState(account);
  const [queryRole, setQueryRole] = useState('MANAGER_ROLE');
  const [roleStatus, setRoleStatus] = useState<RoleStatus | null>(null);
  const [loading, setLoading] = useState(false);

  // Grant state
  const [grantAddress, setGrantAddress] = useState('');
  const [grantRole, setGrantRole] = useState('USER_ROLE');
  const [grantDuration, setGrantDuration] = useState('86400'); // 1 day

  // Revoke state
  const [revokeAddress, setRevokeAddress] = useState('');
  const [revokeRole, setRevokeRole] = useState('USER_ROLE');

  const checkRole = async () => {
    if (!ethers.isAddress(queryAddress)) {
      setResult({ type: 'error', message: 'Please provide a valid Ethereum address.' });
      return;
    }
    try {
      setLoading(true);
      const provider = getProvider();
      const contract = new Contract(ADDRESSES.AccessControl, ACCESS_CONTROL_ABI, provider);
      const roleHash = (ROLES as any)[queryRole] || ethers.ZeroHash;

      const [hasRoleBase, isActive, expiryBig] = await Promise.all([
        contract.hasRole(roleHash, queryAddress),
        contract.hasActiveRole(roleHash, queryAddress),
        contract.roleExpiry(queryAddress, roleHash).catch(() => 0n),
      ]);

      const status: RoleStatus = {
        hasRole: hasRoleBase,
        isActive,
        expiryTimestamp: Number(expiryBig),
      };

      setRoleStatus(status);
      setResult({
        type: isActive ? 'success' : 'info',
        message: `Role ${queryRole} for ${queryAddress.slice(0, 8)}…: ${isActive ? 'ACTIVE ✔' : hasRoleBase ? 'EXPIRED ✘' : 'NOT GRANTED ✘'}`,
      });
    } catch (err: any) {
      setResult({ type: 'error', message: `Role check failed: ${err.reason || err.message}` });
    } finally {
      setLoading(false);
    }
  };

  const handleGrantRole = async () => {
    if (!ethers.isAddress(grantAddress)) {
      setResult({ type: 'error', message: 'Invalid target address to grant role.' });
      return;
    }
    try {
      setResult({ type: 'info', message: 'Submitting time-bound role grant...' });
      const signer = await getSigner();
      const contract = new Contract(ADDRESSES.AccessControl, ACCESS_CONTROL_ABI, signer);
      const roleHash = (ROLES as any)[grantRole] || ethers.ZeroHash;

      let expiresAt = 0;
      if (grantDuration !== '0') {
        const now = Math.floor(Date.now() / 1000);
        expiresAt = now + parseInt(grantDuration, 10);
      }

      const tx = await contract.grantRoleWithExpiry(roleHash, grantAddress, expiresAt);
      const receipt = await tx.wait();

      setResult({
        type: 'success',
        message: `✔ Role ${grantRole} granted to ${grantAddress}!\nExpires: ${expiresAt === 0 ? 'Never' : new Date(expiresAt * 1000).toLocaleString()}\nTx: ${receipt.hash}`,
        txHash: receipt.hash,
      });

      if (queryAddress.toLowerCase() === grantAddress.toLowerCase()) {
        checkRole();
      }
    } catch (err: any) {
      setResult({ type: 'error', message: `✘ Grant role reverted: ${err.reason || err.message}` });
    }
  };

  const handleRevokeRole = async () => {
    if (!ethers.isAddress(revokeAddress)) {
      setResult({ type: 'error', message: 'Invalid target address to revoke role.' });
      return;
    }
    try {
      setResult({ type: 'info', message: 'Revoking role on-chain...' });
      const signer = await getSigner();
      const contract = new Contract(ADDRESSES.AccessControl, ACCESS_CONTROL_ABI, signer);
      const roleHash = (ROLES as any)[revokeRole] || ethers.ZeroHash;

      const tx = await contract.revokeRole(roleHash, revokeAddress);
      const receipt = await tx.wait();

      setResult({
        type: 'success',
        message: `✔ Role ${revokeRole} revoked from ${revokeAddress}!\nTx: ${receipt.hash}`,
        txHash: receipt.hash,
      });

      if (queryAddress.toLowerCase() === revokeAddress.toLowerCase()) {
        checkRole();
      }
    } catch (err: any) {
      setResult({ type: 'error', message: `✘ Revoke role reverted: ${err.reason || err.message}` });
    }
  };

  return (
    <div className="panel-container">
      {/* Overview Card */}
      <div className="info-banner">
        <div className="info-banner-icon">🛡️</div>
        <div>
          <h4>Time-Bound Role-Based Access Control (RBAC)</h4>
          <p>
            Standard enterprise roles (Admin, Manager, Auditor, User) with cryptographically enforced expiration timestamps.
            Roles automatically lapse once block timestamp exceeds expiry — preventing dormant privileged credentials.
          </p>
        </div>
      </div>

      {/* Query Role Status */}
      <div className="section">
        <div className="section-title-row">
          <h3><span className="icon">🔍</span> Inspect Role & Time Expiry</h3>
          <button className="btn-text" onClick={() => setQueryAddress(account)}>
            Use My Address
          </button>
        </div>

        <div className="form-grid">
          <div className="form-group full">
            <label>Subject Address</label>
            <input
              type="text"
              placeholder="0x..."
              value={queryAddress}
              onChange={(e) => setQueryAddress(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Role to Query</label>
            <select value={queryRole} onChange={(e) => setQueryRole(e.target.value)}>
              <option value="ADMIN_ROLE">ADMIN_ROLE</option>
              <option value="MANAGER_ROLE">MANAGER_ROLE</option>
              <option value="AUDITOR_ROLE">AUDITOR_ROLE</option>
              <option value="USER_ROLE">USER_ROLE</option>
              <option value="RBAC_ADMIN_ROLE">RBAC_ADMIN_ROLE (Held by MultiSig)</option>
            </select>
          </div>
          <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button
              className="btn btn-primary"
              style={{ width: '100%', height: '42px' }}
              onClick={checkRole}
              disabled={loading}
            >
              {loading ? 'Checking...' : 'Check Active Status'}
            </button>
          </div>
        </div>

        {/* Role Status Card */}
        {roleStatus && (
          <div className={`cred-detail-card ${roleStatus.isActive ? 'valid' : 'invalid'}`}>
            <div className="cred-detail-header">
              <div className="cred-title">
                <span className="cred-badge-type">{queryRole}</span>
                <span className="cred-subject-short">{queryAddress}</span>
              </div>
              <span className={`status-pill ${roleStatus.isActive ? 'active' : 'inactive'}`}>
                {roleStatus.isActive ? '✔ ACTIVE' : roleStatus.hasRole ? 'EXPIRED' : 'NOT GRANTED'}
              </span>
            </div>

            <div className="cred-detail-grid">
              <div className="cred-item">
                <span className="lbl">Base Role Granted</span>
                <span className="val">{roleStatus.hasRole ? 'Yes' : 'No'}</span>
              </div>
              <div className="cred-item">
                <span className="lbl">Active Status</span>
                <span className="val highlight">{roleStatus.isActive ? 'Active Now' : 'Inactive'}</span>
              </div>
              <div className="cred-item full">
                <span className="lbl">Expiration Date</span>
                <span className="val">
                  {roleStatus.expiryTimestamp === 0
                    ? 'Permanent (No Expiry)'
                    : new Date(roleStatus.expiryTimestamp * 1000).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="two-col-grid">
        {/* Grant Role With Expiry */}
        <div className="section">
          <h3><span className="icon">⏱️</span> Grant Role With Expiry</h3>
          <p className="section-hint">
            Requires <code>RBAC_ADMIN_ROLE</code> (MultiSigAdmin). Assigns an automatic expiry date.
          </p>

          <div className="form-group">
            <label>Target Address</label>
            <input
              type="text"
              placeholder="0x..."
              value={grantAddress}
              onChange={(e) => setGrantAddress(e.target.value)}
            />
          </div>

          <div className="form-group" style={{ marginTop: 10 }}>
            <label>Role</label>
            <select value={grantRole} onChange={(e) => setGrantRole(e.target.value)}>
              <option value="USER_ROLE">USER_ROLE</option>
              <option value="AUDITOR_ROLE">AUDITOR_ROLE</option>
              <option value="MANAGER_ROLE">MANAGER_ROLE</option>
              <option value="ADMIN_ROLE">ADMIN_ROLE</option>
            </select>
          </div>

          <div className="form-group" style={{ marginTop: 10 }}>
            <label>Validity Period</label>
            <select value={grantDuration} onChange={(e) => setGrantDuration(e.target.value)}>
              <option value="3600">1 Hour</option>
              <option value="86400">24 Hours (1 Day)</option>
              <option value="604800">7 Days</option>
              <option value="2592000">30 Days</option>
              <option value="31536000">1 Year</option>
              <option value="0">Permanent (No Expiry)</option>
            </select>
          </div>

          <button
            className="btn btn-primary"
            onClick={handleGrantRole}
            style={{ marginTop: 16 }}
          >
            Grant Role
          </button>
        </div>

        {/* Revoke Role */}
        <div className="section">
          <h3><span className="icon">🚫</span> Revoke Role</h3>
          <p className="section-hint">
            Immediately strips the role and resets the expiry timestamp to 0.
          </p>

          <div className="form-group">
            <label>Target Address</label>
            <input
              type="text"
              placeholder="0x..."
              value={revokeAddress}
              onChange={(e) => setRevokeAddress(e.target.value)}
            />
          </div>

          <div className="form-group" style={{ marginTop: 10 }}>
            <label>Role</label>
            <select value={revokeRole} onChange={(e) => setRevokeRole(e.target.value)}>
              <option value="USER_ROLE">USER_ROLE</option>
              <option value="AUDITOR_ROLE">AUDITOR_ROLE</option>
              <option value="MANAGER_ROLE">MANAGER_ROLE</option>
              <option value="ADMIN_ROLE">ADMIN_ROLE</option>
            </select>
          </div>

          <button
            className="btn btn-danger"
            onClick={handleRevokeRole}
            style={{ marginTop: 16 }}
          >
            Revoke Role
          </button>
        </div>
      </div>
    </div>
  );
};
