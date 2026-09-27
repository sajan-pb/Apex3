import React from 'react';
import { ADDRESSES } from '../config';

interface ExplanationGuideProps {
  onClose: () => void;
}

export const ExplanationGuide: React.FC<ExplanationGuideProps> = ({ onClose }) => {
  return (
    <div className="guide-modal-backdrop" onClick={onClose}>
      <div className="guide-modal" onClick={(e) => e.stopPropagation()}>
        <div className="guide-modal-header">
          <div className="guide-modal-title">
            <span className="guide-icon">🛡️</span>
            <div>
              <h2>BEL Trust Chain — System & Architecture Guide</h2>
              <p>Everything you need to know about Bharat Electronics' decentralized defense asset custody system (SIH26125)</p>
            </div>
          </div>
          <button className="guide-modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="guide-modal-body">
          {/* Section 1 */}
          <div className="guide-card">
            <div className="guide-card-icon">🪪</div>
            <div className="guide-card-content">
              <h3>1. Decentralized Identity (ERC-1056 did:ethr)</h3>
              <p>
                <strong>What it is:</strong> Every defense engineer, quality inspector, and military unit has a <code>did:ethr</code> identity.
                Unlike traditional corporate logins, <em>any Ethereum address is a valid DID the instant it exists</em> with zero gas or registration cost.
              </p>
              <div className="guide-highlight">
                <span>Format:</span> <code>did:ethr:sepolia:&lt;address&gt;</code>
              </div>
              <p>
                <strong>Self-Sovereign:</strong> By default, each wallet is its own controller. You can delegate signing power or reassign the controller to a secure hardware enclave or backup key.
              </p>
            </div>
          </div>

          {/* Section 2 */}
          <div className="guide-card">
            <div className="guide-card-icon">📜</div>
            <div className="guide-card-content">
              <h3>2. Verifiable Credentials & Clearance Registry</h3>
              <p>
                <strong>What it is:</strong> On-chain credentials representing security clearance levels (e.g., Level 1 Confidential to Level 5 Top Secret), training certifications, or operational roles.
              </p>
              <div className="guide-highlight">
                <span>Validity Rule:</span> <code>isValid = exists && !revoked && (expiresAt == 0 || now &lt;= expiresAt)</code>
              </div>
              <p>
                <strong>Custody Gating:</strong> Nobody can touch or take custody of high-grade defense hardware unless their on-chain credential level is greater than or equal to the asset's immutable classification level.
              </p>
            </div>
          </div>

          {/* Section 3 */}
          <div className="guide-card">
            <div className="guide-card-icon">🔒</div>
            <div className="guide-card-content">
              <h3>3. Soulbound Asset NFTs (ERC-721 + ERC-5192)</h3>
              <p>
                <strong>Core Principle: Ownership ≠ Custody</strong>
              </p>
              <p>
                Defense assets (Radars, Sonars, Avionics) are minted permanently to the <strong>BEL Treasury</strong>. The ERC-721 token is permanently soulbound (locked via ERC-5192) and cannot be sold, transferred, or drained.
              </p>
              <p>
                Only the <code>custodian</code> attribute changes as the physical equipment moves from factory floor, to test bench, to aircraft installation.
              </p>
            </div>
          </div>

          {/* Section 4 */}
          <div className="guide-card">
            <div className="guide-card-icon">🔄</div>
            <div className="guide-card-content">
              <h3>4. Strict Lifecycle State Machine</h3>
              <div className="fsm-chain">
                <span className="fsm-step">0: Manufactured</span>
                <span className="fsm-arrow">➔</span>
                <span className="fsm-step">1: QualityCertified</span>
                <span className="fsm-arrow">➔</span>
                <span className="fsm-step">2: InService</span>
                <span className="fsm-arrow">➔</span>
                <span className="fsm-step">3: InMaintenance / 4: Suspended</span>
                <span className="fsm-arrow">➔</span>
                <span className="fsm-step terminal">5: Decommissioned</span>
              </div>
              <p>
                Assets cannot skip steps. A component cannot enter service without quality certification. Once decommissioned, it is in a terminal state forever.
              </p>
            </div>
          </div>

          {/* Section 5 */}
          <div className="guide-card">
            <div className="guide-card-icon">🏛️</div>
            <div className="guide-card-content">
              <h3>5. 2-of-3 MultiSig Board Governance</h3>
              <p>
                <strong>Zero Single Point of Failure:</strong> The initial deployer wallet is permanently renounced and locked out. High-impact operations require <strong>2 out of 3 board signers</strong> to confirm:
              </p>
              <ul className="guide-list">
                <li><strong>GrantRole / RevokeRole:</strong> Manage admin roles on all contracts.</li>
                <li><strong>ChangeCredentialIssuer:</strong> Authorize a new authority to issue security clearances.</li>
                <li><strong>EmergencyFreeze:</strong> Freeze a specific compromised asset to halt all custody handoffs instantly (scoped to 1 asset so the rest of the fleet stays operational).</li>
              </ul>
            </div>
          </div>

          {/* Section 6 */}
          <div className="guide-card">
            <div className="guide-card-icon">🛡️</div>
            <div className="guide-card-content">
              <h3>6. Time-Bound Role-Based Access Control (RBAC)</h3>
              <p>
                Roles (<code>ADMIN_ROLE</code>, <code>MANAGER_ROLE</code>, <code>AUDITOR_ROLE</code>, <code>USER_ROLE</code>) are granted with explicit unix timestamps. Once expired, permission is revoked automatically on-chain without requiring an active transaction.
              </p>
            </div>
          </div>

          {/* Deployed Contracts */}
          <div className="guide-contracts">
            <h4>Live Deployed Sepolia Contracts</h4>
            <div className="contracts-grid">
              <div><span>EthereumDIDRegistry:</span> <code>{ADDRESSES.DIDRegistry}</code></div>
              <div><span>CredentialRegistry:</span> <code>{ADDRESSES.CredentialRegistry}</code></div>
              <div><span>AssetNFT:</span> <code>{ADDRESSES.AssetNFT}</code></div>
              <div><span>TimeBoundAccessControl:</span> <code>{ADDRESSES.AccessControl}</code></div>
              <div><span>MultiSigAdmin (2-of-3):</span> <code>{ADDRESSES.MultiSig}</code></div>
            </div>
          </div>
        </div>

        <div className="guide-modal-footer">
          <button className="btn btn-primary" onClick={onClose}>Got It — Let's Explore</button>
        </div>
      </div>
    </div>
  );
};
