// ============================================================================
// SHINE SWAP PRO - MAIN APPLICATION
// ============================================================================

import React, { useState, useEffect } from "react";
import { web3Service } from "./services/web3Service";
import type { SwapState } from "./types/contracts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArrowDownUp, Wallet, TrendingUp, Shield, Zap, ExternalLink, History, CheckCircle, XCircle, Copy, ArrowLeft } from "lucide-react";
import { Toaster, toast } from 'sonner';

// Helper to format balances
const formatBalance = (balance: string | undefined) => {
  if (!balance) return '0.000000';
  const num = parseFloat(balance);
  if (num === 0) return '0.000000';
  if (num < 0.000001) return num.toPrecision(6);
  if (num < 0.001) return num.toFixed(6);
  if (num < 1) return num.toFixed(4);
  return num.toFixed(3);
};

const formatDisplayRate = (rate: string) => {
  const num = parseFloat(rate);
  if (num === 0 || isNaN(num)) return "0.000000";
  if (num < 0.000001) return num.toPrecision(6);
  return num.toFixed(6);
};

// Add a new type for the wallet state
type WalletState = {
  account: string | null;
  isConnected: boolean;
};

type ViewMode = 'swap' | 'history';

type Transaction = {
  hash: string;
  status: 'success' | 'failed';
  fromToken: string;
  toToken: string;
  fromAmount: string;
  toAmount: string;
  timestamp: number;
};

function App() {
  const [walletState, setWalletState] = useState<WalletState>({ account: null, isConnected: false });
  const [balances, setBalances] = useState({ shine: '0', eth: '0' });
  const [walletLoading, setWalletLoading] = useState(false);

  const [swapState, setSwapState] = useState({
    isEthToShine: true,
    fromAmount: '',
    toAmount: '',
    isLoading: false,
  });

  const [priceData, setPriceData] = useState({
    priceImpact: '0',
    exchangeRate: '0',
  });

  const [viewMode, setViewMode] = useState<ViewMode>('swap');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    const init = async () => {
      const { account } = await web3Service.reconnectWallet();
      if (account) {
        setWalletState({ account, isConnected: true });
        updateBalances(account);
      }
    };
    init();
  }, []);

  useEffect(() => {
    const calculateOutput = async () => {
      if (!swapState.fromAmount || !walletState.isConnected || parseFloat(swapState.fromAmount) <= 0) {
        setSwapState(prev => ({ ...prev, toAmount: '' }));
        setPriceData({ priceImpact: '0', exchangeRate: '0' });
        return;
      }

      const { output, priceImpact, exchangeRate } = await web3Service.calculatePriceImpact(swapState.fromAmount, swapState.isEthToShine);
      setSwapState(prev => ({ ...prev, toAmount: output }));
      setPriceData({ priceImpact, exchangeRate });
    };

    const debounceTimer = setTimeout(calculateOutput, 300);
    return () => clearTimeout(debounceTimer);
  }, [swapState.fromAmount, swapState.isEthToShine, walletState.isConnected]);

  const addTransaction = (tx: Omit<Transaction, 'timestamp'>) => {
    const newTx = { ...tx, timestamp: Date.now() };
    const updatedTxs = [newTx, ...transactions].slice(0, 20); // Keep last 20
    setTransactions(updatedTxs);
    localStorage.setItem('shine-swap-txs', JSON.stringify(updatedTxs));
  };

  const connectWallet = async () => {
    setWalletLoading(true);
    try {
      const { account } = await web3Service.connectWallet();
      if (account) {
        setWalletState({ account, isConnected: true });
        updateBalances(account);
      }
    } catch (error) {
      console.error("Failed to connect wallet:", error);
      toast.error('Failed to connect wallet.');
    } finally {
      setWalletLoading(false);
    }
  };

  const disconnectWallet = () => {
    setWalletState({ account: null, isConnected: false });
    setBalances({ shine: '0', eth: '0' });
    setSwapState({
      isEthToShine: true,
      fromAmount: '',
      toAmount: '',
      isLoading: false,
    });
    setPriceData({
      priceImpact: '0',
      exchangeRate: '0',
    });
    toast.success('Wallet disconnected successfully');
  };

  const updateBalances = async (account: string | null = walletState.account) => {
    if (account) {
      const newBalances = await web3Service.getBalances(account);
      setBalances(newBalances);
    }
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const amount = e.target.value;
    if (amount === '' || /^\d*\.?\d*$/.test(amount)) {
      setSwapState(prev => ({ ...prev, fromAmount: amount }));
    }
  };

  const handleSwitchTokens = () => {
    setSwapState(prev => ({
      ...prev,
      isEthToShine: !prev.isEthToShine,
      fromAmount: prev.toAmount,
      toAmount: prev.fromAmount,
    }));
  };

  const handleMaxClick = async () => {
    if (!walletState.account) return;
    try {
      // Use the balance directly for MAX button
      const currentBalance = swapState.isEthToShine ? balances.eth : balances.shine;
      let maxAmount = currentBalance;
      
      // For ETH, reserve some for gas fees (about 0.001 ETH)
      if (swapState.isEthToShine && parseFloat(currentBalance) > 0.001) {
        maxAmount = (parseFloat(currentBalance) - 0.001).toString();
      }
      
      setSwapState(prev => ({ ...prev, fromAmount: maxAmount }));
    } catch (error) {
      toast.error('Failed to get max amount');
    }
  };

  const handleSwap = async () => {
    if (!walletState.account || !swapState.fromAmount) return;
    setSwapState(prev => ({ ...prev, isLoading: true }));
    const promise = () => web3Service.executeSwap(swapState.fromAmount, swapState.isEthToShine, walletState.account as string);
    
    toast.promise(promise, {
      loading: 'Submitting swap...',
      success: (txHash: string) => {
        setSwapState(prev => ({ ...prev, fromAmount: '', toAmount: '', isLoading: false }));
        updateBalances();
        return <span>Swap successful! <a href={`https://sepolia.etherscan.io/tx/${txHash}`} target="_blank" rel="noopener noreferrer" className="underline">View on Etherscan</a></span>;
      },
      error: (err: any) => {
        setSwapState(prev => ({ ...prev, isLoading: false }));
        if (web3Service.isUserRejectionError(err)) {
          return 'Transaction cancelled by user.';
        }
        return `Swap failed: An unknown error occurred.`;
      },
    });
  };

  const handleAddToken = async () => {
    try {
      await web3Service.addTokenToWallet();
      toast.success('SHINE token added to your wallet!');
    } catch (error) {
      toast.error('Failed to add SHINE token.');
    }
  };

  const handleViewHistory = async () => {
    if (!walletState.account) {
      toast.error("Please connect your wallet to view history.");
      return;
    }
    setHistoryLoading(true);
    setViewMode('history'); // Switch view immediately to show loader
    try {
      const txs = await web3Service.getSwapHistory(walletState.account);
      setTransactions(txs);
    } catch (error) {
      console.error("Failed to fetch swap history:", error);
      toast.error("Could not fetch transaction history.");
      setViewMode('swap'); // Go back if it fails
    } finally {
      setHistoryLoading(false);
    }
  };

  const isSwapDisabled = () => {
    return !walletState.isConnected ||
           !swapState.fromAmount ||
           parseFloat(swapState.fromAmount) <= 0 ||
           swapState.isLoading;
  };

  const fromToken = swapState.isEthToShine ? { name: 'ETH', logo: '/eth-logo.svg', balance: balances.eth } : { name: 'SHINE', logo: '/lebron.png', balance: balances.shine };
  const toToken = swapState.isEthToShine ? { name: 'SHINE', logo: '/lebron.png', balance: balances.shine } : { name: 'ETH', logo: '/eth-logo.svg', balance: balances.eth };

  if (viewMode === 'history') {
    return <PastSwaps 
      transactions={transactions} 
      onBack={() => setViewMode('swap')}
      isLoading={historyLoading} 
    />;
  }

  return (
    <>
      <Toaster position="top-center" richColors />
      <div className="min-h-screen bg-black text-white">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0" style={{
            backgroundImage: 'radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.1) 1px, transparent 1px)',
            backgroundSize: '50px 50px'
          }}></div>
        </div>
        
        {/* Header */}
        <header className="relative z-10 px-4 py-4 border-b border-gray-800 backdrop-blur-sm bg-black/50 animate-fade-in">
          <div className="max-w-7xl mx-auto flex justify-between items-center">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-3 group">
                <div className="relative transition-transform duration-300 group-hover:scale-105">
                  <img src="/lebron.png" alt="SHINE" className="w-10 h-10 rounded-full ring-2 ring-white/20 group-hover:ring-white/40 transition-all duration-300" />
                </div>
      <div>
                  <h1 className="text-2xl font-bold text-white group-hover:text-white/90 transition-colors duration-300">
                    SHINE SWAP
                  </h1>
                  <p className="text-xs text-gray-400 group-hover:text-gray-300 transition-colors duration-300">Professional DeFi Trading</p>
                </div>
              </div>
              
              {/* Profile Links */}
              <div className="hidden md:flex items-center gap-3">
                <a 
                  href="https://www.upwork.com/freelancers/404piyush?mp_source=share" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 hover:shadow-lg hover:shadow-white/20 rounded-lg text-sm font-medium text-white border border-white/20 hover:border-white/40 transition-all duration-300 hover:scale-105"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.561 13.158c-1.102 0-2.135-.467-3.074-1.227l.228-1.076.008-.042c.207-1.143.849-3.06 2.839-3.06 1.492 0 2.703 1.212 2.703 2.703-.001 1.489-1.212 2.702-2.704 2.702zm0-8.14c-2.539 0-4.51 1.649-5.31 4.366-1.22-1.834-2.148-4.036-2.687-5.892H7.828v7.112c-.002 1.406-1.141 2.546-2.547 2.546-1.405 0-2.543-1.14-2.543-2.546V3.492H0v7.112c0 2.914 2.37 5.303 5.281 5.303 2.913 0 5.283-2.389 5.283-5.303V9.321c.548 1.199 1.251 2.242 2.262 2.965 1.383 1.001 2.918 1.606 4.734 1.606 2.914 0 5.303-2.387 5.303-5.303.001-2.914-2.389-5.302-5.302-5.302z"/>
                  </svg>
                  Upwork
                </a>
                <a 
                  href="https://www.linkedin.com/in/piyush-utkar-0489b12b2" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 hover:shadow-lg hover:shadow-white/20 rounded-lg text-sm font-medium text-white border border-white/20 hover:border-white/40 transition-all duration-300 hover:scale-105"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                  </svg>
                  LinkedIn
        </a>
      </div>
            </div>
            
            <div className="flex items-center gap-3">
              {walletState.isConnected ? (
                <>
                  <div className="flex items-center gap-2 px-4 py-2 bg-white/10 rounded-lg border border-white/20 animate-pulse-slow">
                    <Wallet className="w-4 h-4 text-white" />
                    <span className="text-sm font-medium text-white">
                      {walletState.account?.slice(0, 6)}...{walletState.account?.slice(-4)}
                    </span>
                  </div>
                  <Button 
                    onClick={disconnectWallet}
                    variant="outline"
                    className="flex items-center justify-center gap-2 px-4 py-2 bg-black/50 hover:bg-white/10 text-white/80 hover:text-white border-white/20 hover:border-white/40 hover:shadow-lg hover:shadow-white/10 rounded-lg text-sm font-medium transition-all duration-300"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                  </Button>
                </>
              ) : (
                <Button 
                  onClick={connectWallet} 
                  disabled={walletLoading}
                  className="bg-white text-black hover:bg-gray-200 font-semibold px-6 py-2.5 rounded-lg transition-all duration-200"
                >
                  {walletLoading ? (
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin"></div>
                      Connecting...
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Wallet className="w-4 h-4" />
                      Connect Wallet
                    </div>
                  )}
                </Button>
              )}
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="relative z-10 flex flex-col items-center justify-center px-4 py-12 min-h-[calc(100vh-140px)]">
          <div className="w-full max-w-md">
            {/* Feature Cards */}
            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 text-center border border-white/10 hover:bg-white/10 transition-all duration-300 hover:scale-105 group">
                <div className="w-6 h-6 mx-auto mb-2 text-white/80 group-hover:text-white transition-colors duration-300">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-full h-full">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <p className="text-xs text-gray-300">Secure</p>
              </div>
              <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 text-center border border-white/10 hover:bg-white/10 transition-all duration-300 hover:scale-105 group">
                <div className="w-6 h-6 mx-auto mb-2 text-white/80 group-hover:text-white transition-colors duration-300">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-full h-full">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <p className="text-xs text-gray-300">Fast</p>
              </div>
              <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 text-center border border-white/10 hover:bg-white/10 transition-all duration-300 hover:scale-105 group">
                <div className="w-6 h-6 mx-auto mb-2 text-white/80 group-hover:text-white transition-colors duration-300">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-full h-full">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                </div>
                <p className="text-xs text-gray-300">Efficient</p>
              </div>
            </div>

            {/* Swap Card */}
            <Card className="bg-white/5 backdrop-blur-xl border-white/10 shadow-2xl">
              <CardHeader className="pb-4">
                <CardTitle className="text-xl text-white flex items-center gap-2">
                  <ArrowDownUp className="w-5 h-5" />
                  Token Swap
                </CardTitle>
                <CardDescription className="text-gray-400">
                  Swap between ETH and SHINE tokens instantly
                </CardDescription>
              </CardHeader>
              
              <CardContent className="space-y-6">
                {/* From Token */}
                <div className="p-6 bg-white/5 rounded-2xl border border-white/10">
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-sm font-medium text-gray-300">You Pay</span>
                    <span className="text-sm text-gray-400">
                      Balance: <span className="text-white font-medium">{formatBalance(fromToken.balance)}</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <Input 
                      type="text" 
                      inputMode="decimal"
                      placeholder="0.0" 
                      className="text-2xl font-bold bg-transparent border-none focus-visible:ring-0 focus-visible:ring-offset-0 h-auto p-0 flex-grow text-white placeholder:text-gray-500" 
                      value={swapState.fromAmount}
                      onChange={handleAmountChange}
                    />
                    <div className="flex items-center gap-3">
                      <Button 
                        variant="secondary" 
                        size="sm" 
                        onClick={handleMaxClick} 
                        disabled={!walletState.isConnected}
                        className="bg-white/10 hover:bg-white/20 text-white border-white/20 rounded-lg px-3 py-1 text-xs font-medium"
                      >
                        MAX
                      </Button>
                      <div className="flex items-center gap-2 p-3 bg-white/10 rounded-xl border border-white/20 min-w-0">
                        <img src={fromToken.logo} alt={fromToken.name} className="w-6 h-6 rounded-full flex-shrink-0" />
                        <span className="font-semibold text-white truncate">{fromToken.name}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Switch Button */}
                <div className="relative flex justify-center">
                  <Button 
                    variant="outline" 
                    size="icon" 
                    className="z-10 rounded-full bg-white/90 hover:bg-white text-black border-0 shadow-xl hover:shadow-2xl hover:shadow-white/30 transition-all duration-300 hover:scale-110 animate-pulse-glow group" 
                    onClick={handleSwitchTokens}
                  >
                    <ArrowDownUp className="h-4 w-4 transition-transform duration-300 group-hover:rotate-180" />
                  </Button>
                  <div className="absolute top-1/2 left-0 w-full h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
                </div>

                {/* To Token */}
                <div className="p-6 bg-white/5 rounded-2xl border border-white/10">
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-sm font-medium text-gray-300">You Receive</span>
                    <span className="text-sm text-gray-400">
                      Balance: <span className="text-white font-medium">{formatBalance(toToken.balance)}</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-2xl font-bold flex-grow text-white">
                      {swapState.toAmount || '0.0'}
                    </div>
                    <div className="flex items-center gap-2 p-3 bg-white/10 rounded-xl border border-white/20 min-w-0">
                      <img src={toToken.logo} alt={toToken.name} className="w-6 h-6 rounded-full flex-shrink-0" />
                      <span className="font-semibold text-white truncate">{toToken.name}</span>
                    </div>
                  </div>
                </div>

                {/* Price Info */}
                {parseFloat(swapState.fromAmount) > 0 && walletState.isConnected && (
                  <div className="bg-white/5 rounded-xl p-4 space-y-3 border border-white/10">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-300">Exchange Rate</span>
                      <span className="text-sm font-medium text-white">
                        1 {fromToken.name} ≈ {formatDisplayRate(priceData.exchangeRate)} {toToken.name}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-300">Price Impact</span>
                      <span className={`text-sm font-medium ${
                        parseFloat(priceData.priceImpact) > 5 ? 'text-red-400' : 
                        parseFloat(priceData.priceImpact) > 2 ? 'text-yellow-400' : 'text-green-400'
                      }`}>
                        {priceData.priceImpact}%
                      </span>
                    </div>
                  </div>
                )}
                
                {/* Swap Button */}
                <Button 
                  className="w-full bg-white text-black hover:bg-gray-200 font-bold py-6 rounded-2xl transition-all duration-200 shadow-lg hover:shadow-xl text-lg" 
                  onClick={handleSwap} 
                  disabled={isSwapDisabled()}
                >
                  {swapState.isLoading ? (
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 border-2 border-black/20 border-t-black rounded-full animate-spin"></div>
                      Swapping...
                    </div>
                  ) : (
                    'Swap Tokens'
                  )}
                </Button>

                {/* Add Token Button */}
                {walletState.isConnected && (
                  <Button 
                    variant="ghost" 
                    className="w-full text-gray-400 hover:text-white hover:bg-white/10 rounded-xl py-3" 
                    onClick={handleAddToken}
                  >
                    Add SHINE to Wallet
                  </Button>
                )}
              </CardContent>
            </Card>
            {/* Add a button to switch to history */}
            <CardFooter>
              <Button 
                variant="ghost" 
                className="w-full text-gray-400 hover:text-white hover:bg-white/10"
                onClick={handleViewHistory}
                disabled={!walletState.isConnected}
              >
                <History className="w-4 h-4 mr-2" />
                View Past Swaps
              </Button>
            </CardFooter>
          </div>
        </main>

        {/* Footer */}
        <footer className="relative z-10 px-4 py-6 border-t border-gray-800 backdrop-blur-sm bg-black/50 animate-fade-in">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="text-center md:text-left">
              <p className="text-sm text-gray-400">
                Built with{' '}
                <span className="text-white/80 hover:text-white hover:scale-110 inline-block transition-transform duration-300 cursor-default">
                  ♥
                </span>{' '}
                for the DeFi community • Powered by Ethereum
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Made by{' '}
                <a 
                  href="https://github.com/404Piyush" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-white font-medium hover:text-gray-300 transition-all duration-300 hover:scale-105 inline-block"
                >
                  @404Piyush
                </a>
              </p>
            </div>
            
            {/* Mobile Profile Links */}
            <div className="flex md:hidden items-center gap-3">
              <a 
                href="https://www.upwork.com/freelancers/404piyush?mp_source=share" 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 bg-white/10 hover:bg-white/20 hover:shadow-lg hover:shadow-white/20 rounded-lg text-xs font-medium text-white border border-white/20 hover:border-white/40 transition-all duration-300 hover:scale-105"
              >
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.561 13.158c-1.102 0-2.135-.467-3.074-1.227l.228-1.076.008-.042c.207-1.143.849-3.06 2.839-3.06 1.492 0 2.703 1.212 2.703 2.703-.001 1.489-1.212 2.702-2.704 2.702zm0-8.14c-2.539 0-4.51 1.649-5.31 4.366-1.22-1.834-2.148-4.036-2.687-5.892H7.828v7.112c-.002 1.406-1.141 2.546-2.547 2.546-1.405 0-2.543-1.14-2.543-2.546V3.492H0v7.112c0 2.914 2.37 5.303 5.281 5.303 2.913 0 5.283-2.389 5.283-5.303V9.321c.548 1.199 1.251 2.242 2.262 2.965 1.383 1.001 2.918 1.606 4.734 1.606 2.914 0 5.303-2.387 5.303-5.303.001-2.914-2.389-5.302-5.302-5.302z"/>
                </svg>
                Upwork
              </a>
              <a 
                href="https://www.linkedin.com/in/piyush-utkar-0489b12b2" 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 bg-white/10 hover:bg-white/20 hover:shadow-lg hover:shadow-white/20 rounded-lg text-xs font-medium text-white border border-white/20 hover:border-white/40 transition-all duration-300 hover:scale-105"
              >
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                </svg>
                LinkedIn
              </a>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}

export default App;

const PastSwaps: React.FC<{ transactions: Transaction[], onBack: () => void, isLoading: boolean }> = ({ transactions, onBack, isLoading }) => {
  const formatTimeAgo = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " years ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " months ago";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + " days ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + " hours ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + " minutes ago";
    return Math.floor(seconds) + " seconds ago";
  };
  
  const copyToClipboard = async (text: string) => {
    // Modern browsers with secure context (or localhost)
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        toast.success("Transaction hash copied!");
        return;
      } catch (err) {
        console.error("Failed to copy with navigator.clipboard:", err);
        // Fallback below will be attempted
      }
    }

    // Fallback for older browsers or insecure contexts
    try {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      
      // Prevent scrolling to bottom of page in MS Edge.
      textArea.style.position = "fixed";
      textArea.style.top = "0";
      textArea.style.left = "0";
      
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      
      const successful = document.execCommand("copy");
      document.body.removeChild(textArea);

      if (successful) {
        toast.success("Transaction hash copied!");
      } else {
        throw new Error("Copy command was not successful.");
      }
    } catch (err) {
      console.error("Fallback copy failed:", err);
      toast.error("Failed to copy hash.");
    }
  };

  return (
    <div className="min-h-screen bg-black text-white animate-fade-in p-4 sm:p-6 lg:p-8">
      <div className="max-w-4xl mx-auto">
        <header className="flex items-center justify-between mb-8">
          <Button onClick={onBack} variant="ghost" className="hover:bg-white/10">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Swap
          </Button>
          <h1 className="text-2xl font-bold">Transaction History</h1>
          <div className="w-24"></div> {/* Spacer */}
        </header>
        
        <div className="bg-white/5 border border-white/10 rounded-xl shadow-2xl min-h-[300px]">
          {isLoading ? (
            <div className="flex justify-center items-center h-full py-16">
              <div className="w-8 h-8 border-4 border-white/20 border-t-white rounded-full animate-spin"></div>
            </div>
          ) : transactions.length > 0 ? (
            <ul className="divide-y divide-white/10">
              {transactions.slice(0, 10).map((tx) => (
                <li key={tx.hash + tx.timestamp} className="p-4 grid grid-cols-1 md:grid-cols-6 gap-4 items-center hover:bg-white/5 transition-colors duration-200">
                  {/* Status */}
                  <div className="flex items-center gap-3 md:col-span-1">
                    {tx.status === 'success' ? (
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-500" />
                    )}
                    <span className={`font-semibold ${tx.status === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                      {tx.status.charAt(0).toUpperCase() + tx.status.slice(1)}
                    </span>
                  </div>

                  {/* Amounts */}
                  <div className="md:col-span-2">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-bold">{parseFloat(tx.fromAmount).toFixed(4)}</span>
                      <span>{tx.fromToken}</span>
                      <ArrowDownUp className="w-3 h-3 text-gray-400" />
                      <span className="font-bold">{parseFloat(tx.toAmount).toFixed(4)}</span>
                      <span>{tx.toToken}</span>
                    </div>
                  </div>

                  {/* Timing */}
                  <div className="text-gray-400 text-sm md:col-span-1">
                    {formatTimeAgo(tx.timestamp)}
                  </div>

                  {/* Hash & Actions */}
                  <div className="flex items-center gap-2 md:col-span-2">
                    <a href={`https://sepolia.etherscan.io/tx/${tx.hash}`} target="_blank" rel="noopener noreferrer" className="truncate text-sm font-mono hover:underline">
                      {tx.hash.slice(0, 8)}...{tx.hash.slice(-6)}
                    </a>
                    <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-white/10" onClick={() => copyToClipboard(tx.hash)}>
                      <Copy className="w-4 h-4" />
                    </Button>
                    <a href={`https://sepolia.etherscan.io/tx/${tx.hash}`} target="_blank" rel="noopener noreferrer">
                      <Button variant="ghost" size="sm" className="h-8 hover:bg-white/10">
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-center py-16">
              <History className="w-12 h-12 mx-auto text-gray-500 mb-4" />
              <h3 className="text-lg font-semibold">No Transactions Yet</h3>
              <p className="text-gray-400">Your past swaps will appear here.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
