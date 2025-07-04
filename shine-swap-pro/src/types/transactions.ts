export type Transaction = {
  hash: string;
  status: 'success' | 'failed';
  fromToken: string;
  toToken: string;
  fromAmount: string;
  toAmount: string;
  timestamp: number;
}; 