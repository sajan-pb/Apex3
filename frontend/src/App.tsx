import { useState, useCallback, useEffect } from 'react';
import { BrowserProvider, ethers } from 'ethers';
import { Header } from './components/Header';
import { ExplanationGuide } from './components/ExplanationGuide';
import { IdentityPanel } from './components/IdentityPanel';
import { CredentialPanel } from './components/CredentialPanel';
import { AssetPanel } from './components/AssetPanel';
import { GovernancePanel } from './components/GovernancePanel';
import { RbacPanel } from './components/RbacPanel';
import { AuditPanel } from './components/AuditPanel';
import {
  SEPOLIA_CHAIN_ID,
  SEPOLIA_CHAIN_ID_HEX,
  SEPOLIA_NETWORK_PARAMS,
  getExplorerTxUrl,
} from './config';

type Tab = 'identity' | 'credentials' | 'assets' | 'governance' | 'rbac' | 'audit';

interface ResultState {
  type: 'success' | 'error' | 'info';
  message: string;
  txHash?: string;
}

function App() {
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('identity');
  const [result, setResult] = useState<ResultState | null>(null);
  const [isGuideOpen, setIsGuideOpen] = useState(false);

  // ── Helper: Provider & Signer ──
  const getProvider = useCallback(() => {
    if (!window.ethereum) throw new Error('MetaMask or Web3 wallet not detected.');
    return new BrowserProvider(window.ethereum as any);
  }, []);

  const getSigner = useCallback(async () => {
    const provider = getProvider();
    return provider.getSigner();
  }, [getProvider]);

  // ── Fetch ETH Balance ──
  const fetchBalance = useCallback(async (addr: string) => {
    try {
      if (!window.ethereum) return;
      const provider = new BrowserProvider(window.ethereum as any);
      const bal = await provider.getBalance(addr);
      setBalance(ethers.formatEther(bal));
    } catch {
      setBalance(null);
    }
  }, []);

  // ── Wallet Connection ──
  const connectWallet = useCallback(async () => {
    if (!window.ethereum) {
      setResult({
        type: 'error',
        message: 'MetaMask not detected. Please install the MetaMask extension to use BEL Trust Chain.',
      });
      return;
    }
    try {
      sessionStorage.removeItem('bel_wallet_disconnected');

      let accounts: string[] = [];
      try {
        // Prompt MetaMask account selector modal so user can pick/switch accounts
        const permissions = (await window.ethereum.request({
          method: 'wallet_requestPermissions',
          params: [{ eth_accounts: {} }],
        })) as any[];
        const accountsPermission = permissions.find((p: any) => p.parentCapability === 'eth_accounts');
        if (accountsPermission) {
          accounts = (await window.ethereum.request({ method: 'eth_accounts' })) as string[];
        }
      } catch {
        // Fallback to standard eth_requestAccounts if user cancels permissions prompt or provider doesn't support it
        accounts = (await window.ethereum.request({
          method: 'eth_requestAccounts',
        })) as string[];
      }

      if (accounts && accounts.length > 0) {
        const primary = accounts[0];
        setAccount(primary);
        const cid = (await window.ethereum.request({ method: 'eth_chainId' })) as string;
        const parsedChainId = parseInt(cid, 16);
        setChainId(parsedChainId);
        fetchBalance(primary);

        if (parsedChainId !== SEPOLIA_CHAIN_ID) {
          setResult({
            type: 'info',
            message: `Connected to Chain ID ${parsedChainId}. Please switch to Sepolia Testnet (11155111) for full contract interaction.`,
          });
        } else {
          setResult({
            type: 'success',
            message: `Connected: ${primary.slice(0, 6)}…${primary.slice(-4)} on Sepolia Testnet.`,
          });
        }
      }
    } catch (err: any) {
      setResult({ type: 'error', message: err.message || 'Connection failed.' });
    }
  }, [fetchBalance]);

  // ── Wallet Disconnection (Solves Issue #1) ──
  const disconnectWallet = useCallback(() => {
    sessionStorage.setItem('bel_wallet_disconnected', 'true');
    setAccount(null);
    setChainId(null);
    setBalance(null);
    setResult({
      type: 'info',
      message: 'Wallet disconnected. Click "Connect Wallet" to select and reconnect an account.',
    });
  }, []);

  // ── Switch Network to Sepolia ──
  const switchNetwork = useCallback(async () => {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: SEPOLIA_CHAIN_ID_HEX }],
      });
      setResult({
        type: 'success',
        message: 'Switched network to Ethereum Sepolia Testnet.',
      });
    } catch (switchError: any) {
      // Code 4902 means the chain has not been added to MetaMask
      if (switchError.code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [SEPOLIA_NETWORK_PARAMS],
          });
        } catch (addError: any) {
          setResult({ type: 'error', message: `Could not add Sepolia network: ${addError.message}` });
        }
      } else {
        setResult({ type: 'error', message: `Failed to switch network: ${switchError.message}` });
      }
    }
  }, []);

  // ── Auto-detect account and chain changes ──
  useEffect(() => {
    if (window.ethereum) {
      const handleAccounts = (accs: unknown) => {
        const accounts = accs as string[];
        if (accounts && accounts.length > 0) {
          sessionStorage.removeItem('bel_wallet_disconnected');
          setAccount(accounts[0]);
          fetchBalance(accounts[0]);
          setResult({
            type: 'info',
            message: `Active account switched to ${accounts[0].slice(0, 6)}…${accounts[0].slice(-4)}`,
          });
        } else {
          setAccount(null);
          setChainId(null);
          setBalance(null);
        }
      };

      const handleChain = (cid: unknown) => {
        const parsed = parseInt(cid as string, 16);
        setChainId(parsed);
      };

      window.ethereum.on('accountsChanged', handleAccounts);
      window.ethereum.on('chainChanged', handleChain);

      // Check if already authorized, only if user has not explicitly clicked disconnect
      if (sessionStorage.getItem('bel_wallet_disconnected') !== 'true') {
        window.ethereum
          .request({ method: 'eth_accounts' })
          .then((accs: any) => {
            if (accs && accs.length > 0) {
              setAccount(accs[0]);
              window.ethereum!
                .request({ method: 'eth_chainId' })
                .then((c: any) => setChainId(parseInt(c, 16)));
              fetchBalance(accs[0]);
            }
          })
          .catch(() => {});
      }

      return () => {
        window.ethereum?.removeListener('accountsChanged', handleAccounts);
        window.ethereum?.removeListener('chainChanged', handleChain);
      };
    }
  }, [fetchBalance]);

  return (
    <div className="app">
      {/* Header with Disconnect & Network Status */}
      <Header
        account={account}
        chainId={chainId}
        balance={balance}
        onConnect={connectWallet}
        onDisconnect={disconnectWallet}
        onSwitchNetwork={switchNetwork}
        onToggleGuide={() => setIsGuideOpen(!isGuideOpen)}
        isGuideOpen={isGuideOpen}
      />

      {/* Architecture Explainer Modal */}
      {isGuideOpen && <ExplanationGuide onClose={() => setIsGuideOpen(false)} />}

      <main className="main">
        {/* Wrong Network Warning Banner */}
        {account && chainId !== null && chainId !== SEPOLIA_CHAIN_ID && (
          <div className="network-warning-banner">
            <div className="warning-text">
              <span className="warning-icon">⚠️</span>
              <div>
                <strong>Unsupported Network (Chain ID: {chainId})</strong>
                <p>
                  BEL Trust Chain contracts are deployed on <strong>Sepolia Testnet (11155111)</strong>. Transactions will fail on other chains.
                </p>
              </div>
            </div>
            <button className="btn btn-warning btn-sm" onClick={switchNetwork}>
              Switch to Sepolia Testnet
            </button>
          </div>
        )}

        {!account ? (
          <div className="not-connected-hero">
            <div className="hero-shield">🛡️</div>
            <h2>BEL Trust Chain Portal</h2>
            <p className="hero-tagline">
              Decentralized Identity, Verifiable Credentials &amp; Soulbound Custody for Defense Electronics (SIH26125)
            </p>
            <p className="hero-description">
              Connect your Web3 wallet to manage self-sovereign <code>did:ethr</code> identities, verify security clearances,
              track defense hardware lifecycle states, and participate in 2-of-3 MultiSig board governance.
            </p>
            <div className="hero-cta-group">
              <button className="btn btn-primary btn-lg" onClick={connectWallet}>
                ⚡ Connect MetaMask
              </button>
              <button className="btn btn-secondary btn-lg" onClick={() => setIsGuideOpen(true)}>
                📖 Read Architecture Guide
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Navigation Tabs */}
            <div className="tabs">
              {(
                [
                  ['identity', '🪪 Identity (DID)'],
                  ['credentials', '📜 Credentials (VC)'],
                  ['assets', '🔒 Soulbound Assets'],
                  ['governance', '🏛️ Governance (MultiSig)'],
                  ['rbac', '⏱️ Time-Bound RBAC'],
                  ['audit', '📋 Audit Trail'],
                ] as [Tab, string][]
              ).map(([key, label]) => (
                <button
                  key={key}
                  className={`tab ${tab === key ? 'active' : ''}`}
                  onClick={() => {
                    setTab(key);
                    setResult(null);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Notification / Result Toast */}
            {result && (
              <div className={`result ${result.type}`}>
                <div className="result-header">
                  <span>
                    {result.type === 'success'
                      ? '✔ Success'
                      : result.type === 'error'
                      ? '✘ Error / Reverted'
                      : 'ℹ Status Update'}
                  </span>
                  <button className="result-close" onClick={() => setResult(null)}>
                    ✕
                  </button>
                </div>
                <div className="result-content">{result.message}</div>
                {result.txHash && (
                  <div className="result-tx-link">
                    <a
                      href={getExplorerTxUrl(result.txHash)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View on Sepolia Etherscan ↗
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* Tab Panels */}
            {tab === 'identity' && (
              <IdentityPanel
                account={account}
                getSigner={getSigner}
                getProvider={getProvider}
                setResult={setResult}
              />
            )}

            {tab === 'credentials' && (
              <CredentialPanel
                account={account}
                getSigner={getSigner}
                getProvider={getProvider}
                setResult={setResult}
              />
            )}

            {tab === 'assets' && (
              <AssetPanel
                account={account}
                getSigner={getSigner}
                getProvider={getProvider}
                setResult={setResult}
              />
            )}

            {tab === 'governance' && (
              <GovernancePanel
                account={account}
                getSigner={getSigner}
                getProvider={getProvider}
                setResult={setResult}
              />
            )}

            {tab === 'rbac' && (
              <RbacPanel
                account={account}
                getSigner={getSigner}
                getProvider={getProvider}
                setResult={setResult}
              />
            )}

            {tab === 'audit' && <AuditPanel />}
          </>
        )}
      </main>
    </div>
  );
}

export default App;
