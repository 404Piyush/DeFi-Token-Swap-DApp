# ShineSwap Security Audit (2026-10-14, self-audit)

Scope: `contracts/ShineToken.sol`, `contracts/ShineLP.sol`, `shine-swap-pro/src/services/web3Service.ts`.

## Findings & fixes (all fixed on `audit-fixes`)

### H1 — Fee-on-transfer breaks LP math (ShineToken × ShineLP)
If `feesEnabled` is true and the LP is not fee-exempt, `swapShineForETH`
computes ETH output from the full `_shineAmount` but the pool receives less
(fee skimmed to the token contract). The pool overpays ETH and leaks value.
Fix: deploy script auto-excludes the LP; `toggleFees(bool,address)` reverts
when enabling unless the LP is exempt. Test: `enabling fees with non-exempt
LP reverts`, `fee-on-transfer with LP excluded does not break swaps`.

### H2 — No slippage protection (ShineLP)
Swaps had no `minAmountOut`/`deadline`: fully frontrunnable/MEV-able.
Fix: `swapETHForShine(minShineOut, deadline)` and
`swapShineForETH(shineAmount, minEthOut, deadline)`; frontend quotes output,
applies user slippage tolerance (0.5/1/2%), 20-min deadline.
Tests: `reverts on slippage`, `reverts on expired deadline`.

### M1 — `addLiquidity` was a no-op log (ShineLP)
Old version took ETH but never pulled SHINE; the event logged the whole pool
balance as "added". Fix: `addLiquidity(shineAmount)` pulls SHINE via
`transferFrom` and emits real amounts.

### M2 — Owner can drain accrued fees (ShineToken)
`emergencyWithdraw` sends all in-contract fees to owner. Kept as an explicit
escape hatch, now with `FeesWithdrawn` event + required non-zero balance.

### L1 — Unused `ReentrancyGuard` (ShineToken)
Removed (no external calls in token). LP keeps its guard (ETH `call`).

### L2 — Missing events (ShineToken)
Added `BurnReserveUpdated`, `LPRewardsPoolUpdated`, `FeeExclusionUpdated`.

### Frontend fixes
- Auto-switch/add Sepolia chain instead of throwing.
- Exact-amount approvals (was 2× over-approval).
- Swap history uses chunked block-range scans from `deployBlock` (public RPCs
  reject wide `eth_getLogs` ranges).
- Removed dead localStorage tx cache (history is on-chain).

## Verification
- `npx hardhat test`: 8/8 passing.
- `npm run build` (shine-swap-pro): passes.
