// Deploys ShineToken + ShineLP, excludes LP from fees, optionally seeds liquidity.
// Env: SEPOLIA_RPC_URL, PRIVATE_KEY (hardhat config), SEED_ETH, SEED_SHINE (optional)
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  console.log(`Deployer: ${deployer.address} on chain ${network.chainId}`);

  const Token = await ethers.getContractFactory("ShineToken");
  const token = await Token.deploy();
  await token.waitForDeployment();
  const tokenAddr = await token.getAddress();
  console.log(`ShineToken: ${tokenAddr}`);

  const LP = await ethers.getContractFactory("ShineLP");
  const lp = await LP.deploy(tokenAddr);
  await lp.waitForDeployment();
  const lpAddr = await lp.getAddress();
  console.log(`ShineLP: ${lpAddr}`);

  // Critical (audit H1): LP must be fee-exempt before fees are ever enabled.
  const tx = await token.excludeFromFees(lpAddr);
  await tx.wait();
  console.log(`Excluded LP from fees`);

  // Optional seed liquidity
  const seedEth = process.env.SEED_ETH || "0";
  const seedShine = process.env.SEED_SHINE || "0";
  if (seedEth !== "0" && seedShine !== "0") {
    const approveTx = await token.approve(lpAddr, ethers.parseUnits(seedShine, 18));
    await approveTx.wait();
    const addTx = await lp.addLiquidity(ethers.parseUnits(seedShine, 18), {
      value: ethers.parseEther(seedEth),
    });
    await addTx.wait();
    console.log(`Seeded ${seedEth} ETH + ${seedShine} SHINE`);
  }

  const deployBlock = await ethers.provider.getBlockNumber();
  const stamp = new Date().toISOString();

  const root = path.join(__dirname, "..");
  const write = (p, obj) => fs.writeFileSync(p, JSON.stringify(obj, null, 2) + "\n");

  write(path.join(root, "deployment", "contract-details.json"), {
    contractAddress: tokenAddr,
    network: Number(network.chainId) === 11155111 ? "sepolia" : `chain-${network.chainId}`,
    deployedAt: stamp,
    deployBlock,
    symbol: "SHINE",
    name: "Shine Token",
    decimals: 18,
    totalSupply: "10000000",
    etherscanUrl: `https://sepolia.etherscan.io/token/${tokenAddr}`,
  });

  write(path.join(root, "deployment", "lp-contract-details.json"), {
    contractAddress: lpAddr,
    shineTokenAddress: tokenAddr,
    network: Number(network.chainId) === 11155111 ? "sepolia" : `chain-${network.chainId}`,
    deployedAt: stamp,
    deployBlock,
    etherscanUrl: `https://sepolia.etherscan.io/address/${lpAddr}`,
  });

  // Sync frontend config (ABIs + addresses)
  const tokenArtifact = require("../artifacts/contracts/ShineToken.sol/ShineToken.json");
  const lpArtifact = require("../artifacts/contracts/ShineLP.sol/ShineLP.json");
  const cfg = path.join(root, "shine-swap-pro", "src", "config");
  write(path.join(cfg, "ShineToken.json"), { abi: tokenArtifact.abi });
  write(path.join(cfg, "ShineLP.json"), { abi: lpArtifact.abi });
  write(path.join(cfg, "lp-contract-details.json"), {
    contractAddress: lpAddr,
    shineTokenAddress: tokenAddr,
    network: "sepolia",
    deployedAt: stamp,
    deployBlock,
    etherscanUrl: `https://sepolia.etherscan.io/address/${lpAddr}`,
  });
  console.log("Frontend config synced");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
