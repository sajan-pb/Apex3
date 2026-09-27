import React, { useState } from 'react';
import { SEPOLIA_CHAIN_ID } from '../config';

interface HeaderProps {
  account: string | null;
  chainId: number | null;
  balance: string | null;
  onConnect: () => void;
  onDisconnect: () => void;
  onSwitchNetwork: () => void;
  onToggleGuide: () => void;
  isGuideOpen: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  account,
  chainId,
  balance,
  onConnect,
  onDisconnect,
  onSwitchNetwork,
  onToggleGuide,
  isGuideOpen,
}) => {
  const [copied, setCopied] = useState(false);

  const copyAddress = () => {
    if (!account) return;
    navigator.clipboard.writeText(account);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isSepolia = chainId === SEPOLIA_CHAIN_ID;

  return (
    <header className="header">
      <div className="header-logo">
        <div className="logo-icon">🛡️</div>
        <div>
          <h1>BEL Trust Chain</h1>
          <span className="subtitle">Bharat Electronics — Decentralized Asset Custody</span>
        </div>
        <span className="badge">SIH26125</span>
      </div>

      <div className="header-actions">
        <button
          className={`guide-toggle-btn ${isGuideOpen ? 'active' : ''}`}
          onClick={onToggleGuide}
          title="Explain all BEL Trust Chain concepts and architecture"
        >
          {isGuideOpen ? '✕ Close Guide' : '📖 Architecture Guide'}
        </button>

        {account ? (
          <div className="wallet-connected-group">
            {/* Network Indicator */}
            {isSepolia ? (
              <span className="network-pill sepolia" title="Connected to Sepolia Testnet">
                <span className="dot pulse"></span> Sepolia
              </span>
            ) : (
              <button
                className="network-pill wrong-network"
                onClick={onSwitchNetwork}
                title="Click to switch to Ethereum Sepolia"
              >
                <span className="dot warning"></span> Wrong Net (Chain {chainId || '?'}) — Switch to Sepolia
              </button>
            )}

            {/* Balance */}
            {balance !== null && (
              <span className="balance-pill" title="Sepolia ETH Balance">
                {parseFloat(balance).toFixed(4)} ETH
              </span>
            )}

            {/* Address Badge with Copy */}
            <button className="wallet-addr-badge" onClick={copyAddress} title="Click to copy full address">
              <span className="dot online"></span>
              <span>{account.slice(0, 6)}…{account.slice(-4)}</span>
              <span className="copy-icon">{copied ? '✓' : '📋'}</span>
            </button>

            {/* Disconnect Button */}
            <button
              className="wallet-disconnect-btn"
              onClick={onDisconnect}
              title="Disconnect wallet from application"
            >
              Disconnect
            </button>
          </div>
        ) : (
          <button className="wallet-btn" onClick={onConnect}>
            <span>⚡</span> Connect Wallet
          </button>
        )}
      </div>
    </header>
  );
};
