const { expect } = require("chai");
const { ethers } = require("hardhat");

async function deploySeeded() {
  const [owner, user] = await ethers.getSigners();
  const Token = await ethers.getContractFactory("ShineToken");
  const token = await Token.deploy();
  const LP = await ethers.getContractFactory("ShineLP");
  const lp = await LP.deploy(await token.getAddress());
  await token.excludeFromFees(await lp.getAddress());

  // Seed: 10 ETH + 200k SHINE from owner
  const seedShine = ethers.parseUnits("200000", 18);
  await token.approve(await lp.getAddress(), seedShine);
  await lp.addLiquidity(seedShine, { value: ethers.parseEther("10") });
  // Fund user with SHINE + ETH (hardhat default accounts have ETH)
  await token.transfer(user.address, ethers.parseUnits("50000", 18));
  return { owner, user, token, lp };
}

describe("ShineSwap audit fixes", function () {
  it("quotes via getAmountOut/getReserves match swap output", async function () {
    const { lp } = await deploySeeded();
    const [ethR, shineR] = await lp.getReserves();
    expect(ethR).to.equal(ethers.parseEther("10"));
    const amountIn = ethers.parseEther("1");
    const quoted = await lp.getAmountOut(amountIn, ethR, shineR);
    await expect(lp.swapETHForShine(quoted, Math.floor(Date.now() / 1000) + 600, { value: amountIn }))
      .to.emit(lp, "SwapETHForShine");
  });

  it("reverts on slippage (minAmountOut too high)", async function () {
    const { lp } = await deploySeeded();
    const [ethR, shineR] = await lp.getReserves();
    const quoted = await lp.getAmountOut(ethers.parseEther("1"), ethR, shineR);
    await expect(
      lp.swapETHForShine(quoted + 1n, Math.floor(Date.now() / 1000) + 600, { value: ethers.parseEther("1") })
    ).to.be.revertedWith("Slippage: output below minimum");
  });

  it("reverts on expired deadline", async function () {
    const { lp } = await deploySeeded();
    await expect(
      lp.swapETHForShine(0, Math.floor(Date.now() / 1000) - 10, { value: ethers.parseEther("0.1") })
    ).to.be.revertedWith("Swap expired");
  });

  it("SHINE->ETH swap works with allowance + minAmountOut", async function () {
    const { user, token, lp } = await deploySeeded();
    const amount = ethers.parseUnits("1000", 18);
    await token.connect(user).approve(await lp.getAddress(), amount);
    await expect(lp.connect(user).swapShineForETH(amount, 0, Math.floor(Date.now() / 1000) + 600))
      .to.emit(lp, "SwapShineForETH");
  });

  it("fee-on-transfer with LP excluded does not break swaps", async function () {
    const { user, token, lp } = await deploySeeded();
    await token.toggleFees(true, await lp.getAddress());
    expect(await token.feesEnabled()).to.equal(true);
    // user->user transfer above threshold pays fee
    const balBefore = await token.balanceOf(user.address);
    await token.connect(user).transfer(user.address, ethers.parseUnits("1000", 18));
    // self-transfer: still fee math but net same for self; check contract accrued
    expect(await token.balanceOf(await token.getAddress())).to.be.gt(0);
    // swap still works (LP is fee-exempt)
    const amount = ethers.parseUnits("1000", 18);
    await token.connect(user).approve(await lp.getAddress(), amount);
    await expect(lp.connect(user).swapShineForETH(amount, 0, Math.floor(Date.now() / 1000) + 600))
      .to.emit(lp, "SwapShineForETH");
    expect(balBefore).to.be.gt(0);
  });

  it("enabling fees with non-exempt LP reverts", async function () {
    const { token, lp } = await deploySeeded();
    await token.includeInFees(await lp.getAddress());
    await expect(token["toggleFees(bool,address)"](true, await lp.getAddress()))
      .to.be.revertedWith("LP must be fee-exempt first");
  });

  it("addLiquidity pulls SHINE + ETH and emits real amounts", async function () {
    const { token, lp } = await deploySeeded();
    const extra = ethers.parseUnits("1000", 18);
    await token.approve(await lp.getAddress(), extra);
    await expect(lp.addLiquidity(extra, { value: ethers.parseEther("0.5") }))
      .to.emit(lp, "LiquidityAdded");
    const [ethR] = await lp.getReserves();
    expect(ethR).to.equal(ethers.parseEther("10.5"));
  });

  it("non-owner cannot add/remove liquidity", async function () {
    const { user, lp } = await deploySeeded();
    await expect(lp.connect(user).addLiquidity(0, { value: 1 })).to.be.reverted;
    await expect(lp.connect(user).removeLiquidity(1, 1)).to.be.reverted;
  });
});
