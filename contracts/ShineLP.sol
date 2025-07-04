// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title ShineLP (Liquidity Pool)
 * @dev A simple contract to facilitate swapping between ETH and SHINE tokens.
 * This version uses a Constant Product (x*y=k) formula for dynamic rates.
 */
contract ShineLP is Ownable, ReentrancyGuard {
    
    IERC20 public immutable shineToken;
    
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
     * @dev Calculates the amount of output tokens to be received for a given input amount.
     * Includes a 0.3% swap fee.
     */
    function _getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut) private pure returns (uint256 amountOut) {
        require(amountIn > 0, "Input amount must be positive");
        require(reserveIn > 0 && reserveOut > 0, "Invalid reserves");
        
        uint256 amountInWithFee = amountIn * 997; // 100% - 0.3% = 99.7%
        uint256 numerator = amountInWithFee * reserveOut;
        uint256 denominator = (reserveIn * 1000) + amountInWithFee;
        amountOut = numerator / denominator;
    }

    /**
     * @dev Swaps ETH for SHINE tokens.
     */
    function swapETHForShine() external payable nonReentrant {
        require(msg.value > 0, "Must send ETH to swap");
        
        uint256 ethReserve = address(this).balance - msg.value;
        uint256 shineReserve = shineToken.balanceOf(address(this));
        
        uint256 shineToSend = _getAmountOut(msg.value, ethReserve, shineReserve);
        
        require(shineReserve >= shineToSend, "Insufficient SHINE liquidity in the pool");
        
        bool sent = shineToken.transfer(msg.sender, shineToSend);
        require(sent, "Failed to send SHINE tokens");
        
        emit SwapETHForShine(msg.sender, msg.value, shineToSend);
    }
    
    /**
     * @dev Swaps SHINE tokens for ETH.
     */
    function swapShineForETH(uint256 _shineAmount) external nonReentrant {
        require(_shineAmount > 0, "Must swap a positive amount of SHINE");
        
        uint256 ethReserve = address(this).balance;
        uint256 shineReserve = shineToken.balanceOf(address(this));

        uint256 ethToSend = _getAmountOut(_shineAmount, shineReserve, ethReserve);

        require(ethReserve >= ethToSend, "Insufficient ETH liquidity in the pool");

        // User must have approved the contract to spend their SHINE
        bool received = shineToken.transferFrom(msg.sender, address(this), _shineAmount);
        require(received, "Failed to receive SHINE tokens. Did you approve first?");
        
        (bool sent, ) = msg.sender.call{value: ethToSend}("");
        require(sent, "Failed to send ETH");
        
        emit SwapShineForETH(msg.sender, _shineAmount, ethToSend);
    }
    
    /**
     * @dev Owner can add liquidity to the pool.
     * This is a simple implementation where owner adds both assets.
     */
    function addLiquidity() external payable onlyOwner {
        emit LiquidityAdded(msg.sender, msg.value, shineToken.balanceOf(address(this)));
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