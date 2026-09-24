import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { getAddress } from 'viem'
import { CONTRACT_ADDRESS, EXPLORER_URL } from './config'
import {
  AttemptSummary,
  PactState,
  TermState,
  connectWallet,
  leaderRollbackReason,
  normalizeError,
  passiveWallet,
  reciprocityLock,
} from './genlayer'
import { isContractId, pactIdFor, pyCollapse, pyLen, pyStrip } from './ids'

type Tab = 'pact' | 'terms'
type PendingAction = '' | 'create' | 'accept' | 'submit' | 'exercise'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

// Measured with the genlayer-js encoder: submit_term(pact_id, text) crosses the
// 255-byte RLP length-header boundary at 157 characters of term text.
const LONG_CALLDATA_CHARS = 150

// Safe accepted-state refresh. This never polls transaction receipts.
// It only re-reads authoritative accepted contract state through /api/rpc.
const AUTO_REFRESH_INTERVAL_MS = 15000
const AUTO_REFRESH_MAX_ATTEMPTS = 20

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

const short = (value: string, left = 7, right = 5) =>
  value ? `${value.slice(0, left)}…${value.slice(-right)}` : '—'

const sameAddress = (a?: string, b?: string) =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase()

function stateHint(state?: PactState['state']) {
  if (state === 'PENDING') return 'Party B must accept this pact before semantic terms can be submitted.'
  if (state === 'ACTIVE') return 'The declared right is mirrored and armed for either party.'
  if (state === 'EXITED') return 'The one-shot shared right has already been exercised.'
  return 'No mirrored term is active yet. The shared right remains locked.'
}

function verdictTone(verdict?: string) {
  if (verdict === 'RIGHT_MIRRORED') return 'good'
  if (verdict === 'RIGHT_NOT_MIRRORED') return 'bad'
  return 'neutral'
}

export default function App() {
  const [tab, setTab] = useState<Tab>('pact')
  const [account, setAccount] = useState('')
  const [walletBusy, setWalletBusy] = useState(false)

  const [pactId, setPactId] = useState('')
  const [pact, setPact] = useState<PactState | null>(null)
  const [attempts, setAttempts] = useState<AttemptSummary[]>([])
  const [terms, setTerms] = useState<Record<string, TermState>>({})
  const [loading, setLoading] = useState(false)
  const [pendingAction, setPendingAction] = useState<PendingAction>('')
  const [autoSyncing, setAutoSyncing] = useState(false)

  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [lastHash, setLastHash] = useState('')

  const [name, setName] = useState('Hosting pact')
  const [partyB, setPartyB] = useState('')
  const [roleA, setRoleA] = useState('Provider')
  const [roleB, setRoleB] = useState('Customer')
  const [rightLabel, setRightLabel] = useState('termination on thirty days written notice')
  const [termText, setTermText] = useState(
    'Either party may terminate on thirty days written notice. Neither party has any other right to terminate.',
  )

  const [openId, setOpenId] = useState('')

  const isCreator = sameAddress(account, pact?.creator)
  const isPartyB = sameAddress(account, pact?.party_b)
  const canAccept = !!pact && isPartyB && pact.state === 'PENDING'
  const canExercise = !!pact && (isCreator || isPartyB) && pact.state === 'ACTIVE'
  const canSubmit = !!pact && isCreator && pact.state === 'DRAFT' && pact.attempt_count < 5

  const latestAttempt = attempts.length ? attempts[attempts.length - 1] : undefined

  const recentIds = useMemo(() => {
    try {
      const raw = localStorage.getItem('pactmirror:recent')
      const list = raw ? JSON.parse(raw) : []
      return Array.isArray(list)
        ? list.filter((v) => typeof v === 'string' && isContractId(v)).slice(0, 6)
        : []
    } catch {
      return []
    }
  }, [pactId])

  const remember = (id: string) => {
    try {
      const raw = localStorage.getItem('pactmirror:recent')
      const current = raw ? JSON.parse(raw) : []
      const next = [id, ...(Array.isArray(current) ? current : [])]
        .filter((v, i, arr) => typeof v === 'string' && arr.indexOf(v) === i)
        .slice(0, 6)
      localStorage.setItem('pactmirror:recent', JSON.stringify(next))
    } catch {
      // Local history is optional and never authoritative.
    }
  }

  const clearMessages = () => {
    setError('')
    setNotice('')
  }

  const loadAttempts = useCallback(async (id: string, expectedPact?: PactState) => {
    const list = await reciprocityLock.getAttempts(id)
    setAttempts(list)

    const fetchable = list.filter((item) => item.term_id)
    const termPairs = await Promise.all(
      fetchable.map(async (item) => {
        try {
          const term = await reciprocityLock.getTerm(item.term_id)
          return [item.term_id, term] as const
        } catch {
          return [item.term_id, null] as const
        }
      }),
    )

    const nextTerms: Record<string, TermState> = {}
    for (const [idKey, value] of termPairs) {
      if (value) nextTerms[idKey] = value
    }
    setTerms(nextTerms)

    if (expectedPact && list.length !== expectedPact.attempt_count) {
      setNotice(
        'Pact state loaded, but the attempt log is still catching up at the accepted read level. Refresh again shortly.',
      )
    }
  }, [])

  const loadPact = useCallback(async (id = pactId) => {
    const clean = id.trim().toLowerCase()
    if (!isContractId(clean)) {
      setError('Enter a 64-character pact ID.')
      return
    }

    setLoading(true)
    clearMessages()

    try {
      const next = await reciprocityLock.getPact(clean)
      setPactId(clean)
      setPact(next)
      setOpenId(clean)
      remember(clean)
      await loadAttempts(clean, next)
      setNotice('Authoritative accepted state loaded from the Project contract.')
    } catch (err) {
      setPact(null)
      setAttempts([])
      setTerms({})
      setError(normalizeError(err))
    } finally {
      setLoading(false)
    }
  }, [pactId, loadAttempts])

  const autoRefreshAcceptedState = useCallback(
    async (
      id: string,
      target:
        | { kind: 'create' }
        | { kind: 'accept' }
        | { kind: 'submit'; baselineAttemptCount: number }
        | { kind: 'exercise' },
      hash: string,
    ) => {
      const clean = id.trim().toLowerCase()
      setAutoSyncing(true)

      try {
        for (let i = 0; i < AUTO_REFRESH_MAX_ATTEMPTS; i += 1) {
          if (i > 0) {
            await sleep(AUTO_REFRESH_INTERVAL_MS)
          }

          try {
            const next = await reciprocityLock.getPact(clean)

            const reachedTarget =
              target.kind === 'create'
                ? true
                : target.kind === 'accept'
                  ? next.accepted
                : target.kind === 'submit'
                  ? next.attempt_count > target.baselineAttemptCount
                  : next.state === 'EXITED'

            if (!reachedTarget) {
              continue
            }

            setPactId(clean)
            setPact(next)
            setOpenId(clean)
            remember(clean)
            await loadAttempts(clean, next)

            setNotice(
              target.kind === 'create'
                ? 'Accepted state updated automatically: pact created and awaiting Party B.'
                : target.kind === 'accept'
                  ? 'Accepted state updated automatically: Party B accepted the pact.'
                : target.kind === 'submit'
                  ? 'Accepted state updated automatically: semantic result loaded.'
                  : 'Accepted state updated automatically: pact exited.',
            )
            setError('')
            return
          } catch {
            // During consensus the accepted state may still be unavailable or
            // unchanged. That is not a transaction failure, so keep waiting.
          }
        }

        const rollback = await leaderRollbackReason(hash)
        if (rollback) {
          setError(normalizeError(rollback))
          setNotice('')
        } else {
          setNotice(
            'Transaction is still submitted, but automatic accepted-state refresh timed out. Use Refresh state later. Do not resubmit an action that already returned a transaction hash.',
          )
        }
      } finally {
        setAutoSyncing(false)
      }
    },
    [loadAttempts],
  )

  const connect = async () => {
    setWalletBusy(true)
    clearMessages()
    try {
      const next = await connectWallet()
      setAccount(next)
      setNotice('Wallet connected to GenLayer StudioNet.')
    } catch (err) {
      setError(normalizeError(err))
    } finally {
      setWalletBusy(false)
    }
  }

  useEffect(() => {
    passiveWallet()
      .then((value) => setAccount(value))
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    const ethereum = window.ethereum
    if (!ethereum?.on) return

    const onAccounts = (accounts: string[]) => {
      try {
        setAccount(accounts?.[0] ? getAddress(accounts[0]) : '')
      } catch {
        setAccount('')
      }
      setNotice('Wallet account changed. Reload pact state before writing.')
    }

    const onChain = () => {
      setNotice('Wallet network changed. Reconnect before writing.')
    }

    ethereum.on('accountsChanged', onAccounts)
    ethereum.on('chainChanged', onChain)

    return () => {
      ethereum.removeListener?.('accountsChanged', onAccounts)
      ethereum.removeListener?.('chainChanged', onChain)
    }
  }, [])

  const createPact = async (event: FormEvent) => {
    event.preventDefault()
    clearMessages()

    if (!account) {
      setError('Connect the creator wallet first.')
      return
    }

    let normalizedPartyB = ''
    try {
      normalizedPartyB = getAddress(partyB.trim())
    } catch {
      setError('Party B must be a valid wallet address.')
      return
    }

    if (sameAddress(account, normalizedPartyB)) {
      setError('Party B must differ from the creator wallet.')
      return
    }

    if (normalizedPartyB.toLowerCase() === ZERO_ADDRESS.toLowerCase()) {
      setError('Party B cannot be the zero address.')
      return
    }

    if (roleA.trim().toLowerCase() === roleB.trim().toLowerCase()) {
      setError('Role A and Role B labels must differ.')
      return
    }

    // pyStrip, not trim: the contract hashes name.strip(). Using trim() here
    // makes create_pact succeed on chain while the UI looks up an id that does
    // not exist, with no way to recover it from the interface.
    const cleanName = pyStrip(name)
    if (!cleanName || !roleA.trim() || !roleB.trim() || !rightLabel.trim()) {
      setError('Complete every pact field.')
      return
    }

    const computedId = pactIdFor(account, cleanName)
    setPendingAction('create')

    try {
      const hash = await reciprocityLock.createPact(
        account,
        cleanName,
        normalizedPartyB,
        roleA,
        roleB,
        rightLabel,
      )

      setLastHash(hash)
      setPactId(computedId)
      setOpenId(computedId)
      remember(computedId)
      setNotice(
        `Transaction submitted: ${short(hash, 10, 8)}. Pact ID is computed locally. Waiting for accepted state automatically; do not submit create_pact again.`,
      )
      void autoRefreshAcceptedState(computedId, { kind: 'create' }, hash)
    } catch (err) {
      setError(normalizeError(err))
    } finally {
      setPendingAction('')
    }
  }

  const acceptPact = async () => {
    clearMessages()

    if (!account || !pact || !canAccept) {
      setError('Connect the declared Party B wallet to accept this pact.')
      return
    }

    setPendingAction('accept')
    try {
      const hash = await reciprocityLock.acceptPact(account, pact.pact_id)
      setLastHash(hash)
      setNotice(
        `Acceptance submitted: ${short(hash, 10, 8)}. Waiting for accepted DRAFT state automatically.`,
      )
      void autoRefreshAcceptedState(pact.pact_id, { kind: 'accept' }, hash)
    } catch (err) {
      setError(normalizeError(err))
    } finally {
      setPendingAction('')
    }
  }

  const submitTerm = async (event: FormEvent) => {
    event.preventDefault()
    clearMessages()

    if (!account || !pact) {
      setError('Load a pact and connect its creator wallet.')
      return
    }

    if (!isCreator) {
      setError('Only Party A / creator can submit terms.')
      return
    }

    if (!canSubmit) {
      setError('This pact is not accepting more terms.')
      return
    }

    const clean = pyCollapse(termText)
    if (!clean || pyLen(clean) > 1200) {
      setError('Term must contain 1–1200 characters.')
      return
    }

    setPendingAction('submit')
    try {
      const hash = await reciprocityLock.submitTerm(account, pact.pact_id, clean)
      setLastHash(hash)
      setNotice(
        `Term submitted: ${short(hash, 10, 8)}. Waiting for the accepted semantic result automatically. The frontend does not invent a verdict.`,
      )
      void autoRefreshAcceptedState(pact.pact_id, {
        kind: 'submit',
        baselineAttemptCount: pact.attempt_count,
      }, hash)
    } catch (err) {
      setError(normalizeError(err))
    } finally {
      setPendingAction('')
    }
  }

  const exercise = async () => {
    clearMessages()

    if (!account || !pact) {
      setError('Connect a declared party wallet and load the pact.')
      return
    }

    if (!isCreator && !isPartyB) {
      setError('Only Party A or Party B may exercise the shared right.')
      return
    }

    if (pact.state !== 'ACTIVE') {
      setError('No mirrored term is active.')
      return
    }

    setPendingAction('exercise')
    try {
      const hash = await reciprocityLock.exerciseRight(account, pact.pact_id)
      setLastHash(hash)
      setNotice(
        `Exercise submitted: ${short(hash, 10, 8)}. Waiting for accepted EXITED state automatically. The UI will only show EXITED after the contract reports it.`,
      )
      void autoRefreshAcceptedState(pact.pact_id, { kind: 'exercise' }, hash)
    } catch (err) {
      setError(normalizeError(err))
    } finally {
      setPendingAction('')
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <img src="/pactmirror-logo.svg" className="brand-logo" alt="PactMirror logo" />
          <div>
            <strong>PactMirror</strong>
            <span>Reciprocal rights, verified by consensus</span>
          </div>
        </div>

        <nav className="tabs" aria-label="Main navigation">
          <button className={tab === 'pact' ? 'active' : ''} onClick={() => setTab('pact')}>
            Pact
          </button>
          <button className={tab === 'terms' ? 'active' : ''} onClick={() => setTab('terms')}>
            Terms
          </button>
        </nav>

        <div className="top-actions">
          <a className="contract-pill" href={EXPLORER_URL} target="_blank" rel="noreferrer">
            <span className="dot" />
            {short(CONTRACT_ADDRESS, 8, 6)}
          </a>
          <button className="wallet-button" disabled={walletBusy} onClick={connect}>
            {account ? short(account, 8, 6) : walletBusy ? 'Connecting…' : 'Connect wallet'}
          </button>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow">ONE RIGHT · TWO ROLES · ONE SHARED EXIT</div>
            <h1>
              Mutual on paper is not
              <span> mutual in effect.</span>
            </h1>
            <p>
              PactMirror activates a declared bilateral right only when GenLayer validators find
              that the text gives both roles that right under the same conditions.
            </p>
            <div className="hero-chips">
              <span>RIGHT_MIRRORED</span>
              <span>RIGHT_NOT_MIRRORED</span>
              <span>No global admin</span>
            </div>
          </div>

          <div className={`mirror-visual ${pact?.state?.toLowerCase() || 'draft'}`}>
            <div className="role-orb left">
              <small>ROLE A</small>
              <strong>{pact?.role_a_label || 'Provider'}</strong>
              <span>{pact ? short(pact.party_a) : 'creator'}</span>
            </div>
            <div className="mirror-axis">
              <div className="axis-line" />
              <div className="axis-icon">⇄</div>
              <b>{pact?.state || 'DRAFT'}</b>
            </div>
            <div className="role-orb right">
              <small>ROLE B</small>
              <strong>{pact?.role_b_label || 'Customer'}</strong>
              <span>{pact ? short(pact.party_b) : 'counterparty'}</span>
            </div>
            <p>{pact ? stateHint(pact.state) : 'Load or create a pact to see the mirrored-right state.'}</p>
          </div>
        </section>

        {notice && <div className="notice good-notice">{notice}</div>}
        {error && <div className="notice error-notice">{error}</div>}
        {lastHash && (
          <div className="tx-strip">
            <span>Latest submitted hash</span>
            <code>{lastHash}</code>
          </div>
        )}

        {tab === 'pact' ? (
          <section className="workspace-grid">
            <aside className="side-panel">
              <div className="panel-heading">
                <div>
                  <span className="section-index">01</span>
                  <h2>Open a pact</h2>
                </div>
                <span className="subtle">accepted state</span>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  loadPact(openId)
                }}
              >
                <label>
                  Pact ID
                  <input
                    value={openId}
                    onChange={(e) => setOpenId(e.target.value)}
                    placeholder="64 hex characters"
                    spellCheck={false}
                  />
                </label>
                <button className="secondary full" type="submit" disabled={loading}>
                  {loading ? 'Loading…' : 'Load pact'}
                </button>
              </form>

              {!!recentIds.length && (
                <div className="recent">
                  <span>Recent on this browser</span>
                  {recentIds.map((id) => (
                    <button key={id} onClick={() => { setOpenId(id); loadPact(id) }}>
                      {short(id, 9, 7)}
                    </button>
                  ))}
                </div>
              )}

              <div className="divider" />

              <div className="panel-heading">
                <div>
                  <span className="section-index">02</span>
                  <h2>Create pact</h2>
                </div>
                <span className="subtle">Party A only</span>
              </div>

              <form onSubmit={createPact} className="stack-form">
                <label>
                  Pact name
                  <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
                </label>
                <label>
                  Party B wallet
                  <input
                    value={partyB}
                    onChange={(e) => setPartyB(e.target.value)}
                    placeholder="0x…"
                    spellCheck={false}
                  />
                </label>
                <div className="two-fields">
                  <label>
                    Role A
                    <input value={roleA} maxLength={60} onChange={(e) => setRoleA(e.target.value)} />
                  </label>
                  <label>
                    Role B
                    <input value={roleB} maxLength={60} onChange={(e) => setRoleB(e.target.value)} />
                  </label>
                </div>
                <label>
                  Declared right
                  <input
                    value={rightLabel}
                    maxLength={100}
                    onChange={(e) => setRightLabel(e.target.value)}
                  />
                </label>
                <button
                  className="primary full"
                  disabled={!account || !!pendingAction || autoSyncing}
                  type="submit"
                >
                  {pendingAction === 'create' ? 'Submitting…' : autoSyncing ? 'Waiting for accepted state…' : 'Create pact'}
                </button>
                <p className="microcopy">
                  The pact ID is computed locally from creator + pact name. A submitted transaction is
                  not shown as accepted until Refresh state succeeds.
                </p>
              </form>
            </aside>

            <section className="main-panel">
              <div className="panel-heading">
                <div>
                  <span className="section-index">03</span>
                  <h2>Pact state</h2>
                </div>
                <button
                  className="secondary compact"
                  onClick={() => pactId && loadPact(pactId)}
                  disabled={!pactId || loading}
                >
                  {loading ? 'Refreshing…' : 'Refresh state'}
                </button>
              </div>

              {!pact ? (
                <div className="empty-state">
                  <img src="/pactmirror-logo.svg" alt="" />
                  <h3>No pact loaded</h3>
                  <p>Create your own pact or paste a Pact ID. The frontend has no global list and does not invent one.</p>
                </div>
              ) : (
                <>
                  <div className="pact-header-card">
                    <div>
                      <span className={`state-badge ${pact.state.toLowerCase()}`}>{pact.state}</span>
                      <h3>{pact.name}</h3>
                      <code>{pact.pact_id}</code>
                    </div>
                    <div className="stat-cluster">
                      <div><span>Attempts</span><b>{pact.attempt_count}/5</b></div>
                      <div><span>Active term</span><b>{pact.active_term_id ? short(pact.active_term_id, 8, 6) : '—'}</b></div>
                    </div>
                  </div>

                  <div className="right-card">
                    <span>DECLARED BILATERAL RIGHT</span>
                    <strong>{pact.right_label}</strong>
                  </div>

                  <div className={`roles-card ${pact.state.toLowerCase()}`}>
                    <article>
                      <span>PARTY A · {pact.role_a_label}</span>
                      <strong>{short(pact.party_a, 12, 10)}</strong>
                      <small>{sameAddress(account, pact.party_a) ? 'Connected wallet' : 'Creator'}</small>
                    </article>
                    <div className="bridge">
                      <span>⇄</span>
                      <b>{pact.state === 'PENDING' ? 'AWAITING B' : pact.state === 'DRAFT' ? 'LOCKED' : pact.state === 'ACTIVE' ? 'MIRRORED' : 'EXERCISED'}</b>
                    </div>
                    <article>
                      <span>PARTY B · {pact.role_b_label}</span>
                      <strong>{short(pact.party_b, 12, 10)}</strong>
                      <small>{sameAddress(account, pact.party_b) ? 'Connected wallet' : 'Counterparty'}</small>
                    </article>
                  </div>

                  {pact.state === 'PENDING' && (
                    <div className="acceptance-card">
                      <div>
                        <span>PARTY B CONSENT</span>
                        <strong>{isPartyB ? 'This wallet can accept' : 'Awaiting the declared Party B wallet'}</strong>
                      </div>
                      <button
                        className="secondary"
                        disabled={!canAccept || !!pendingAction || autoSyncing}
                        onClick={acceptPact}
                      >
                        {pendingAction === 'accept' ? 'Submitting…' : autoSyncing ? 'Waiting for accepted state…' : 'Accept pact'}
                      </button>
                    </div>
                  )}

                  <div className="action-grid">
                    <form className="term-card" onSubmit={submitTerm}>
                      <div className="card-title">
                        <div>
                          <span className="section-index">04</span>
                          <h3>Submit a term</h3>
                        </div>
                        <span className="subtle">{pyLen(pyCollapse(termText))}/1200</span>
                      </div>
                      <textarea
                        value={termText}
                        maxLength={1200}
                        onChange={(e) => setTermText(e.target.value)}
                        disabled={!canSubmit || !!pendingAction || autoSyncing}
                      />
                      <button
                        className="primary full"
                        type="submit"
                        disabled={!canSubmit || !!pendingAction || autoSyncing}
                      >
                        {pendingAction === 'submit' ? 'Submitting…' : autoSyncing ? 'Waiting for accepted state…' : canSubmit ? 'Submit for GenLayer consensus' : 'Term submission locked'}
                      </button>
                      {pyLen(pyCollapse(termText)) > LONG_CALLDATA_CHARS && (
                        <p className="microcopy warn-microcopy">
                          Transport note: above ~{LONG_CALLDATA_CHARS} characters the serialized
                          payload passes 255 bytes, which has not yet been confirmed with a signed
                          write on this Project address. The contract still accepts 1200 characters —
                          this is a transport caution, not a semantic limit.
                        </p>
                      )}
                      <p className="microcopy">
                        Only the creator can submit. The model returns one of two verdicts; this UI never
                        calculates or predicts that verdict.
                      </p>
                    </form>

                    <div className="result-card">
                      <div className="card-title">
                        <div>
                          <span className="section-index">05</span>
                          <h3>Consensus result</h3>
                        </div>
                        <span className={`verdict-badge ${verdictTone(latestAttempt?.verdict)}`}>
                          {latestAttempt?.verdict || 'NO VERDICT YET'}
                        </span>
                      </div>

                      <div className="result-body">
                        <div className={`mirror-mini ${latestAttempt?.mirrored ? 'mirrored' : 'not-mirrored'}`}>
                          <span>{pact.role_a_label}</span>
                          <b>{latestAttempt ? (latestAttempt.mirrored ? '⇄' : '↛') : '···'}</b>
                          <span>{pact.role_b_label}</span>
                        </div>
                        <p>
                          {latestAttempt
                            ? latestAttempt.mirrored
                              ? 'The latest accepted term mirrors the declared right across both roles. The shared right is active.'
                              : 'The latest accepted term does not mirror the declared right. The shared right remains locked.'
                            : 'Submit a term, wait for consensus, then refresh authoritative state.'}
                        </p>
                      </div>

                      <div className="exercise-box">
                        <div>
                          <span>Shared one-shot right</span>
                          <strong>{pact.state === 'ACTIVE' ? 'READY' : pact.state === 'EXITED' ? 'USED' : 'LOCKED'}</strong>
                        </div>
                        <button
                          className="danger-action"
                          disabled={!canExercise || !!pendingAction || autoSyncing}
                          onClick={exercise}
                        >
                          {pendingAction === 'exercise' ? 'Submitting…' : autoSyncing ? 'Waiting for accepted state…' : pact.state === 'EXITED' ? 'Pact exited' : 'Exercise right'}
                        </button>
                      </div>

                      {pact.state === 'EXITED' && (
                        <div className="exited-note">
                          Exited by <code>{pact.exited_by}</code>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </section>
          </section>
        ) : (
          <section className="terms-layout">
            <div className="terms-head">
              <div>
                <span className="section-index">TERM LOG</span>
                <h2>Append-only semantic attempts</h2>
                <p>Exact replay is content-addressed onchain. At most five converged terms can be recorded per pact.</p>
              </div>
              <button
                className="secondary"
                onClick={() => pactId && loadPact(pactId)}
                disabled={!pactId || loading}
              >
                Refresh from contract
              </button>
            </div>

            {!pact ? (
              <div className="empty-state large">
                <h3>Load a pact first</h3>
                <p>Go to the Pact tab and open a 64-character pact ID.</p>
              </div>
            ) : !attempts.length ? (
              <div className="empty-state large">
                <h3>No accepted term attempts yet</h3>
                <p>The pact has no accepted term attempts yet.</p>
              </div>
            ) : (
              <div className="attempt-list">
                {attempts.map((attempt) => {
                  const term = terms[attempt.term_id]
                  return (
                    <article key={attempt.term_id} className={`attempt-card ${attempt.mirrored ? 'mirrored' : 'not-mirrored'}`}>
                      <div className="attempt-number">#{attempt.attempt_number}</div>
                      <div className="attempt-content">
                        <div className="attempt-top">
                          <span className={`verdict-badge ${attempt.mirrored ? 'good' : 'bad'}`}>
                            {attempt.verdict}
                          </span>
                          <code>{short(attempt.term_id, 12, 10)}</code>
                        </div>
                        <p>{term?.text || 'Term text not loaded yet. Refresh to retry this read.'}</p>
                      </div>
                      <div className="attempt-effect">
                        <span>{attempt.mirrored ? 'STATE EFFECT' : 'STATE EFFECT'}</span>
                        <strong>{attempt.mirrored ? 'ACTIVATES RIGHT' : 'REMAINS DRAFT'}</strong>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </section>
        )}

        <section className="proof-strip">
          <div>
            <span>PROJECT CONTRACT</span>
            <strong>{CONTRACT_ADDRESS}</strong>
          </div>
          <a href={EXPLORER_URL} target="_blank" rel="noreferrer">Open GenLayer Explorer ↗</a>
        </section>
      </main>

      <footer>
        <div className="built-on">
          <span className="genlayer-mark-wrap" aria-hidden="true">
            <img src="/genlayer-logo.png" alt="" />
          </span>
          <div className="genlayer-credit">
            <strong>Built on GenLayer</strong>
            <span>AI consensus · deterministic enforcement</span>
          </div>
        </div>
        <p>
          PactMirror does not assess fairness or legal enforceability. EXITED is contract state only.
        </p>
      </footer>
    </div>
  )
}
