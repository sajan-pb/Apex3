import React, { useState, useEffect, useCallback } from 'react';
import { getExplorerTxUrl } from '../config';

interface AuditEvent {
  id: number;
  block_number: number;
  tx_hash: string;
  contract_name: string;
  event_name: string;
  args_json: string;
  timestamp: number | null;
}

export const AuditPanel: React.FC = () => {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [filterContract, setFilterContract] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true);
      setApiError(null);
      const res = await fetch('/api/events?limit=100');
      if (!res.ok) {
        throw new Error(`API responded with status ${res.status}`);
      }
      const data = await res.json();
      setEvents(data.events || []);
    } catch (err: any) {
      setApiError(err.message || 'Indexer API not running');
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const getEventBadgeClass = (name: string) => {
    if (name.includes('Issued') || name.includes('Granted')) return 'issue';
    if (name.includes('Revoked')) return 'revoke';
    if (name.includes('Minted') || name.includes('Locked')) return 'mint';
    if (name.includes('Custody')) return 'custody';
    if (name.includes('Status') || name.includes('Frozen')) return 'status';
    if (name.includes('Proposal') || name.includes('Executed')) return 'governance';
    return 'info';
  };

  const filteredEvents = events.filter((evt) => {
    if (filterContract !== 'ALL' && evt.contract_name !== filterContract) {
      return false;
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const inName = evt.event_name.toLowerCase().includes(q);
      const inContract = evt.contract_name.toLowerCase().includes(q);
      const inArgs = evt.args_json.toLowerCase().includes(q);
      const inTx = evt.tx_hash.toLowerCase().includes(q);
      return inName || inContract || inArgs || inTx;
    }
    return true;
  });

  return (
    <div className="panel-container">
      {/* Overview Card */}
      <div className="info-banner">
        <div className="info-banner-icon">📋</div>
        <div>
          <h4>Immutable Audit Trail & Disposable SQLite Indexer</h4>
          <p>
            All critical lifecycle actions emit on-chain Ethereum events. An event indexer caches them in local SQLite for fast compliance reporting.
            Per brief specs, the database is fully disposable — if deleted, <code>--rebuild</code> reproduces the exact dataset from blockchain history.
          </p>
        </div>
      </div>

      <div className="section">
        <div className="section-title-row">
          <h3><span className="icon">📊</span> On-Chain Event Log</h3>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-secondary btn-sm" onClick={fetchEvents} disabled={loading}>
              {loading ? 'Refreshing…' : '🔄 Refresh Log'}
            </button>
          </div>
        </div>

        {/* Filter controls */}
        <div className="filter-bar">
          <div className="filter-group">
            <label>Filter by Contract:</label>
            <select
              value={filterContract}
              onChange={(e) => setFilterContract(e.target.value)}
            >
              <option value="ALL">All Contracts</option>
              <option value="AssetNFT">AssetNFT</option>
              <option value="CredentialRegistry">CredentialRegistry</option>
              <option value="EthereumDIDRegistry">EthereumDIDRegistry</option>
              <option value="MultiSigAdmin">MultiSigAdmin</option>
              <option value="TimeBoundAccessControl">TimeBoundAccessControl</option>
            </select>
          </div>
          <div className="filter-group" style={{ flex: 1 }}>
            <label>Search Parameters or Tx:</label>
            <input
              type="text"
              placeholder="Search token ID, address, tx hash..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {apiError && (
          <div className="result info" style={{ marginBottom: 20 }}>
            <strong>Dashboard API status:</strong> {apiError}
            <br />
            To start the background indexer and dashboard API locally:
            <pre style={{ marginTop: 8, padding: 8, background: 'rgba(0,0,0,0.3)', borderRadius: 4 }}>
              npm run indexer{'\n'}npm run dashboard
            </pre>
          </div>
        )}

        {filteredEvents.length > 0 ? (
          <div className="table-responsive">
            <table className="audit-table">
              <thead>
                <tr>
                  <th>Block</th>
                  <th>Contract</th>
                  <th>Event</th>
                  <th>Transaction</th>
                  <th>Payload / Decoded Arguments</th>
                </tr>
              </thead>
              <tbody>
                {filteredEvents.map((evt) => (
                  <tr key={evt.id}>
                    <td>
                      <span className="block-num mono">#{evt.block_number}</span>
                    </td>
                    <td>
                      <span className="contract-name">{evt.contract_name}</span>
                    </td>
                    <td>
                      <span className={`event-badge ${getEventBadgeClass(evt.event_name)}`}>
                        {evt.event_name}
                      </span>
                    </td>
                    <td>
                      <a
                        href={getExplorerTxUrl(evt.tx_hash)}
                        target="_blank"
                        rel="noreferrer"
                        className="tx-link mono"
                        title={evt.tx_hash}
                      >
                        {evt.tx_hash.slice(0, 8)}…{evt.tx_hash.slice(-6)} ↗
                      </a>
                    </td>
                    <td className="event-args-cell">
                      <pre className="args-preview" title={evt.args_json}>
                        {evt.args_json}
                      </pre>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          !apiError && (
            <div className="empty-state">
              <span>No events matching the current filter.</span>
            </div>
          )
        )}
      </div>
    </div>
  );
};
