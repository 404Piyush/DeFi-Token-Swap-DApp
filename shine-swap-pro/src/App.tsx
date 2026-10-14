// ============================================================================
// SHINE SWAP — premium dark DeFi terminal
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import { web3Service } from "./services/web3Service";
import { CONTRACTS } from "./types/contracts";
import type { Transaction } from "./types/transactions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowDownUp, CheckCircle, Copy, Droplets, ExternalLink,
  History, LayoutDashboard, Loader2, LogOut, RefreshCw, ShieldCheck,
  TrendingUp, Wallet, X, XCircle, Zap,
} from "lucide-react";
import { Toaster, toast } from "sonner";

// ---------------------------------------------------------------- helpers

const num = (v: string | undefined) => {
  const n = parseFloat(v ?? "");
  return isNaN(n) ? 0 : n;
};

const fmt = (v: string | undefined, digits = 4) => {
  const n = num(v);
  if (n === 0) return "0.00";
  if (n < 0.0001) return n.toPrecision(2);
  if (n < 1) return n.toFixed(6);
  if (n < 1000) return n.toFixed(digits > 4 ? 4 : digits);
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
};

const fmtPrice = (v: string) => {
  const n = num(v);
  if (n === 0) return "—";
  if (n < 0.000001) return n.toExponential(2);
  return n.toPrecision(4);
};

const timeAgo = (ts: number) => {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

const ethScanTx = (h: string) => `https://sepolia.etherscan.io/tx/${h}`;
const ethScanAddr = (a: string) => `https://sepolia.etherscan.io/address/${a}`;

type View = "trade" | "portfolio" | "history";
type SwapStage = "idle" | "review" | "pending" | "done";

const SLIPPAGES = [50, 100, 200];

// ---------------------------------------------------------------- app

export default function App() {
  const [view, setView] = useState<View>("trade");
  const [account, setAccount] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [balances, setBalances] = useState({ eth: "0", shine: "0" });

  const [isEthToShine, setIsEthToShine] = useState(true);
  const [fromAmount, setFromAmount] = useState("");
  const [toAmount, setToAmount] = useState("");
  const [rate, setRate] = useState("0");
  const [impact, setImpact] = useState("0");
  const [slippage, setSlippage] = useState(100);

  const [stage, setStage] = useState<SwapStage>("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);

  const [pool, setPool] = useState<{
    ethReserve: string; shineReserve: string; shinePriceEth: string; ethPriceShine: string;
  } | null>(null);

  const [txs, setTxs] = useState<Transaction[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<"all" | "eth" | "shine">("all");

  // ------------------------------------------------------------ data

  const refreshPool = useCallback(async () => {
    try {
      setPool(await web3Service.getPoolStats());
    } catch {
      /* public RPC hiccup — keep old stats */
    }
  }, []);

  const refreshBalances = useCallback(async (addr: string | null) => {
    if (!addr) return;
    try {
      setBalances(await web3Service.getBalances(addr));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    refreshPool();
    const t = setInterval(refreshPool, 30_000);
    web3Service.reconnectWallet().then(({ account: a }) => {
      if (a) {
        setAccount(a);
        refreshBalances(a);
      }
    });
    return () => clearInterval(t);
  }, [refreshPool, refreshBalances]);

  // quote output (debounced)
  useEffect(() => {
    if (!fromAmount || num(fromAmount) <= 0) {
      setToAmount("");
      setRate("0");
      setImpact("0");
      return;
    }
    const t = setTimeout(async () => {
      const { output, priceImpact, exchangeRate } =
        await web3Service.calculatePriceImpact(fromAmount, isEthToShine);
      setToAmount(output === "0" ? "" : output);
      setPriceData(priceImpact, exchangeRate);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromAmount, isEthToShine]);

  const setPriceData = (priceImpact: string, exchangeRate: string) => {
    setImpact(priceImpact);
    setRate(exchangeRate);
  };

  // ------------------------------------------------------------ wallet

  const connect = async () => {
    setConnecting(true);
    try {
      const { account: a } = await web3Service.connectWallet();
      setAccount(a);
      refreshBalances(a);
      refreshPool();
      toast.success("Wallet connected");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to connect wallet";
      toast.error(msg);
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = () => {
    setAccount(null);
    setBalances({ eth: "0", shine: "0" });
    setFromAmount("");
    toast.success("Wallet disconnected");
  };

  // ------------------------------------------------------------ swap

  const fromToken = isEthToShine
    ? { sym: "ETH", logo: "/eth-logo.svg", bal: balances.eth }
    : { sym: "SHINE", logo: "/lebron.png", bal: balances.shine };
  const toToken = isEthToShine
    ? { sym: "SHINE", logo: "/lebron.png", bal: balances.shine }
    : { sym: "ETH", logo: "/eth-logo.svg", bal: balances.eth };

  const flip = () => {
    setIsEthToShine(!isEthToShine);
    setFromAmount(toAmount);
  };

  const useMax = () => {
    let m = isEthToShine ? balances.eth : balances.shine;
    if (isEthToShine && num(m) > 0.002) m = (num(m) - 0.002).toString();
    setFromAmount(m === "0" ? "" : m);
  };

  const openReview = () => {
    if (!account || !fromAmount || num(fromAmount) <= 0 || !toAmount) return;
    setTxHash(null);
    setTxError(null);
    setStage("review");
  };

  const confirmSwap = () => {
    if (!account) return;
    setStage("pending");
    toast.promise(
      web3Service.executeSwap(fromAmount, isEthToShine, account, slippage),
      {
        loading: "Submitting swap…",
        success: (hash: string) => {
          setTxHash(hash);
          setStage("done");
          setFromAmount("");
          setToAmount("");
          refreshBalances(account);
          refreshPool();
          return "Swap confirmed";
        },
        error: (err: unknown) => {
          setStage("review");
          if (web3Service.isUserRejectionError(err)) {
            setTxError("Transaction rejected in wallet.");
            return "Transaction rejected in wallet.";
          }
          const msg = err instanceof Error ? err.message : "Swap failed";
          const short = msg.includes("Slippage") ? "Slippage exceeded — try a higher tolerance." : msg.slice(0, 120);
          setTxError(short);
          return short;
        },
      }
    );
  };

  const loadHistory = async () => {
    if (!account) {
      toast.error("Connect your wallet to view history.");
      return;
    }
    setHistoryLoading(true);
    setView("history");
    try {
      setTxs(await web3Service.getSwapHistory(account));
    } catch {
      toast.error("Could not fetch on-chain history.");
    } finally {
      setHistoryLoading(false);
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Copy failed");
    }
  };

  const filteredTxs = txs.filter((t) => {
    if (historyFilter === "eth") return t.fromToken === "ETH";
    if (historyFilter === "shine") return t.fromToken === "SHINE";
    return true;
  });

  const impactColor =
    num(impact) > 5 ? "text-rose-400" : num(impact) > 2 ? "text-amber-400" : "text-emerald-400";

  // ---------------------------------------------------------------- render

  return (
    <div className="min-h-screen font-sans">
      <Toaster position="top-center" richColors theme="dark" />

      {/* ================= header ================= */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-ink-950/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="relative">
              <img src="/lebron.png" alt="SHINE" className="h-10 w-10 rounded-full ring-2 ring-gold-500/50" />
              <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-ink-950 bg-emerald-400" />
            </div>
            <div>
              <div className="font-display text-xl font-bold leading-none">
                SHINE<span className="gold-text">SWAP</span>
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-gold-400" />
                Sepolia Testnet
              </div>
            </div>
          </div>

          <nav className="hidden items-center gap-1 rounded-xl bg-white/5 p-1 sm:flex">
            {(
              [
                { id: "trade", label: "Trade", icon: ArrowDownUp },
                { id: "portfolio", label: "Portfolio", icon: LayoutDashboard },
                { id: "history", label: "History", icon: History },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                onClick={() => (t.id === "history" && !txs.length ? loadHistory() : setView(t.id))}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm transition-all ${
                  view === t.id ? "tab-active" : "text-muted-foreground hover:text-white"
                }`}
              >
                <t.icon className="h-4 w-4" />
                {t.label}
              </button>
            ))}
          </nav>

          <div>
            {account ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => refreshBalances(account)}
                  className="hidden rounded-lg bg-white/5 p-2 text-muted-foreground hover:text-white sm:block"
                  title="Refresh balances"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
                <div className="flex items-center gap-2 rounded-xl border border-gold-500/30 bg-gold-500/10 px-3 py-2 text-sm font-medium">
                  <Wallet className="h-4 w-4 text-gold-400" />
                  {account.slice(0, 6)}…{account.slice(-4)}
                </div>
                <button onClick={disconnect} className="rounded-lg bg-white/5 p-2 text-muted-foreground hover:text-white" title="Disconnect">
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <Button onClick={connect} disabled={connecting} className="gold-button rounded-xl px-5">
                {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
                {connecting ? "Connecting…" : "Connect Wallet"}
              </Button>
            )}
          </div>
        </div>

        {/* mobile tabs */}
        <div className="flex gap-1 px-4 pb-3 sm:hidden">
          {(
            [
              { id: "trade", label: "Trade" },
              { id: "portfolio", label: "Portfolio" },
              { id: "history", label: "History" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              onClick={() => (t.id === "history" && !txs.length ? loadHistory() : setView(t.id))}
              className={`flex-1 rounded-lg px-3 py-2 text-sm ${
                view === t.id ? "tab-active" : "bg-white/5 text-muted-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-20">
        {/* ================= hero ================= */}
        <section className="animate-fade-up pt-10 text-center sm:pt-14">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-gold-500/30 bg-gold-500/10 px-4 py-1.5 text-xs font-medium text-gold-300">
            <Zap className="h-3.5 w-3.5" />
            Audited · Slippage-protected · On-chain history
          </div>
          <h1 className="mx-auto mt-5 max-w-2xl font-display text-4xl font-bold leading-tight sm:text-6xl">
            Trade ETH <span className="gold-text">⇄ SHINE</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-sm text-muted-foreground sm:text-base">
            A constant-product liquidity pool on Sepolia. Every quote is protected by
            minimum-output guarantees and deadlines — no silent frontrunning.
          </p>

          {/* stats */}
          <div className="mx-auto mt-8 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Pool TVL" value={pool ? `${fmt(pool.ethReserve, 3)} ETH` : null} icon={<Droplets className="h-4 w-4 text-gold-400" />} />
            <Stat label="SHINE price" value={pool ? `${fmtPrice(pool.shinePriceEth)} ETH` : null} icon={<TrendingUp className="h-4 w-4 text-emerald-400" />} />
            <Stat label="ETH price" value={pool ? `${fmt(pool.ethPriceShine, 0)} SHINE` : null} icon={<TrendingUp className="h-4 w-4 text-indigo-400" />} />
            <Stat label="SHINE in pool" value={pool ? fmt(pool.shineReserve, 0) : null} icon={<ShieldCheck className="h-4 w-4 text-gold-400" />} />
          </div>
        </section>

        {/* ================= trade ================= */}
        {view === "trade" && (
          <section className="animate-fade-up mx-auto mt-10 max-w-lg delay-100">
            <div className="glass-strong rounded-3xl p-5 shadow-[0_20px_80px_-20px_rgba(245,158,11,0.25)] sm:p-6">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="font-display text-lg font-semibold">Swap</h2>
                <div className="flex items-center gap-1 rounded-lg bg-white/5 p-1">
                  {SLIPPAGES.map((b) => (
                    <button
                      key={b}
                      onClick={() => setSlippage(b)}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
                        slippage === b ? "bg-gold-500/20 text-gold-300" : "text-muted-foreground hover:text-white"
                      }`}
                    >
                      {b / 100}%
                    </button>
                  ))}
                </div>
              </div>

              {/* from */}
              <div className="panel-input p-4">
                <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>You pay</span>
                  <span>
                    Balance: <span className="text-white">{fmt(fromToken.bal)}</span>
                    <button onClick={useMax} disabled={!account} className="ml-2 rounded bg-gold-500/20 px-1.5 py-0.5 font-semibold text-gold-300 hover:bg-gold-500/30 disabled:opacity-40">
                      MAX
                    </button>
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <Input
                    placeholder="0.0"
                    inputMode="decimal"
                    value={fromAmount}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "" || /^\d*\.?\d*$/.test(v)) setFromAmount(v);
                    }}
                    className="border-0 bg-transparent p-0 font-display text-3xl font-bold focus-visible:ring-0"
                  />
                  <TokenChip sym={fromToken.sym} logo={fromToken.logo} />
                </div>
              </div>

              {/* flip */}
              <div className="relative my-1 flex justify-center">
                <button
                  onClick={flip}
                  className="z-10 rounded-full border border-gold-500/40 bg-ink-900 p-2.5 text-gold-300 shadow-lg transition-transform duration-300 hover:rotate-180 hover:shadow-gold-500/30"
                >
                  <ArrowDownUp className="h-4 w-4" />
                </button>
                <div className="absolute top-1/2 w-full -translate-y-1/2 border-t border-white/10" />
              </div>

              {/* to */}
              <div className="panel-input p-4">
                <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>You receive <span className="text-gold-300/80">(min −{slippage / 100}% slip)</span></span>
                  <span>Balance: <span className="text-white">{fmt(toToken.bal)}</span></span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 font-display text-3xl font-bold text-white/90">
                    {toAmount ? fmt(toAmount) : <span className="text-white/25">0.0</span>}
                  </div>
                  <TokenChip sym={toToken.sym} logo={toToken.logo} />
                </div>
              </div>

              {/* quote */}
              {num(fromAmount) > 0 && toAmount && (
                <div className="mt-4 space-y-2 rounded-2xl bg-black/30 p-4 text-sm">
                  <Row label="Rate" value={`1 ${fromToken.sym} ≈ ${fmtPrice(rate)} ${toToken.sym}`} />
                  <Row
                    label="Price impact"
                    value={`${impact}%`}
                    valueClass={impactColor}
                  />
                  <Row label="Slippage tolerance" value={`${slippage / 100}%`} />
                  <Row label="Deadline" value="20 minutes" />
                </div>
              )}

              <Button
                onClick={openReview}
                disabled={!account || !fromAmount || num(fromAmount) <= 0 || !toAmount}
                className="gold-button mt-5 w-full rounded-2xl py-6 text-base"
              >
                {!account ? "Connect wallet to swap" : "Review swap"}
              </Button>

              {account && (
                <button
                  onClick={() => web3Service.addTokenToWallet().then(
                    () => toast.success("SHINE added to wallet"),
                    () => toast.error("Could not add token")
                  )}
                  className="mt-3 w-full text-center text-xs text-muted-foreground hover:text-gold-300"
                >
                  + Add SHINE to MetaMask
                </button>
              )}
            </div>

            {/* trust row */}
            <div className="mt-6 grid grid-cols-3 gap-3 text-center">
              {[
                { icon: <ShieldCheck className="mx-auto h-5 w-5 text-emerald-400" />, t: "Audited contracts" },
                { icon: <Zap className="mx-auto h-5 w-5 text-gold-400" />, t: "MEV-aware quotes" },
                { icon: <History className="mx-auto h-5 w-5 text-indigo-400" />, t: "On-chain history" },
              ].map((f) => (
                <div key={f.t} className="glass rounded-2xl px-2 py-3 text-xs text-muted-foreground">
                  {f.icon}
                  <div className="mt-1.5 text-white/80">{f.t}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ================= portfolio ================= */}
        {view === "portfolio" && (
          <section className="animate-fade-up mx-auto mt-10 max-w-3xl">
            {!account ? (
              <EmptyState
                title="No wallet connected"
                sub="Connect to see your ETH and SHINE balances."
                action={<Button onClick={connect} className="gold-button rounded-xl">Connect Wallet</Button>}
              />
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <BalanceCard sym="ETH" logo="/eth-logo.svg" bal={balances.eth} sub="Sepolia ETH" />
                  <BalanceCard sym="SHINE" logo="/lebron.png" bal={balances.shine} sub="Shine Token" />
                </div>
                <div className="glass mt-4 rounded-2xl p-5 text-sm text-muted-foreground">
                  <div className="font-medium text-white">Need testnet funds?</div>
                  <p className="mt-1">
                    Grab Sepolia ETH from a faucet (e.g. Google Cloud's Sepolia faucet or Alchemy's),
                    then swap a little ETH for SHINE to get started.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <a href={ethScanAddr(CONTRACTS.SHINE_TOKEN)} target="_blank" rel="noreferrer" className="chip-link">
                      SHINE contract <ExternalLink className="h-3 w-3" />
                    </a>
                    <a href={ethScanAddr(CONTRACTS.SHINE_LP)} target="_blank" rel="noreferrer" className="chip-link">
                      Pool contract <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              </>
            )}
          </section>
        )}

        {/* ================= history ================= */}
        {view === "history" && (
          <section className="animate-fade-up mx-auto mt-10 max-w-3xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-xl font-semibold">Swap history</h2>
              <div className="flex gap-1 rounded-xl bg-white/5 p-1 text-sm">
                {(
                  [
                    { id: "all", label: "All" },
                    { id: "eth", label: "ETH → SHINE" },
                    { id: "shine", label: "SHINE → ETH" },
                  ] as const
                ).map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setHistoryFilter(f.id)}
                    className={`rounded-lg px-3 py-1.5 ${historyFilter === f.id ? "bg-white/15 text-white" : "text-muted-foreground hover:text-white"}`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="glass-strong min-h-[280px] rounded-3xl p-3 sm:p-4">
              {historyLoading ? (
                <div className="space-y-3 p-2">
                  {[0, 1, 2].map((i) => <div key={i} className="skeleton h-16 w-full" />)}
                </div>
              ) : !account ? (
                <EmptyState title="No wallet connected" sub="Connect to load your on-chain swaps." action={<Button onClick={connect} className="gold-button rounded-xl">Connect Wallet</Button>} />
              ) : filteredTxs.length === 0 ? (
                <EmptyState
                  title="No swaps yet"
                  sub="Your executed swaps will appear here, read straight from Sepolia events."
                  action={<Button onClick={() => setView("trade")} className="gold-button rounded-xl">Make your first swap</Button>}
                />
              ) : (
                <ul className="divide-y divide-white/5">
                  {filteredTxs.slice(0, 20).map((t) => (
                    <li key={`${t.hash}-${t.timestamp}`} className="flex flex-wrap items-center gap-3 rounded-xl p-3 hover:bg-white/[0.03]">
                      <span className={`flex items-center gap-1.5 text-xs font-semibold ${t.status === "success" ? "text-emerald-400" : "text-rose-400"}`}>
                        {t.status === "success" ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                        {t.status}
                      </span>
                      <span className="text-sm">
                        <b>{fmt(t.fromAmount)}</b> {t.fromToken}
                        <span className="mx-2 text-muted-foreground">→</span>
                        <b>{fmt(t.toAmount)}</b> {t.toToken}
                      </span>
                      <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                        {timeAgo(t.timestamp)}
                        <button onClick={() => copy(t.hash)} className="rounded-md p-1.5 hover:bg-white/10 hover:text-white" title="Copy hash">
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                        <a href={ethScanTx(t.hash)} target="_blank" rel="noreferrer" className="rounded-md p-1.5 hover:bg-white/10 hover:text-white" title="View on Etherscan">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        )}
      </main>

      {/* ================= footer ================= */}
      <footer className="border-t border-white/10 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 text-center text-xs text-muted-foreground">
          <div className="flex flex-wrap justify-center gap-2">
            <a href={ethScanAddr(CONTRACTS.SHINE_TOKEN)} target="_blank" rel="noreferrer" className="chip-link">SHINE <ExternalLink className="h-3 w-3" /></a>
            <a href={ethScanAddr(CONTRACTS.SHINE_LP)} target="_blank" rel="noreferrer" className="chip-link">Pool <ExternalLink className="h-3 w-3" /></a>
            <a href="https://github.com/404Piyush/DeFi-Token-Swap-DApp/blob/audit-fixes/AUDIT.md" target="_blank" rel="noreferrer" className="chip-link">Audit report <ExternalLink className="h-3 w-3" /></a>
          </div>
          <p>ShineSwap · Sepolia testnet — trade at your own risk. Built by <a href="https://github.com/404Piyush" target="_blank" rel="noreferrer" className="text-gold-300 hover:underline">@404Piyush</a></p>
        </div>
      </footer>

      {/* ================= review modal ================= */}
      {stage !== "idle" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={() => stage === "review" && setStage("idle")}>
          <div className="glass-strong animate-fade-up w-full max-w-md rounded-3xl p-6" onClick={(e) => e.stopPropagation()}>
            {stage === "done" && txHash ? (
              <div className="text-center">
                <CheckCircle className="mx-auto h-14 w-14 text-emerald-400" />
                <h3 className="mt-4 font-display text-xl font-bold">Swap confirmed</h3>
                <p className="mt-1 text-sm text-muted-foreground">Your tokens are on the way.</p>
                <a href={ethScanTx(txHash)} target="_blank" rel="noreferrer" className="gold-button mt-5 flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm">
                  View on Etherscan <ExternalLink className="h-4 w-4" />
                </a>
                <button onClick={() => { setStage("idle"); loadHistory(); }} className="mt-3 w-full text-sm text-muted-foreground hover:text-white">
                  See it in history
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-lg font-bold">Review swap</h3>
                  <button onClick={() => setStage("idle")} className="rounded-lg p-1.5 text-muted-foreground hover:bg-white/10 hover:text-white">
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-4 rounded-2xl bg-black/30 p-4 text-center font-display text-2xl font-bold">
                  {fmt(fromAmount)} {fromToken.sym}
                  <div className="my-1 text-gold-400">↓</div>
                  ≈ {toAmount ? fmt(toAmount) : "…"} {toToken.sym}
                </div>

                <div className="mt-4 space-y-2 text-sm">
                  <Row label="Rate" value={`1 ${fromToken.sym} ≈ ${fmtPrice(rate)} ${toToken.sym}`} />
                  <Row label="Price impact" value={`${impact}%`} valueClass={impactColor} />
                  <Row label="Max slippage" value={`${slippage / 100}%`} />
                  <Row label="Deadline" value="20 minutes" />
                </div>

                {txError && (
                  <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
                    {txError}
                  </div>
                )}

                <Button onClick={confirmSwap} disabled={stage === "pending"} className="gold-button mt-5 w-full rounded-2xl py-6">
                  {stage === "pending" ? (
                    <><Loader2 className="h-5 w-5 animate-spin" /> Confirm in wallet…</>
                  ) : (
                    "Confirm swap"
                  )}
                </Button>
                <p className="mt-2 text-center text-[11px] text-muted-foreground">
                  Output guaranteed within slippage or the transaction reverts.
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- pieces

function Stat({ label, value, icon }: { label: string; value: string | null; icon: React.ReactNode }) {
  return (
    <div className="stat-card">
      <div className="flex items-center justify-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1.5 font-display text-lg font-bold">
        {value ?? <span className="skeleton mx-auto block h-6 w-20" />}
      </div>
    </div>
  );
}

function TokenChip({ sym, logo }: { sym: string; logo: string }) {
  return (
    <div className="flex shrink-0 items-center gap-2 rounded-xl border border-gold-500/25 bg-gold-500/10 px-3 py-2">
      <img src={logo} alt={sym} className="h-6 w-6 rounded-full" />
      <span className="font-display font-bold">{sym}</span>
    </div>
  );
}

function Row({ label, value, valueClass = "text-white" }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-medium ${valueClass}`}>{value}</span>
    </div>
  );
}

function BalanceCard({ sym, logo, bal, sub }: { sym: string; logo: string; bal: string; sub: string }) {
  return (
    <div className="glass rounded-3xl p-6">
      <div className="flex items-center gap-3">
        <img src={logo} alt={sym} className="h-11 w-11 rounded-full ring-2 ring-gold-500/40" />
        <div>
          <div className="font-display text-lg font-bold">{sym}</div>
          <div className="text-xs text-muted-foreground">{sub}</div>
        </div>
      </div>
      <div className="gold-text mt-4 font-display text-3xl font-bold">{fmt(bal, 3)}</div>
    </div>
  );
}

function EmptyState({ title, sub, action }: { title: string; sub: string; action: React.ReactNode }) {
  return (
    <div className="glass rounded-3xl px-6 py-14 text-center">
      <Wallet className="mx-auto h-10 w-10 text-muted-foreground" />
      <h3 className="mt-4 font-display text-lg font-bold">{title}</h3>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{sub}</p>
      <div className="mt-5">{action}</div>
    </div>
  );
}
