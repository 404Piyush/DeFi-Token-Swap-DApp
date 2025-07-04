// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title ShineToken - Simplified Version for Initial Deployment
 * @dev SHINE token with basic functionality, features can be added later
 */
contract ShineToken is ERC20, Ownable, ReentrancyGuard {
    
    // Token Configuration
    uint256 public constant MAX_SUPPLY = 10_000_000 * 10**18; // 10M SHINE
    uint256 public constant TRANSACTION_FEE = 50; // 0.5% (50/10000)
    uint256 public constant MIN_FEE_THRESHOLD = 1000 * 10**18; // 1000 SHINE minimum for fees
    
    // Tracking Variables
    uint256 public totalBurned;
    uint256 public totalFeesCollected;
    uint256 public transactionCount;
    bool public feesEnabled = false; // Start with fees disabled for initial setup
    
    // Addresses
    address public burnReserve;
    address public lpRewardsPool;
    
    // Fee exemption mapping
    mapping(address => bool) public isExcludedFromFees;
    
    // Events
    event AutoBurn(uint256 amount, string reason);
    event FeesCollected(uint256 feeAmount, uint256 burnAmount, uint256 lpAmount);
    event FeesToggled(bool enabled);
    
    /**
     * @dev Constructor - Simple deployment with basic setup
     */
    constructor() ERC20("Shine Token", "SHINE") Ownable(msg.sender) {
        // Mint entire supply to deployer for initial setup
        _mint(msg.sender, MAX_SUPPLY);
        
        // Set deployer as initial addresses (can be changed later)
        burnReserve = msg.sender;
        lpRewardsPool = msg.sender;
        
        // Exclude deployer from fees initially
        isExcludedFromFees[msg.sender] = true;
        isExcludedFromFees[address(this)] = true;
    }
    
    /**
     * @dev Set burn reserve address (owner only)
     */
    function setBurnReserve(address _burnReserve) external onlyOwner {
        require(_burnReserve != address(0), "Invalid address");
        burnReserve = _burnReserve;
        isExcludedFromFees[_burnReserve] = true;
    }
    
    /**
     * @dev Set LP rewards pool address (owner only)
     */
    function setLPRewardsPool(address _lpRewardsPool) external onlyOwner {
        require(_lpRewardsPool != address(0), "Invalid address");
        lpRewardsPool = _lpRewardsPool;
        isExcludedFromFees[_lpRewardsPool] = true;
    }
    
    /**
     * @dev Override transfer to implement basic fee system (when enabled)
     */
    function _update(address from, address to, uint256 value) internal override {
        // Increment transaction count
        if (from != address(0) && to != address(0)) {
            transactionCount++;
        }
        
        // Apply fees only if enabled and conditions are met
        if (feesEnabled && 
            from != address(0) && 
            to != address(0) && 
            !isExcludedFromFees[from] && 
            !isExcludedFromFees[to] && 
            value >= MIN_FEE_THRESHOLD) {
            
            uint256 feeAmount = (value * TRANSACTION_FEE) / 10000;
            uint256 transferAmount = value - feeAmount;
            
            // Transfer fee to contract for later processing
            if (feeAmount > 0) {
                super._update(from, address(this), feeAmount);
                totalFeesCollected += feeAmount;
                emit FeesCollected(feeAmount, 0, 0);
            }
            
            // Transfer remaining amount
            super._update(from, to, transferAmount);
            
        } else {
            // Normal transfer without fees
            super._update(from, to, value);
        }
    }
    
    /**
     * @dev Manual burn function (owner only)
     */
    function burn(uint256 amount) external onlyOwner {
        require(balanceOf(address(this)) >= amount, "Insufficient contract balance");
        _burn(address(this), amount);
        totalBurned += amount;
        emit AutoBurn(amount, "Manual burn");
    }
    
    /**
     * @dev Process collected fees - burn and LP rewards (owner only)
     */
    function processFees() external onlyOwner {
        uint256 contractBalance = balanceOf(address(this));
        require(contractBalance > 0, "No fees to process");
        
        uint256 burnAmount = (contractBalance * 60) / 100; // 60% burn
        uint256 lpAmount = contractBalance - burnAmount; // 40% LP rewards
        
        // Burn portion
        if (burnAmount > 0) {
            _burn(address(this), burnAmount);
            totalBurned += burnAmount;
            emit AutoBurn(burnAmount, "Fee burn");
        }
        
        // Send LP rewards
        if (lpAmount > 0) {
            super._update(address(this), lpRewardsPool, lpAmount);
        }
    }
    
    /**
     * @dev Exclude address from fees (owner only)
     */
    function excludeFromFees(address account) external onlyOwner {
        isExcludedFromFees[account] = true;
    }
    
    /**
     * @dev Include address in fees (owner only)
     */
    function includeInFees(address account) external onlyOwner {
        isExcludedFromFees[account] = false;
    }
    
    /**
     * @dev Toggle fees on/off (owner only)
     */
    function toggleFees(bool enabled) external onlyOwner {
        feesEnabled = enabled;
        emit FeesToggled(enabled);
    }
    
    /**
     * @dev Get token statistics
     */
    function getTokenStats() external view returns (
        uint256 _totalSupply,
        uint256 _totalBurned,
        uint256 _totalFeesCollected,
        uint256 _transactionCount,
        uint256 _contractBalance,
        bool _feesEnabled
    ) {
        _totalSupply = totalSupply();
        _totalBurned = totalBurned;
        _totalFeesCollected = totalFeesCollected;
        _transactionCount = transactionCount;
        _contractBalance = balanceOf(address(this));
        _feesEnabled = feesEnabled;
    }
    
    /**
     * @dev Emergency withdraw (owner only)
     */
    function emergencyWithdraw() external onlyOwner {
        uint256 balance = balanceOf(address(this));
        if (balance > 0) {
            super._update(address(this), owner(), balance);
        }
    }
} 