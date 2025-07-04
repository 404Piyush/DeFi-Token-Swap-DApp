# 🌞 $SHINE Token - "You Are My Sunshine" LeBron Meme Token

![LeBron SHINE Token](lebron.png)

## 🏀 About
$SHINE is a meme token inspired by the viral [LeBron James "You Are My Sunshine" TikTok trend](https://knowyourmeme.com/memes/lebron-james-you-are-my-sunshine-edits). This wholesome meme celebrates LeBron's positive energy and basketball greatness with the classic "You Are My Sunshine" song.

## 🚀 Features
- **LeBron-themed Design**: Beautiful UI inspired by Lakers colors and sunshine aesthetics
- **Web3 Integration**: Full MetaMask wallet connection and Sepolia testnet support
- **Swap Interface**: Demo swap functionality (ETH ↔ SHINE)
- **Real-time Stats**: Live token statistics and transaction tracking
- **Responsive Design**: Works perfectly on desktop and mobile
- **Automated Tokenomics**: Built-in fee system, auto-burn, and LP rewards

## 📁 Project Structure
```
token/
├── contracts/              # Smart contracts
│   └── ShineToken.sol      # Main SHINE token contract
├── scripts/                # Deployment scripts
│   └── deploy-final.js     # Production deployment
├── shine-dapp/            # Vite-based frontend dapp
│   ├── src/
│   │   ├── main.js        # Main app logic
│   │   └── style.css      # LeBron-themed styling
│   ├── public/
│   │   └── lebron.png     # Token icon
│   └── index.html         # App entry point
├── test/                  # Contract tests
└── deployment/           # Deployment artifacts
```

## 🛠️ Tech Stack
- **Smart Contract**: Solidity + OpenZeppelin + Hardhat
- **Frontend**: Vite + Vanilla JS + Ethers.js
- **Network**: Sepolia Testnet
- **Styling**: Custom CSS with Lakers/Sunshine theme

## 🎯 Quick Start

### 1. Install Dependencies
```bash
# Install contract dependencies
npm install

# Install dapp dependencies
cd shine-dapp
npm install
```

### 2. Start the Dapp
```bash
# In shine-dapp directory
npm run dev
```
The dapp will be available at `http://localhost:5173`

### 3. Connect Wallet
- Install MetaMask
- Switch to Sepolia testnet
- Get test ETH from [Sepolia Faucet](https://sepolia-faucet.pk910.de)
- Connect your wallet in the dapp

## 📦 Contract Deployment

### Current Status
The contract is compiled and ready for deployment. To deploy:

```bash
# Set up environment (create .env file)
PRIVATE_KEY=your_private_key_here
SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com

# Deploy to Sepolia
npx hardhat run scripts/deploy-final.js --network sepolia
```

### Contract Features
- **Total Supply**: 10,000,000 SHINE tokens
- **Auto-Burn**: 0.5% transaction fee (60% burned, 40% to LP)
- **Milestone Burns**: Every 10k transactions
- **Owner Controls**: Fee toggle, burn controls, LP management

## 🎨 Design Theme

### Colors
- **Sunshine Gold**: #FFD700 (Primary)
- **LeBron Purple**: #552583 (Lakers)
- **Basketball Orange**: #D2691E (Accent)
- **Warm Gradients**: Sunshine-inspired backgrounds

### Features
- Animated sunshine rays background
- Glowing effects on hover
- Lakers-inspired color scheme
- LeBron image as token icon
- Smooth animations and transitions

## 🔧 Development

### Contract Development
```bash
# Compile contracts
npx hardhat compile

# Run tests
npx hardhat test

# Local node
npx hardhat node
```

### Frontend Development
```bash
# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## 🌐 Live Features

### Currently Working
- ✅ Wallet connection (MetaMask)
- ✅ Network switching (auto-adds Sepolia)
- ✅ Balance display (ETH + SHINE)
- ✅ Swap interface (demo mode)
- ✅ Token statistics display
- ✅ Responsive design
- ✅ LeBron meme theme

### Next Steps
- 🔲 Deploy SHINE contract
- 🔲 Implement real swapping (needs liquidity pool)
- 🔲 Add DEX functionality
- 🔲 Enable fee mechanisms
- 🔲 Launch on mainnet

## 🎮 How to Use

1. **Visit the dapp** at `http://localhost:5173`
2. **Connect MetaMask** - Will auto-switch to Sepolia
3. **Get test ETH** from the faucet link in the app
4. **Try the swap demo** - Shows how real swapping would work
5. **View stats** - See token information and contract details

## 🎯 Meme Reference

This token celebrates the [LeBron James "You Are My Sunshine" meme trend](https://knowyourmeme.com/memes/lebron-james-you-are-my-sunshine-edits) that went viral on TikTok. The trend features wholesome content with LeBron James paired with the classic "You Are My Sunshine" song, creating a perfect blend of basketball culture and feel-good vibes.

## 🚀 Deployment Status

**Contract**: Ready for deployment (needs private key setup)
**Frontend**: ✅ Live and functional
**Demo Mode**: ✅ Fully working swap interface
**Real Trading**: Pending contract deployment + liquidity

## 🔗 Links
- [Know Your Meme - LeBron Sunshine](https://knowyourmeme.com/memes/lebron-james-you-are-my-sunshine-edits)
- [Sepolia Etherscan](https://sepolia.etherscan.io)
- [Sepolia Faucet](https://sepolia-faucet.pk910.de)

---

*"You Are My Sunshine, My Only Sunshine" 🌞🏀* 