const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

const DAY = 86400n;
const ONE_BOT = ethers.parseEther("1");

describe("Nostrom", function () {
  async function deployFixture() {
    const [owner, agent, recovery, keeper, outsider] = await ethers.getSigners();

    const Nostrom = await ethers.getContractFactory("Nostrom");
    const nostrom = await Nostrom.deploy(agent.address, recovery.address, DAY);
    await nostrom.waitForDeployment();

    return { nostrom, owner, agent, recovery, keeper, outsider };
  }

  async function fundedFixture() {
    const base = await deployFixture();
    await base.owner.sendTransaction({ to: await base.nostrom.getAddress(), value: ONE_BOT * 10n });
    return base;
  }

  // -------------------------------------------------------------------------
  describe("Deployment", function () {
    it("stores constructor arguments and starts the heartbeat clock", async function () {
      const { nostrom, owner, agent, recovery } = await loadFixture(deployFixture);

      expect(await nostrom.owner()).to.equal(owner.address);
      expect(await nostrom.agentAddress()).to.equal(agent.address);
      expect(await nostrom.recoveryAddress()).to.equal(recovery.address);
      expect(await nostrom.timeoutPeriod()).to.equal(DAY);
      expect(await nostrom.isTriggered()).to.equal(false);
      expect(await nostrom.lastPingTime()).to.equal(BigInt(await time.latest()));
    });

    it("rejects zero addresses", async function () {
      const [, agent, recovery] = await ethers.getSigners();
      const Nostrom = await ethers.getContractFactory("Nostrom");

      await expect(Nostrom.deploy(ethers.ZeroAddress, recovery.address, DAY))
        .to.be.revertedWithCustomError(Nostrom, "ZeroAddress")
        .withArgs("agentAddress");

      await expect(Nostrom.deploy(agent.address, ethers.ZeroAddress, DAY))
        .to.be.revertedWithCustomError(Nostrom, "ZeroAddress")
        .withArgs("recoveryAddress");
    });

    it("refuses a recovery address equal to the agent (hot key must not be the cold wallet)", async function () {
      const [, agent] = await ethers.getSigners();
      const Nostrom = await ethers.getContractFactory("Nostrom");

      await expect(Nostrom.deploy(agent.address, agent.address, DAY))
        .to.be.revertedWithCustomError(Nostrom, "InvalidAddress")
        .withArgs("recoveryAddress");
    });

    it("enforces timeout bounds", async function () {
      const [, agent, recovery] = await ethers.getSigners();
      const Nostrom = await ethers.getContractFactory("Nostrom");

      await expect(Nostrom.deploy(agent.address, recovery.address, 10)).to.be.revertedWithCustomError(
        Nostrom,
        "InvalidTimeoutPeriod"
      );

      await expect(
        Nostrom.deploy(agent.address, recovery.address, 366n * DAY)
      ).to.be.revertedWithCustomError(Nostrom, "InvalidTimeoutPeriod");
    });
  });

  // -------------------------------------------------------------------------
  describe("Heartbeat", function () {
    it("lets the agent ping and pushes the deadline forward", async function () {
      const { nostrom, agent } = await loadFixture(deployFixture);

      const before = await nostrom.lastPingTime();
      await time.increase(1000);
      await expect(nostrom.connect(agent).ping()).to.emit(nostrom, "Heartbeat");

      expect(await nostrom.lastPingTime()).to.be.greaterThan(before);
      expect(await nostrom.pingCount()).to.equal(1n);
      expect(await nostrom.timeUntilTrigger()).to.equal(DAY);
    });

    it("rejects pings from anyone but the agent", async function () {
      const { nostrom, owner, outsider } = await loadFixture(deployFixture);

      // Even the owner cannot fake a heartbeat: liveness must come from the agent.
      await expect(nostrom.connect(owner).ping())
        .to.be.revertedWithCustomError(nostrom, "NotAgent")
        .withArgs(owner.address);

      await expect(nostrom.connect(outsider).ping()).to.be.revertedWithCustomError(nostrom, "NotAgent");
    });

    it("freezes pings once the switch has fired", async function () {
      const { nostrom, agent, keeper } = await loadFixture(fundedFixture);

      await time.increase(DAY + 1n);
      await nostrom.connect(keeper).executeDeadManSwitch();

      await expect(nostrom.connect(agent).ping()).to.be.revertedWithCustomError(
        nostrom,
        "SwitchAlreadyTriggered"
      );
    });
  });

  // -------------------------------------------------------------------------
  describe("Deposits and owner withdrawals", function () {
    it("accepts plain transfers and deposit()", async function () {
      const { nostrom, owner, outsider } = await loadFixture(deployFixture);
      const vault = await nostrom.getAddress();

      await expect(owner.sendTransaction({ to: vault, value: ONE_BOT })).to.emit(nostrom, "VaultFunded");
      await expect(nostrom.connect(outsider).deposit({ value: ONE_BOT })).to.emit(nostrom, "VaultFunded");

      expect(await nostrom.vaultBalance()).to.equal(ONE_BOT * 2n);
    });

    it("lets the owner withdraw during normal operation", async function () {
      const { nostrom, owner } = await loadFixture(fundedFixture);

      await expect(nostrom.connect(owner).withdrawByOwner(ONE_BOT * 3n)).to.changeEtherBalance(
        owner,
        ONE_BOT * 3n
      );
      expect(await nostrom.vaultBalance()).to.equal(ONE_BOT * 7n);

      await expect(nostrom.connect(owner).withdrawAllByOwner()).to.changeEtherBalance(owner, ONE_BOT * 7n);
      expect(await nostrom.vaultBalance()).to.equal(0n);
    });

    it("blocks withdrawals above the balance and from non-owners", async function () {
      const { nostrom, agent, outsider } = await loadFixture(fundedFixture);

      await expect(nostrom.withdrawByOwner(ONE_BOT * 99n)).to.be.revertedWithCustomError(
        nostrom,
        "InsufficientBalance"
      );

      await expect(nostrom.connect(outsider).withdrawByOwner(ONE_BOT)).to.be.revertedWithCustomError(
        nostrom,
        "NotOwner"
      );

      // The agent key is intentionally powerless over funds.
      await expect(nostrom.connect(agent).withdrawByOwner(ONE_BOT)).to.be.revertedWithCustomError(
        nostrom,
        "NotOwner"
      );
    });

    it("blocks owner withdrawals after the switch fires", async function () {
      const { nostrom, owner, keeper } = await loadFixture(fundedFixture);

      await time.increase(DAY + 1n);
      await nostrom.connect(keeper).executeDeadManSwitch();

      await expect(nostrom.connect(owner).withdrawByOwner(ONE_BOT)).to.be.revertedWithCustomError(
        nostrom,
        "SwitchAlreadyTriggered"
      );
    });
  });

  // -------------------------------------------------------------------------
  describe("executeDeadManSwitch", function () {
    it("reverts while the agent is still within its window", async function () {
      const { nostrom, keeper } = await loadFixture(fundedFixture);

      await expect(nostrom.connect(keeper).executeDeadManSwitch()).to.be.revertedWithCustomError(
        nostrom,
        "AgentStillAlive"
      );

      // Exactly at the deadline is still alive: the spec requires strictly greater than.
      const deadline = await nostrom.executionDeadline();
      await time.setNextBlockTimestamp(deadline);
      await expect(nostrom.connect(keeper).executeDeadManSwitch()).to.be.revertedWithCustomError(
        nostrom,
        "AgentStillAlive"
      );

      // One second past it, the switch fires.
      await time.setNextBlockTimestamp(deadline + 1n);
      await expect(nostrom.connect(keeper).executeDeadManSwitch()).to.emit(
        nostrom,
        "DeadManSwitchTriggered"
      );
    });

    it("evacuates the full balance to the recovery address one second past the deadline", async function () {
      const { nostrom, recovery, keeper } = await loadFixture(fundedFixture);
      const amount = await nostrom.vaultBalance();

      await time.increase(DAY + 1n);

      await expect(nostrom.connect(keeper).executeDeadManSwitch()).to.changeEtherBalances(
        [recovery, nostrom],
        [amount, -amount]
      );

      expect(await nostrom.isTriggered()).to.equal(true);
      expect(await nostrom.vaultBalance()).to.equal(0n);
    });

    it("emits DeadManSwitchTriggered with the rescued amount", async function () {
      const { nostrom, recovery, keeper } = await loadFixture(fundedFixture);
      const amount = await nostrom.vaultBalance();

      await time.increase(DAY + 1n);
      const tx = await nostrom.connect(keeper).executeDeadManSwitch();
      const block = await ethers.provider.getBlock(tx.blockNumber);

      await expect(tx)
        .to.emit(nostrom, "DeadManSwitchTriggered")
        .withArgs(recovery.address, amount, block.timestamp);
    });

    it("is permissionless: any address can fire it", async function () {
      const { nostrom, outsider, recovery } = await loadFixture(fundedFixture);
      const amount = await nostrom.vaultBalance();

      await time.increase(DAY + 1n);

      // A total stranger with no relationship to the vault.
      await expect(nostrom.connect(outsider).executeDeadManSwitch()).to.changeEtherBalance(
        recovery,
        amount
      );
    });

    it("cannot be fired twice", async function () {
      const { nostrom, keeper } = await loadFixture(fundedFixture);

      await time.increase(DAY + 1n);
      await nostrom.connect(keeper).executeDeadManSwitch();

      await expect(nostrom.connect(keeper).executeDeadManSwitch()).to.be.revertedWithCustomError(
        nostrom,
        "SwitchAlreadyTriggered"
      );
    });

    it("succeeds on an empty vault and still marks it triggered", async function () {
      const { nostrom, recovery, keeper } = await loadFixture(deployFixture);

      await time.increase(DAY + 1n);
      await expect(nostrom.connect(keeper).executeDeadManSwitch())
        .to.emit(nostrom, "DeadManSwitchTriggered")
        .withArgs(recovery.address, 0n, anyValue);

      expect(await nostrom.isTriggered()).to.equal(true);
    });

    it("a ping resets the countdown and defuses a pending execution", async function () {
      const { nostrom, agent, keeper } = await loadFixture(fundedFixture);

      await time.increase(DAY - 60n);
      await nostrom.connect(agent).ping();
      await time.increase(DAY - 60n);

      // Without the ping this would have been executable long ago.
      await expect(nostrom.connect(keeper).executeDeadManSwitch()).to.be.revertedWithCustomError(
        nostrom,
        "AgentStillAlive"
      );
    });

    it("reverts atomically when the recovery address rejects funds, so it can be retried", async function () {
      const [owner, agent] = await ethers.getSigners();

      const Rejecting = await ethers.getContractFactory("RejectingRecipient");
      const rejecting = await Rejecting.deploy();

      const Nostrom = await ethers.getContractFactory("Nostrom");
      const nostrom = await Nostrom.deploy(agent.address, await rejecting.getAddress(), DAY);
      await owner.sendTransaction({ to: await nostrom.getAddress(), value: ONE_BOT });

      await time.increase(DAY + 1n);
      await expect(nostrom.executeDeadManSwitch()).to.be.revertedWithCustomError(
        nostrom,
        "NativeTransferFailed"
      );

      // Critically: state rolled back, so the switch is still armed rather than bricked.
      expect(await nostrom.isTriggered()).to.equal(false);
      expect(await nostrom.vaultBalance()).to.equal(ONE_BOT);
    });

    it("resists reentrancy from a hostile recovery address", async function () {
      const [owner, agent] = await ethers.getSigners();

      const Nostrom = await ethers.getContractFactory("Nostrom");
      // Deploy with a placeholder, then point recovery at the attacker.
      const nostrom = await Nostrom.deploy(agent.address, owner.address, DAY);

      const Reentrant = await ethers.getContractFactory("ReentrantRecipient");
      const attacker = await Reentrant.deploy(await nostrom.getAddress());
      await nostrom.updateRecoveryAddress(await attacker.getAddress());

      await owner.sendTransaction({ to: await nostrom.getAddress(), value: ONE_BOT * 5n });
      await time.increase(DAY + 1n);

      await nostrom.executeDeadManSwitch();

      // Exactly the deposited amount moved: no double drain.
      expect(await ethers.provider.getBalance(await attacker.getAddress())).to.equal(ONE_BOT * 5n);
      expect(await nostrom.vaultBalance()).to.equal(0n);
      expect(await attacker.attempts()).to.equal(1n);
    });
  });

  // -------------------------------------------------------------------------
  describe("ERC-20 rescue", function () {
    async function tokenFixture() {
      const base = await fundedFixture();
      const Token = await ethers.getContractFactory("MockERC20");
      const token = await Token.deploy("Test USD", "TUSD");
      await token.mint(await base.nostrom.getAddress(), ethers.parseUnits("500", 18));
      return { ...base, token };
    }

    it("sweeps tracked tokens to the recovery address on trigger", async function () {
      const { nostrom, token, recovery, keeper } = await loadFixture(tokenFixture);
      const vault = await nostrom.getAddress();
      const tokenAddress = await token.getAddress();

      await nostrom.addTrackedToken(tokenAddress);
      expect(await nostrom.isTokenTracked(tokenAddress)).to.equal(true);

      const balance = await token.balanceOf(vault);
      await time.increase(DAY + 1n);

      await expect(nostrom.connect(keeper).executeDeadManSwitch())
        .to.emit(nostrom, "TokenRescued")
        .withArgs(tokenAddress, recovery.address, balance);

      expect(await token.balanceOf(recovery.address)).to.equal(balance);
      expect(await token.balanceOf(vault)).to.equal(0n);
    });

    it("still rescues native BOT when a tracked token reverts on transfer", async function () {
      const { nostrom, token, recovery, keeper } = await loadFixture(tokenFixture);
      const nativeAmount = await nostrom.vaultBalance();

      await nostrom.addTrackedToken(await token.getAddress());
      await token.setTransferReverts(true); // hostile / broken token

      await time.increase(DAY + 1n);

      const before = await ethers.provider.getBalance(recovery.address);
      await expect(nostrom.connect(keeper).executeDeadManSwitch()).to.emit(nostrom, "TokenRescueFailed");
      const after = await ethers.provider.getBalance(recovery.address);

      // The broken token is skipped, the native rescue still completes.
      expect(after - before).to.equal(nativeAmount);
      expect(await nostrom.isTriggered()).to.equal(true);
    });

    it("treats a token returning false as a skipped rescue, not a failed trigger", async function () {
      const { nostrom, token, keeper } = await loadFixture(tokenFixture);

      await nostrom.addTrackedToken(await token.getAddress());
      await token.setTransferReturnsFalse(true);

      await time.increase(DAY + 1n);
      await expect(nostrom.connect(keeper).executeDeadManSwitch()).to.emit(nostrom, "TokenRescueFailed");
      expect(await nostrom.isTriggered()).to.equal(true);
    });

    it("survives a token whose balanceOf reverts", async function () {
      const { nostrom, recovery, keeper } = await loadFixture(fundedFixture);
      const nativeAmount = await nostrom.vaultBalance();

      const Bad = await ethers.getContractFactory("RevertingBalanceToken");
      const bad = await Bad.deploy();
      await nostrom.addTrackedToken(await bad.getAddress());

      await time.increase(DAY + 1n);

      const before = await ethers.provider.getBalance(recovery.address);
      await expect(nostrom.connect(keeper).executeDeadManSwitch()).to.emit(nostrom, "TokenRescueFailed");
      const after = await ethers.provider.getBalance(recovery.address);

      expect(after - before).to.equal(nativeAmount);
    });

    it("does not brick the rescue when a token returns a non-bool word", async function () {
      const { nostrom, recovery, keeper } = await loadFixture(fundedFixture);
      const nativeAmount = await nostrom.vaultBalance();

      const Bad = await ethers.getContractFactory("MalformedReturnToken");
      const bad = await Bad.deploy();
      await bad.mint(await nostrom.getAddress(), 1000n);
      await nostrom.addTrackedToken(await bad.getAddress());

      await time.increase(DAY + 1n);

      // abi.decode(..., (bool)) reverts on a word like 0x0100..00, which would
      // have propagated out of the sweep loop and blocked the native rescue.
      const before = await ethers.provider.getBalance(recovery.address);
      await expect(nostrom.connect(keeper).executeDeadManSwitch()).to.emit(
        nostrom,
        "DeadManSwitchTriggered"
      );
      const after = await ethers.provider.getBalance(recovery.address);

      expect(after - before).to.equal(nativeAmount);
      expect(await nostrom.isTriggered()).to.equal(true);
    });

    it("treats a truncated return payload as a failed rescue", async function () {
      const { nostrom, recovery, keeper } = await loadFixture(fundedFixture);
      const nativeAmount = await nostrom.vaultBalance();

      const Bad = await ethers.getContractFactory("ShortReturnToken");
      const bad = await Bad.deploy();
      await bad.mint(await nostrom.getAddress(), 1000n);
      await nostrom.addTrackedToken(await bad.getAddress());

      await time.increase(DAY + 1n);

      const before = await ethers.provider.getBalance(recovery.address);
      await expect(nostrom.connect(keeper).executeDeadManSwitch()).to.emit(nostrom, "TokenRescueFailed");
      const after = await ethers.provider.getBalance(recovery.address);

      expect(after - before).to.equal(nativeAmount);
    });

    it("allows permissionless sweeping of untracked tokens after the trigger", async function () {
      const { nostrom, token, recovery, keeper, outsider } = await loadFixture(tokenFixture);
      const balance = await token.balanceOf(await nostrom.getAddress());

      // Never registered on the watchlist.
      await time.increase(DAY + 1n);
      await nostrom.connect(keeper).executeDeadManSwitch();

      await expect(nostrom.connect(outsider).sweepTokenToRecovery(await token.getAddress()))
        .to.emit(nostrom, "TokenRescued")
        .withArgs(await token.getAddress(), recovery.address, balance);

      expect(await token.balanceOf(recovery.address)).to.equal(balance);
    });

    it("sweeps post-trigger native dust to the recovery address", async function () {
      const { nostrom, owner, recovery, keeper, outsider } = await loadFixture(fundedFixture);

      await time.increase(DAY + 1n);
      await nostrom.connect(keeper).executeDeadManSwitch();

      await owner.sendTransaction({ to: await nostrom.getAddress(), value: ONE_BOT });
      await expect(nostrom.connect(outsider).sweepNativeToRecovery()).to.changeEtherBalance(
        recovery,
        ONE_BOT
      );
    });

    it("manages the tracked-token watchlist", async function () {
      const { nostrom, outsider } = await loadFixture(deployFixture);
      const Token = await ethers.getContractFactory("MockERC20");

      const a = await (await Token.deploy("A", "A")).getAddress();
      const b = await (await Token.deploy("B", "B")).getAddress();

      await nostrom.addTrackedToken(a);
      await nostrom.addTrackedToken(b);
      expect(await nostrom.trackedTokenCount()).to.equal(2n);

      await expect(nostrom.addTrackedToken(a)).to.be.revertedWithCustomError(
        nostrom,
        "TokenAlreadyTracked"
      );

      await expect(nostrom.connect(outsider).addTrackedToken(a)).to.be.revertedWithCustomError(
        nostrom,
        "NotOwner"
      );

      // Remove the first element to exercise the swap-and-pop path.
      await nostrom.removeTrackedToken(a);
      expect(await nostrom.trackedTokenCount()).to.equal(1n);
      expect(await nostrom.isTokenTracked(a)).to.equal(false);
      expect((await nostrom.trackedTokens())[0]).to.equal(b);

      await expect(nostrom.removeTrackedToken(a)).to.be.revertedWithCustomError(
        nostrom,
        "TokenNotTracked"
      );
    });
  });

  // -------------------------------------------------------------------------
  describe("Admin configuration", function () {
    it("updates the timeout period", async function () {
      const { nostrom } = await loadFixture(deployFixture);

      await expect(nostrom.updateTimeoutPeriod(2n * DAY))
        .to.emit(nostrom, "TimeoutPeriodUpdated")
        .withArgs(DAY, 2n * DAY);

      expect(await nostrom.timeoutPeriod()).to.equal(2n * DAY);
    });

    it("updates the recovery address and refuses unsafe values", async function () {
      const { nostrom, agent, outsider } = await loadFixture(deployFixture);

      await expect(nostrom.updateRecoveryAddress(outsider.address)).to.emit(
        nostrom,
        "RecoveryAddressUpdated"
      );
      expect(await nostrom.recoveryAddress()).to.equal(outsider.address);

      await expect(nostrom.updateRecoveryAddress(agent.address)).to.be.revertedWithCustomError(
        nostrom,
        "InvalidAddress"
      );
      await expect(
        nostrom.updateRecoveryAddress(await nostrom.getAddress())
      ).to.be.revertedWithCustomError(nostrom, "InvalidAddress");
    });

    it("rotates the agent key and grants the new agent a fresh window", async function () {
      const { nostrom, agent, outsider } = await loadFixture(deployFixture);

      await time.increase(DAY - 100n);
      await nostrom.updateAgentAddress(outsider.address);

      expect(await nostrom.agentAddress()).to.equal(outsider.address);
      // The incoming agent must not inherit a nearly-expired clock.
      expect(await nostrom.timeUntilTrigger()).to.equal(DAY);

      await expect(nostrom.connect(outsider).ping()).to.emit(nostrom, "Heartbeat");
      await expect(nostrom.connect(agent).ping()).to.be.revertedWithCustomError(nostrom, "NotAgent");
    });

    it("restricts every admin function to the owner", async function () {
      const { nostrom, outsider } = await loadFixture(deployFixture);

      await expect(nostrom.connect(outsider).updateTimeoutPeriod(DAY)).to.be.revertedWithCustomError(
        nostrom,
        "NotOwner"
      );
      await expect(
        nostrom.connect(outsider).updateRecoveryAddress(outsider.address)
      ).to.be.revertedWithCustomError(nostrom, "NotOwner");
      await expect(
        nostrom.connect(outsider).updateAgentAddress(outsider.address)
      ).to.be.revertedWithCustomError(nostrom, "NotOwner");
      await expect(
        nostrom.connect(outsider).transferOwnership(outsider.address)
      ).to.be.revertedWithCustomError(nostrom, "NotOwner");
    });

    it("transfers ownership", async function () {
      const { nostrom, owner, outsider } = await loadFixture(deployFixture);

      await expect(nostrom.transferOwnership(outsider.address))
        .to.emit(nostrom, "OwnershipTransferred")
        .withArgs(owner.address, outsider.address);

      expect(await nostrom.owner()).to.equal(outsider.address);
      await expect(nostrom.updateTimeoutPeriod(DAY)).to.be.revertedWithCustomError(nostrom, "NotOwner");
    });

    it("rearms a fired vault for reuse", async function () {
      const { nostrom, agent, keeper } = await loadFixture(fundedFixture);

      await time.increase(DAY + 1n);
      await nostrom.connect(keeper).executeDeadManSwitch();

      await expect(nostrom.rearm()).to.emit(nostrom, "SwitchRearmed");
      expect(await nostrom.isTriggered()).to.equal(false);
      expect(await nostrom.timeUntilTrigger()).to.equal(DAY);

      await expect(nostrom.connect(agent).ping()).to.emit(nostrom, "Heartbeat");
    });

    it("cannot rearm a vault that has not fired", async function () {
      const { nostrom } = await loadFixture(deployFixture);
      await expect(nostrom.rearm()).to.be.revertedWithCustomError(nostrom, "SwitchNotTriggered");
    });
  });

  // -------------------------------------------------------------------------
  describe("Views", function () {
    it("reports countdown and executability accurately", async function () {
      const { nostrom } = await loadFixture(fundedFixture);
      const deadline = await nostrom.executionDeadline();

      expect(await nostrom.isExecutable()).to.equal(false);
      expect(await nostrom.timeUntilTrigger()).to.equal(deadline - BigInt(await time.latest()));

      await time.increaseTo(deadline - 10n);
      expect(await nostrom.timeUntilTrigger()).to.equal(10n);
      expect(await nostrom.isExecutable()).to.equal(false);

      // At the deadline the countdown is exhausted but the switch is not yet armed.
      await time.increaseTo(deadline);
      expect(await nostrom.timeUntilTrigger()).to.equal(0n);
      expect(await nostrom.isExecutable()).to.equal(false);

      await time.increaseTo(deadline + 1n);
      expect(await nostrom.timeUntilTrigger()).to.equal(0n);
      expect(await nostrom.isExecutable()).to.equal(true);
    });

    it("returns a consistent status snapshot", async function () {
      const { nostrom, owner, agent, recovery } = await loadFixture(fundedFixture);
      const s = await nostrom.status();

      expect(s.vaultOwner).to.equal(owner.address);
      expect(s.agent).to.equal(agent.address);
      expect(s.recovery).to.equal(recovery.address);
      expect(s.balance).to.equal(ONE_BOT * 10n);
      expect(s.timeout).to.equal(DAY);
      expect(s.deadline).to.equal(s.lastPing + DAY);
      expect(s.triggered).to.equal(false);
      expect(s.executable).to.equal(false);
    });
  });
});
