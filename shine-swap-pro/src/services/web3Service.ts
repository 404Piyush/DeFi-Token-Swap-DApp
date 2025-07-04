// ============================================================================
// SHINE SWAP PRO - WEB3 SERVICE LAYER
// ============================================================================

import { ethers, Contract, BrowserProvider, EventLog } from 'ethers';
import { CONTRACTS, NETWORKS } from '../types/contracts';
import shineTokenAbi from '../config/ShineToken.json';
import lpContractDetails from '../config/lp-contract-details.json';
import lpContractAbi from '../config/ShineLP.json';
import type { Transaction } from '../types/transactions';

export class Web3Service {
  private provider: BrowserProvider | null = null;
  private signer: any | null = null;
  private shineToken: Contract | null = null;
  private shineLP: Contract | null = null;

  // ============================================================================
  // WALLET CONNECTION
  // ============================================================================

  async connectWallet(): Promise<{ account: string; chainId: number }> {
    if (!window.ethereum) {
      throw new Error('MetaMask is not installed');
    }

    try {
      // Request account access
      await window.ethereum.request({ method: 'eth_requestAccounts' });
      
      this.provider = new ethers.BrowserProvider(window.ethereum);
      this.signer = await this.provider.getSigner();
      const account = await this.signer.getAddress();
      
      // Check network
      const network = await this.provider.getNetwork();
      if (network.chainId !== BigInt(NETWORKS.SEPOLIA.chainId)) {
        throw new Error('Please switch to Sepolia network');
      }

      // Initialize contracts
      this.initializeContracts();

      return {
        account,
        chainId: Number(network.chainId)
      };
    } catch (error) {
      console.error('Wallet connection failed:', error);
      throw error;
    }
  }

  async reconnectWallet(): Promise<{ account: string | null }> {
    if (!window.ethereum) {
      return { account: null };
    }

    try {
      const accounts = await window.ethereum.request({ method: 'eth_accounts' });
      if (accounts && accounts.length > 0) {
        this.provider = new ethers.BrowserProvider(window.ethereum);
        this.signer = await this.provider.getSigner();
        const account = await this.signer.getAddress();

        const network = await this.provider.getNetwork();
        if (network.chainId !== BigInt(NETWORKS.SEPOLIA.chainId)) {
          // Don't throw, just fail silently on reconnect
          return { account: null };
        }

        this.initializeContracts();
        return { account };
      }
      return { account: null };
    } catch (error) {
      console.error('Reconnect failed:', error);
      return { account: null };
    }
  }

  async disconnectWallet(): Promise<void> {
    this.provider = null;
    this.signer = null;
    this.shineToken = null;
    this.shineLP = null;
  }

  // ============================================================================
  // CONTRACT INITIALIZATION
  // ============================================================================

  private initializeContracts(): void {
    if (!this.signer) return;

    this.shineToken = new ethers.Contract(
      CONTRACTS.SHINE_TOKEN,
      shineTokenAbi.abi,
      this.signer
    );

    this.shineLP = new ethers.Contract(
      CONTRACTS.SHINE_LP,
      lpContractAbi.abi,
      this.signer
    );
  }

  // ============================================================================
  // BALANCE QUERIES
  // ============================================================================

  async getBalances(account: string): Promise<{ eth: string; shine: string }> {
    if (!this.provider || !this.shineToken) {
      throw new Error('Wallet not connected');
    }

    try {
      const [ethBalance, shineBalance] = await Promise.all([
        this.provider.getBalance(account),
        this.shineToken.balanceOf(account)
      ]);

      return {
        eth: ethers.formatEther(ethBalance),
        shine: ethers.formatUnits(shineBalance, 18)
      };
    } catch (error) {
      console.error('Failed to get balances:', error);
      throw error;
    }
  }

  // ============================================================================
  // SWAP RATE CALCULATION
  // ============================================================================

  async calculateSwapOutput(
    inputAmount: string,
    isEthToShine: boolean
  ): Promise<string> {
    if (!this.provider || !this.shineToken) {
      return '0';
    }

    try {
      // Get LP reserves
      const lpEthBalance = await this.provider.getBalance(CONTRACTS.SHINE_LP);
      const lpShineBalance = await this.shineToken.balanceOf(CONTRACTS.SHINE_LP);

      if (lpEthBalance === 0n || lpShineBalance === 0n) {
        return '0';
      }

      // Convert input to BigInt
      const inputBigInt = ethers.parseUnits(inputAmount, 18);
      
      if (inputBigInt === 0n) {
        return '0';
      }

      // Apply 0.3% fee (99.7% of input)
      const inputWithFee = inputBigInt * 997n / 1000n;
      
      let outputBigInt: bigint;
      
      if (isEthToShine) {
        // ETH → SHINE using constant product formula
        // outputAmount = (inputAmount * reserveShine) / (reserveEth + inputAmount)
        const numerator = inputWithFee * lpShineBalance;
        const denominator = lpEthBalance + inputWithFee;
        outputBigInt = numerator / denominator;
        return ethers.formatUnits(outputBigInt, 18);
      } else {
        // SHINE → ETH using constant product formula
        // outputAmount = (inputAmount * reserveEth) / (reserveShine + inputAmount)
        const numerator = inputWithFee * lpEthBalance;
        const denominator = lpShineBalance + inputWithFee;
        outputBigInt = numerator / denominator;
        return ethers.formatEther(outputBigInt);
      }
    } catch (error) {
      console.error('Failed to calculate swap output:', error);
      return '0';
    }
  }

  // ============================================================================
  // APPROVAL MANAGEMENT
  // ============================================================================

  async checkAllowance(account: string): Promise<string> {
    if (!this.shineToken) {
      throw new Error('Wallet not connected');
    }

    try {
      const allowance = await this.shineToken.allowance(account, CONTRACTS.SHINE_LP);
      return ethers.formatUnits(allowance, 18);
    } catch (error) {
      console.error('Failed to check allowance:', error);
      throw error;
    }
  }

  async approveTokens(amount: string): Promise<string> {
    if (!this.shineToken) {
      throw new Error('Wallet not connected');
    }

    try {
      const amountBigInt = ethers.parseUnits(amount, 18);
      // Approve double the amount to reduce future transactions
      const approveAmount = amountBigInt * 2n;
      
      const tx = await this.shineToken.approve(CONTRACTS.SHINE_LP, approveAmount);
      await tx.wait();
      
      return tx.hash;
    } catch (error) {
      console.error('Failed to approve tokens:', error);
      throw error;
    }
  }

  // ============================================================================
  // SWAP EXECUTION
  // ============================================================================

  async executeSwap(
    amount: string,
    isEthToShine: boolean,
    account: string
  ): Promise<string> {
    if (!this.shineLP || !this.shineToken) {
      throw new Error('Wallet not connected');
    }

    try {
      let tx;

      if (isEthToShine) {
        // ETH → SHINE swap
        const ethValue = ethers.parseEther(amount);
        tx = await this.shineLP.swapETHForShine({ value: ethValue });
      } else {
        // SHINE → ETH swap
        const shineValue = ethers.parseUnits(amount, 18);
        
        // Check and handle approval
        const currentAllowance = await this.shineToken.allowance(account, CONTRACTS.SHINE_LP);
        if (currentAllowance < shineValue) {
          await this.approveTokens(amount);
        }
        
        tx = await this.shineLP.swapShineForETH(shineValue);
      }

      await tx.wait();
      return tx.hash;
    } catch (error) {
      console.error('Swap failed:', error);
      throw error;
    }
  }

  // ============================================================================
  // TOKEN ADDITION TO WALLET
  // ============================================================================

  async addTokenToWallet(): Promise<boolean> {
    if (!window.ethereum) {
      throw new Error('MetaMask is not installed');
    }

    try {
      const wasAdded = await window.ethereum.request({
        method: 'wallet_watchAsset',
        params: {
          type: 'ERC20',
          options: {
            address: CONTRACTS.SHINE_TOKEN,
            symbol: 'SHINE',
            decimals: 18,
            image: `${window.location.origin}/lebron.png`
          }
        }
      });

      return wasAdded;
    } catch (error) {
      console.error('Failed to add token to wallet:', error);
      throw error;
    }
  }

  // ============================================================================
  // PRICE IMPACT CALCULATION
  // ============================================================================

  async calculatePriceImpact(
    inputAmount: string,
    isEthToShine: boolean
  ): Promise<{ output: string; priceImpact: string; exchangeRate: string }> {
    if (!this.provider || !this.shineToken) {
      return { output: '0', priceImpact: '0', exchangeRate: '0' };
    }

    try {
      // Get LP reserves
      const lpEthBalance = await this.provider.getBalance(CONTRACTS.SHINE_LP);
      const lpShineBalance = await this.shineToken.balanceOf(CONTRACTS.SHINE_LP);

      if (lpEthBalance === 0n || lpShineBalance === 0n) {
        return { output: '0', priceImpact: '0', exchangeRate: '0' };
      }

      const inputBigInt = ethers.parseUnits(inputAmount, 18);
      
      if (inputBigInt === 0n) {
        return { output: '0', priceImpact: '0', exchangeRate: '0' };
      }

      // Calculate current exchange rate (without trade impact)
      let currentRate: bigint;
      if (isEthToShine) {
        currentRate = (lpShineBalance * ethers.parseEther("1")) / lpEthBalance;
      } else {
        currentRate = (lpEthBalance * ethers.parseUnits("1", 18)) / lpShineBalance;
      }

      // Calculate actual output with slippage
      const output = await this.calculateSwapOutput(inputAmount, isEthToShine);
      const outputBigInt = ethers.parseUnits(output, 18);

      // Calculate effective rate from this trade
      let effectiveRate: bigint;
      if (inputBigInt > 0n) {
        effectiveRate = (outputBigInt * ethers.parseUnits("1", 18)) / inputBigInt;
      } else {
        effectiveRate = currentRate;
      }

      // Calculate price impact as percentage
      let priceImpact: string = '0';
      if (currentRate > 0n) {
        const impactBigInt = currentRate > effectiveRate 
          ? ((currentRate - effectiveRate) * 10000n) / currentRate
          : ((effectiveRate - currentRate) * 10000n) / currentRate;
        priceImpact = (Number(impactBigInt) / 100).toFixed(2);
      }

      return {
        output,
        priceImpact,
        exchangeRate: ethers.formatUnits(currentRate, 18)
      };
    } catch (error) {
      console.error('Failed to calculate price impact:', error);
      return { output: '0', priceImpact: '0', exchangeRate: '0' };
    }
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  async getMaxSwapAmount(isEthToShine: boolean, account: string): Promise<string> {
    if (!this.provider || !this.shineToken) {
      throw new Error('Wallet not connected');
    }

    try {
      if (isEthToShine) {
        // ETH balance minus gas buffer
        const ethBalance = await this.provider.getBalance(account);
        const gasBuffer = ethers.parseEther("0.01");
        const maxAmount = ethBalance > gasBuffer ? ethBalance - gasBuffer : 0n;
        return ethers.formatEther(maxAmount);
      } else {
        // Full SHINE balance
        const shineBalance = await this.shineToken.balanceOf(account);
        return ethers.formatUnits(shineBalance, 18);
      }
    } catch (error) {
      console.error('Failed to get max amount:', error);
      throw error;
    }
  }

  public async getSwapHistory(userAddress: string): Promise<Transaction[]> {
    if (!this.provider) {
      console.warn("Provider not initialized for getting swap history.");
      return [];
    }
    const lpContract = new ethers.Contract(lpContractDetails.contractAddress, lpContractAbi.abi, this.provider);

    // Create filters for both swap event types, filtered by the user
    const ethToShineFilter = lpContract.filters.SwapETHForShine(userAddress);
    const shineToEthFilter = lpContract.filters.SwapShineForETH(userAddress);

    // Query the blockchain for the events
    const ethToShineEvents = await lpContract.queryFilter(ethToShineFilter);
    const shineToEthEvents = await lpContract.queryFilter(shineToEthFilter);

    // Process and map the events to our Transaction type
    const txsFromEth = ethToShineEvents
      .filter((e): e is EventLog => 'args' in e && e.args !== undefined)
      .map(e => ({
        hash: e.transactionHash,
        status: 'success' as const,
        fromToken: 'ETH',
        toToken: 'SHINE',
        fromAmount: ethers.formatEther(e.args.ethAmount),
        toAmount: ethers.formatUnits(e.args.shineAmount, 18),
        timestamp: 0, 
        blockNumber: e.blockNumber
    }));
    
    const txsFromShine = shineToEthEvents
      .filter((e): e is EventLog => 'args' in e && e.args !== undefined)
      .map(e => ({
        hash: e.transactionHash,
        status: 'success' as const,
        fromToken: 'SHINE',
        toToken: 'ETH',
        fromAmount: ethers.formatUnits(e.args.shineAmount, 18),
        toAmount: ethers.formatEther(e.args.ethAmount),
        timestamp: 0,
        blockNumber: e.blockNumber
    }));

    // Combine and fetch timestamps
    const allTxs = [...txsFromEth, ...txsFromShine];
    const txsWithTimestamps = await Promise.all(allTxs.map(async tx => {
      const block = await this.provider!.getBlock(tx.blockNumber);
      return { ...tx, timestamp: (block?.timestamp ?? 0) * 1000 }; // Convert to ms
    }));

    // Sort by most recent
    return txsWithTimestamps.sort((a, b) => b.timestamp - a.timestamp);
  }

  // Check if error is user rejection
  isUserRejectionError(error: any): boolean {
    return (
      error.code === 'ACTION_REJECTED' ||
      error.code === 4001 ||
      (error.error && error.error.code === 4001) ||
      (error.message && (
        error.message.includes('user rejected') ||
        error.message.includes('User denied') ||
        error.message.includes('rejected') ||
        error.message.includes('cancelled')
      ))
    );
  }
}

// Export singleton instance
export const web3Service = new Web3Service(); 