// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title ShineLP (Liquidity Pool)
 * @dev Constant-product (x*y=k) pool for ETH <-> SHINE swaps with 0.3% fee.
 * Swaps require explicit minAmountOut + deadline (slippage/MEV protection).
 */
contract ShineLP is Ownable, ReentrancyGuard {

    IERC20 public immutable shineToken;

    uint256 public constant FEE_NUMERATOR = 997; // 0.3% fee
    uint256 public constant FEE_DENOMINATOR = 1000;

    // Events
    event SwapETHForShine(address indexed user, uint256 ethAmount, uint256 shineAmount);
    event SwapShineForETH(address indexed user, uint256 shineAmount, uint256 ethAmount);
    event LiquidityAdded(address indexed provider, uint256 ethAmount, uint256 shineAmount);
    event LiquidityRemoved(address indexed provider, uint256 ethAmount, uint256 shineAmount);

    constructor(address _shineTokenAddress) Ownable(msg.sender) {
        require(_shineTokenAddress != address(0), "Invalid SHINE token address");
        shineToken = IERC20(_shineTokenAddress);
    }

    /**
     * @dev Quote output amount for a given input (includes 0.3% fee). View-only.
     */
    function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut)
        public
        pure
        returns (uint256 amountOut)
    {
        require(amountIn > 0, "Input amount must be positive");
        require(reserveIn > 0 && reserveOut > 0, "Invalid reserves");

        uint256 amountInWithFee = amountIn * FEE_NUMERATOR;
        uint256 numerator = amountInWithFee * reserveOut;
        uint256 denominator = (reserveIn * FEE_DENOMINATOR) + amountInWithFee;
        amountOut = numerator / denominator;
    }

    /**
     * @dev Current reserves (ETH, SHINE). View-only.
     */
    function getReserves() external view returns (uint256 ethReserve, uint256 shineReserve) {
        ethReserve = address(this).balance;
        shineReserve = shineToken.balanceOf(address(this));
    }

    /**
     * @dev Swaps ETH for SHINE tokens.
     * @param minShineOut Minimum SHINE accepted (slippage protection).
     * @param deadline Unix timestamp after which the swap reverts.
     */
    function swapETHForShine(uint256 minShineOut, uint256 deadline)
        external
        payable
        nonReentrant
    {
        require(msg.value > 0, "Must send ETH to swap");
        require(block.timestamp <= deadline, "Swap expired");

        uint256 ethReserve = address(this).balance - msg.value;
        uint256 shineReserve = shineToken.balanceOf(address(this));

        uint256 shineToSend = getAmountOut(msg.value, ethReserve, shineReserve);

        require(shineToSend >= minShineOut, "Slippage: output below minimum");
        require(shineReserve >= shineToSend, "Insufficient SHINE liquidity in the pool");

        bool sent = shineToken.transfer(msg.sender, shineToSend);
        require(sent, "Failed to send SHINE tokens");

        emit SwapETHForShine(msg.sender, msg.value, shineToSend);
    }

    /**
     * @dev Swaps SHINE tokens for ETH.
     * @param shineAmount SHINE input amount.
     * @param minEthOut Minimum ETH accepted (slippage protection).
     * @param deadline Unix timestamp after which the swap reverts.
     */
    function swapShineForETH(uint256 shineAmount, uint256 minEthOut, uint256 deadline)
        external
        nonReentrant
    {
        require(shineAmount > 0, "Must swap a positive amount of SHINE");
        require(block.timestamp <= deadline, "Swap expired");

        uint256 ethReserve = address(this).balance;
        uint256 shineReserve = shineToken.balanceOf(address(this));

        uint256 ethToSend = getAmountOut(shineAmount, shineReserve, ethReserve);

        require(ethToSend >= minEthOut, "Slippage: output below minimum");
        require(ethReserve >= ethToSend, "Insufficient ETH liquidity in the pool");

        // User must have approved the contract to spend their SHINE
        bool received = shineToken.transferFrom(msg.sender, address(this), shineAmount);
        require(received, "Failed to receive SHINE tokens. Did you approve first?");

        (bool sent, ) = msg.sender.call{value: ethToSend}("");
        require(sent, "Failed to send ETH");

        emit SwapShineForETH(msg.sender, shineAmount, ethToSend);
    }

    /**
     * @dev Owner adds liquidity: sends ETH with the call, pulls SHINE via allowance.
     * @param shineAmount SHINE to pull from owner into the pool.
     */
    function addLiquidity(uint256 shineAmount) external payable onlyOwner {
        require(msg.value > 0 || shineAmount > 0, "Must provide some liquidity");
        if (shineAmount > 0) {
            bool received = shineToken.transferFrom(msg.sender, address(this), shineAmount);
            require(received, "Failed to receive SHINE. Did you approve first?");
        }
        emit LiquidityAdded(msg.sender, msg.value, shineAmount);
    }

    /**
     * @dev Owner can remove liquidity from the pool.
     */
    function removeLiquidity(uint256 _ethAmount, uint256 _shineAmount) external onlyOwner {
        require(address(this).balance >= _ethAmount, "Cannot withdraw more ETH than available");
        require(shineToken.balanceOf(address(this)) >= _shineAmount, "Cannot withdraw more SHINE than available");

        if (_ethAmount > 0) {
            (bool sent, ) = owner().call{value: _ethAmount}("");
            require(sent, "ETH withdrawal failed");
        }

        if (_shineAmount > 0) {
            bool sent = shineToken.transfer(owner(), _shineAmount);
            require(sent, "SHINE withdrawal failed");
        }

        emit LiquidityRemoved(owner(), _ethAmount, _shineAmount);
    }

    // Receive function to accept direct ETH transfers for liquidity
    receive() external payable {
        // Only owner can add ETH this way for simplicity
        require(msg.sender == owner(), "Only owner can add liquidity directly");
    }
}
