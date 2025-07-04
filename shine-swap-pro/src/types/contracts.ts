// ============================================================================
// SHINE SWAP PRO - TYPE DEFINITIONS
// ============================================================================

import { Contract } from 'ethers';

// Contract Addresses
export const CONTRACTS = {
  SHINE_TOKEN: "0x7C5a0C4fa68c47740Cd51Dd6dFad5E754d019c05",
  SHINE_LP: "0x476DaA7f3c23C7e46A526c20288CF9e74D08a564"
} as const;

// Network Configuration
export const NETWORKS = {
  SEPOLIA: {
    chainId: 11155111,
    name: "Sepolia",
    rpcUrl: "https://ethereum-sepolia.publicnode.com"
  }
} as const;

// Wallet State
export interface WalletState {
  isConnected: boolean;
  account: string | null;
  provider: any | null;
  signer: any | null;
  chainId: number | null;
}

// Token Balance
export interface TokenBalance {
  eth: string;
  shine: string;
}

// Swap State
export interface SwapState {
  isEthToShine: boolean;
  fromAmount: string;
  toAmount: string;
  isLoading: boolean;
  rate: string;
}

// Contract Instances
export interface ContractInstances {
  shineToken: Contract | null;
  shineLP: Contract | null;
}

// Toast Message
export interface ToastMessage {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  duration?: number;
}

// Swap Transaction
export interface SwapTransaction {
  hash: string;
  type: 'eth-to-shine' | 'shine-to-eth';
  amount: string;
  timestamp: number;
  status: 'pending' | 'success' | 'failed';
}

// Component Props
export interface TokenInputProps {
  label: string;
  amount: string;
  balance: string;
  tokenSymbol: string;
  tokenLogo: string;
  isReadOnly?: boolean;
  onAmountChange?: (amount: string) => void;
  onMaxClick?: () => void;
}

export interface WalletButtonProps {
  isConnected: boolean;
  account: string | null;
  onConnect: () => void;
}

export interface SwapButtonProps {
  isLoading: boolean;
  isDisabled: boolean;
  onClick: () => void;
} 