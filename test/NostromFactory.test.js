const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");

const DAY = 86400n;
const ONE_BOT = ethers.parseEther("1");

describe("NostromFactory (multi-tenant)", function () {
  async function factoryFixture() {
    const [deployer, alice, bob, carol, keeper] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory("NostromFactory");
    const factory = await Factory.deploy();
    await factory.waitForDeployment();

    // Each user brings their own agent + recovery wallets.
    const aliceAgent = ethers.Wallet.createRandom().address;
    const aliceRecovery = ethers.Wallet.createRandom().address;
    const bobAgent = ethers.Wallet.createRandom().address;
    const bobRecovery = ethers.Wallet.createRandom().address;

    return {
      factory,
      deployer,
      alice,
      bob,
      carol,
      keeper,
      aliceAgent,
      aliceRecovery,
      bobAgent,
      bobRecovery,
    };
  }

  /** Helper: create a vault and return a typed handle to it. */
  async function createVault(factory, signer, agent, recovery, timeout = DAY) {
    const tx = await factory.connect(signer).createVault(agent, recovery, timeout);
    const receipt = await tx.wait();

    const log = receipt.logs
      .map((l) => {
        try {
          return factory.interface.parseLog(l);
        } catch {
          return null;
        }
      })
      .find((l) => l && l.name === "VaultCreated");

    const vaultAddress = log.args.vault;
    const vault = await ethers.getContractAt("NostromVault", vaultAddress);
    return { vault, vaultAddress, receipt };
  }

  // =========================================================================
  describe("Factory deployment", function () {
    it("deploys a locked implementation and starts with an empty registry", async function () {
      const { factory } = await loadFixture(factoryFixture);

      const impl = await factory.implementation();
      expect(impl).to.not.equal(ethers.ZeroAddress);
      expect(await factory.totalVaults()).to.equal(0n);

      // The implementation must never be usable as a vault.
      const implementation = await ethers.getContractAt("NostromVault", impl);
      expect(await implementation.isInitialized()).to.equal(false);
      await expect(
        implementation.initialize(
          ethers.Wallet.createRandom().address,
          ethers.Wallet.createRandom().address,
          ethers.Wallet.createRandom().address,
          DAY
        )
      ).to.be.revertedWithCustomError(implementation, "AlreadyInitialized");
    });

    it("has no owner or admin surface", async function () {
      const { factory } = await loadFixture(factoryFixture);

      // Nothing on the ABI should let anyone privilege themselves.
      const names = factory.interface.fragments
        .filter((f) => f.type === "function")
        .map((f) => f.name);

      for (const forbidden of ["owner", "transferOwnership", "setFee", "pause", "upgradeTo"]) {
        expect(names).to.not.include(forbidden);
      }
    });
  });

  // =========================================================================
  describe("Vault creation", function () {
    it("gives the caller a vault they own", async function () {
      const { factory, alice, aliceAgent, aliceRecovery } = await loadFixture(factoryFixture);

      const { vault, vaultAddress } = await createVault(factory, alice, aliceAgent, aliceRecovery);

      expect(await vault.owner()).to.equal(alice.address);
      expect(await vault.agentAddress()).to.equal(aliceAgent);
      expect(await vault.recoveryAddress()).to.equal(aliceRecovery);
      expect(await vault.timeoutPeriod()).to.equal(DAY);
      expect(await vault.isInitialized()).to.equal(true);
      expect(await vault.factory()).to.equal(await factory.getAddress());

      expect(await factory.isVault(vaultAddress)).to.equal(true);
      expect(await factory.totalVaults()).to.equal(1n);
    });

    it("emits VaultCreated with the creation parameters", async function () {
      const { factory, alice, aliceAgent, aliceRecovery } = await loadFixture(factoryFixture);

      await expect(factory.connect(alice).createVault(aliceAgent, aliceRecovery, DAY))
        .to.emit(factory, "VaultCreated")
        .withArgs(anyAddress, alice.address, aliceAgent, aliceRecovery, DAY, 0n, 0n);
    });

    it("records immutable creation metadata", async function () {
      const { factory, alice, aliceAgent, aliceRecovery } = await loadFixture(factoryFixture);
      const { vaultAddress } = await createVault(factory, alice, aliceAgent, aliceRecovery);

      const record = await factory.getVaultRecord(vaultAddress);
      expect(record.creator).to.equal(alice.address);
      expect(record.vaultIndex).to.equal(0n);
      expect(record.createdAt).to.be.closeTo(BigInt(await time.latest()), 5n);
    });

    it("rejects registry queries for addresses it did not create", async function () {
      const { factory, carol } = await loadFixture(factoryFixture);

      await expect(factory.getVaultRecord(carol.address)).to.be.revertedWithCustomError(
        factory,
        "NotANostromVault"
      );
      await expect(factory.getVaultSnapshot(carol.address)).to.be.revertedWithCustomError(
        factory,
        "NotANostromVault"
      );
      expect(await factory.isVault(carol.address)).to.equal(false);
    });

    it("creates and funds in one transaction", async function () {
      const { factory, alice, aliceAgent, aliceRecovery } = await loadFixture(factoryFixture);

      const tx = await factory
        .connect(alice)
        .createVaultAndFund(aliceAgent, aliceRecovery, DAY, { value: ONE_BOT * 3n });
      const receipt = await tx.wait();

      const created = receipt.logs
        .map((l) => {
          try {
            return factory.interface.parseLog(l);
          } catch {
            return null;
          }
        })
        .find((l) => l && l.name === "VaultCreated");

      expect(created.args.initialDeposit).to.equal(ONE_BOT * 3n);
      expect(await ethers.provider.getBalance(created.args.vault)).to.equal(ONE_BOT * 3n);
    });

    it("propagates the vault's own validation rules", async function () {
      const { factory, alice, aliceAgent } = await loadFixture(factoryFixture);
      const impl = await ethers.getContractAt("NostromVault", await factory.implementation());

      // recovery == agent
      await expect(
        factory.connect(alice).createVault(aliceAgent, aliceAgent, DAY)
      ).to.be.revertedWithCustomError(impl, "InvalidAddress");

      // zero addresses
      await expect(
        factory.connect(alice).createVault(ethers.ZeroAddress, aliceAgent, DAY)
      ).to.be.revertedWithCustomError(impl, "ZeroAddress");

      // timeout out of bounds
      await expect(
        factory.connect(alice).createVault(aliceAgent, ethers.Wallet.createRandom().address, 5)
      ).to.be.revertedWithCustomError(impl, "InvalidTimeoutPeriod");
      await expect(
        factory.connect(alice).createVault(aliceAgent, ethers.Wallet.createRandom().address, 366n * DAY)
      ).to.be.revertedWithCustomError(impl, "InvalidTimeoutPeriod");
    });

    it("clones are dramatically cheaper than a full vault deployment", async function () {
      const { factory, alice, aliceAgent, aliceRecovery } = await loadFixture(factoryFixture);

      const { receipt } = await createVault(factory, alice, aliceAgent, aliceRecovery);
      const cloneGas = receipt.gasUsed;

      // Cost of deploying the standalone vault logic outright, for comparison.
      const Vault = await ethers.getContractFactory("NostromVault");
      const direct = await Vault.deploy();
      const directReceipt = await ethers.provider.getTransactionReceipt(
        direct.deploymentTransaction().hash
      );

      console.log(
        `        clone+init+register: ${cloneGas} gas | full implementation deploy: ${directReceipt.gasUsed} gas`
      );
      expect(cloneGas).to.be.lessThan(directReceipt.gasUsed / 2n);
    });
  });

  // =========================================================================
  describe("Multi-tenant isolation", function () {
    it("gives different users different vaults", async function () {
      const { factory, alice, bob, aliceAgent, aliceRecovery, bobAgent, bobRecovery } =
        await loadFixture(factoryFixture);

      const a = await createVault(factory, alice, aliceAgent, aliceRecovery);
      const b = await createVault(factory, bob, bobAgent, bobRecovery, 2n * DAY);

      expect(a.vaultAddress).to.not.equal(b.vaultAddress);
      expect(await a.vault.owner()).to.equal(alice.address);
      expect(await b.vault.owner()).to.equal(bob.address);

      // Configuration is per-vault, not shared through the implementation.
      expect(await a.vault.timeoutPeriod()).to.equal(DAY);
      expect(await b.vault.timeoutPeriod()).to.equal(2n * DAY);
      expect(await a.vault.agentAddress()).to.equal(aliceAgent);
      expect(await b.vault.agentAddress()).to.equal(bobAgent);
    });

    it("keeps balances completely separate", async function () {
      const { factory, alice, bob, aliceAgent, aliceRecovery, bobAgent, bobRecovery } =
        await loadFixture(factoryFixture);

      const a = await createVault(factory, alice, aliceAgent, aliceRecovery);
      const b = await createVault(factory, bob, bobAgent, bobRecovery);

      await alice.sendTransaction({ to: a.vaultAddress, value: ONE_BOT * 5n });
      await bob.sendTransaction({ to: b.vaultAddress, value: ONE_BOT * 2n });

      expect(await a.vault.vaultBalance()).to.equal(ONE_BOT * 5n);
      expect(await b.vault.vaultBalance()).to.equal(ONE_BOT * 2n);
    });

    it("stops one user from withdrawing another user's funds", async function () {
      const { factory, alice, bob, aliceAgent, aliceRecovery } = await loadFixture(factoryFixture);

      const a = await createVault(factory, alice, aliceAgent, aliceRecovery);
      await alice.sendTransaction({ to: a.vaultAddress, value: ONE_BOT * 5n });

      await expect(a.vault.connect(bob).withdrawByOwner(ONE_BOT))
        .to.be.revertedWithCustomError(a.vault, "NotOwner")
        .withArgs(bob.address);

      await expect(a.vault.connect(bob).withdrawAllByOwner()).to.be.revertedWithCustomError(
        a.vault,
        "NotOwner"
      );
      await expect(
        a.vault.connect(bob).updateRecoveryAddress(bob.address)
      ).to.be.revertedWithCustomError(a.vault, "NotOwner");
      await expect(a.vault.connect(bob).ping()).to.be.revertedWithCustomError(a.vault, "NotAgent");

      expect(await a.vault.vaultBalance()).to.equal(ONE_BOT * 5n);
    });

    it("triggering one vault leaves every other vault untouched", async function () {
      const { factory, alice, bob, keeper, aliceAgent, aliceRecovery, bobAgent, bobRecovery } =
        await loadFixture(factoryFixture);

      const a = await createVault(factory, alice, aliceAgent, aliceRecovery);
      const b = await createVault(factory, bob, bobAgent, bobRecovery, 365n * DAY);

      await alice.sendTransaction({ to: a.vaultAddress, value: ONE_BOT * 5n });
      await bob.sendTransaction({ to: b.vaultAddress, value: ONE_BOT * 9n });

      await time.increase(DAY + 1n);

      const recoveryBefore = await ethers.provider.getBalance(aliceRecovery);
      await a.vault.connect(keeper).executeDeadManSwitch();

      // Alice's vault drained to Alice's cold wallet.
      expect(await ethers.provider.getBalance(aliceRecovery)).to.equal(recoveryBefore + ONE_BOT * 5n);
      expect(await a.vault.isTriggered()).to.equal(true);
      expect(await a.vault.vaultBalance()).to.equal(0n);

      // Bob's vault is entirely unaffected.
      expect(await b.vault.isTriggered()).to.equal(false);
      expect(await b.vault.vaultBalance()).to.equal(ONE_BOT * 9n);
      expect(await ethers.provider.getBalance(bobRecovery)).to.equal(0n);
      await expect(b.vault.connect(keeper).executeDeadManSwitch()).to.be.revertedWithCustomError(
        b.vault,
        "AgentStillAlive"
      );
    });

    it("lets one user hold many independent vaults", async function () {
      const { factory, alice, aliceRecovery } = await loadFixture(factoryFixture);

      const agents = [0, 1, 2].map(() => ethers.Wallet.createRandom().address);
      for (const agent of agents) {
        await createVault(factory, alice, agent, aliceRecovery);
      }

      expect(await factory.vaultCountOf(alice.address)).to.equal(3n);
      const vaults = await factory.vaultsOf(alice.address);
      expect(new Set(vaults).size).to.equal(3);
    });
  });

  // =========================================================================
  describe("Clone safety", function () {
    it("cannot be initialised twice", async function () {
      const { factory, alice, bob, aliceAgent, aliceRecovery } = await loadFixture(factoryFixture);
      const { vault } = await createVault(factory, alice, aliceAgent, aliceRecovery);

      // An attacker trying to seize a live vault by re-initialising it.
      await expect(
        vault.connect(bob).initialize(bob.address, aliceAgent, aliceRecovery, DAY)
      ).to.be.revertedWithCustomError(vault, "AlreadyInitialized");

      expect(await vault.owner()).to.equal(alice.address);
    });

    it("an uninitialised clone cannot be griefed into a triggered state", async function () {
      const { factory, carol } = await loadFixture(factoryFixture);

      const Spawner = await ethers.getContractFactory("RawCloneSpawner");
      const spawner = await Spawner.deploy();

      const tx = await spawner.spawn(await factory.implementation());
      const receipt = await tx.wait();
      const spawnedLog = receipt.logs
        .map((l) => {
          try {
            return spawner.interface.parseLog(l);
          } catch {
            return null;
          }
        })
        .find((l) => l && l.name === "Spawned");

      const raw = await ethers.getContractAt("NostromVault", spawnedLog.args.clone);
      expect(await raw.isInitialized()).to.equal(false);

      // timeoutPeriod is 0, so without the guard the deadline would already have
      // passed and anyone could flip isTriggered before the owner configured it.
      await expect(raw.connect(carol).executeDeadManSwitch()).to.be.revertedWithCustomError(
        raw,
        "NotInitialized"
      );
      expect(await raw.isTriggered()).to.equal(false);
      expect(await raw.isExecutable()).to.equal(false);

      // It is still initialisable afterwards, i.e. not bricked.
      const agent = ethers.Wallet.createRandom().address;
      const recovery = ethers.Wallet.createRandom().address;
      await raw.connect(carol).initialize(carol.address, agent, recovery, DAY);
      expect(await raw.owner()).to.equal(carol.address);
      expect(await raw.isTriggered()).to.equal(false);
    });

    it("delegates state correctly: implementation storage stays empty", async function () {
      const { factory, alice, aliceAgent, aliceRecovery } = await loadFixture(factoryFixture);
      const { vault } = await createVault(factory, alice, aliceAgent, aliceRecovery);

      await alice.sendTransaction({ to: await vault.getAddress(), value: ONE_BOT });

      const impl = await ethers.getContractAt("NostromVault", await factory.implementation());
      expect(await impl.owner()).to.equal(ethers.ZeroAddress);
      expect(await impl.agentAddress()).to.equal(ethers.ZeroAddress);
      expect(await impl.timeoutPeriod()).to.equal(0n);
      expect(await ethers.provider.getBalance(await impl.getAddress())).to.equal(0n);
    });
  });

  // =========================================================================
  describe("Deterministic (CREATE2) creation", function () {
    it("predicts the vault address before creating it", async function () {
      const { factory, alice, aliceAgent, aliceRecovery } = await loadFixture(factoryFixture);
      const salt = ethers.id("alice-vault-1");

      const predicted = await factory.predictVaultAddress(alice.address, salt);
      await factory.connect(alice).createVaultDeterministic(aliceAgent, aliceRecovery, DAY, salt);

      expect(await factory.isVault(predicted)).to.equal(true);
      const vault = await ethers.getContractAt("NostromVault", predicted);
      expect(await vault.owner()).to.equal(alice.address);
    });

    it("lets a vault be pre-funded before it exists", async function () {
      const { factory, alice, aliceAgent, aliceRecovery } = await loadFixture(factoryFixture);
      const salt = ethers.id("prefund");

      const predicted = await factory.predictVaultAddress(alice.address, salt);

      // Money sent to an address that holds no code yet.
      await alice.sendTransaction({ to: predicted, value: ONE_BOT * 4n });
      expect(await ethers.provider.getBalance(predicted)).to.equal(ONE_BOT * 4n);

      await factory.connect(alice).createVaultDeterministic(aliceAgent, aliceRecovery, DAY, salt);

      const vault = await ethers.getContractAt("NostromVault", predicted);
      expect(await vault.vaultBalance()).to.equal(ONE_BOT * 4n);
      expect(await vault.owner()).to.equal(alice.address);
    });

    it("namespaces salts per creator so addresses cannot be squatted", async function () {
      const { factory, alice, bob, aliceAgent, aliceRecovery, bobAgent, bobRecovery } =
        await loadFixture(factoryFixture);
      const salt = ethers.id("same-salt");

      const aliceAddr = await factory.predictVaultAddress(alice.address, salt);
      const bobAddr = await factory.predictVaultAddress(bob.address, salt);
      expect(aliceAddr).to.not.equal(bobAddr);

      // Both can use the identical salt without colliding.
      await factory.connect(alice).createVaultDeterministic(aliceAgent, aliceRecovery, DAY, salt);
      await factory.connect(bob).createVaultDeterministic(bobAgent, bobRecovery, DAY, salt);

      expect(await factory.isVault(aliceAddr)).to.equal(true);
      expect(await factory.isVault(bobAddr)).to.equal(true);
    });

    it("refuses to reuse a salt", async function () {
      const { factory, alice, aliceAgent, aliceRecovery } = await loadFixture(factoryFixture);
      const salt = ethers.id("once-only");

      await factory.connect(alice).createVaultDeterministic(aliceAgent, aliceRecovery, DAY, salt);
      await expect(
        factory.connect(alice).createVaultDeterministic(aliceAgent, aliceRecovery, DAY, salt)
      ).to.be.revertedWithCustomError(factory, "VaultAlreadyExists");
    });
  });

  // =========================================================================
  describe("Registry and batch reads", function () {
    async function populatedFixture() {
      const base = await factoryFixture();
      const { factory, alice, bob, aliceRecovery, bobRecovery } = base;

      const vaults = [];
      for (let i = 0; i < 4; i += 1) {
        const signer = i % 2 === 0 ? alice : bob;
        const recovery = i % 2 === 0 ? aliceRecovery : bobRecovery;
        const created = await createVault(
          factory,
          signer,
          ethers.Wallet.createRandom().address,
          recovery
        );
        vaults.push(created);
      }
      return { ...base, vaults };
    }

    it("paginates the global list", async function () {
      const { factory, vaults } = await loadFixture(populatedFixture);
      expect(await factory.totalVaults()).to.equal(4n);

      const first = await factory.getVaults(0, 2);
      expect(first).to.deep.equal(vaults.slice(0, 2).map((v) => v.vaultAddress));

      const second = await factory.getVaults(2, 2);
      expect(second).to.deep.equal(vaults.slice(2, 4).map((v) => v.vaultAddress));

      // Overshooting the end truncates instead of reverting.
      expect(await factory.getVaults(3, 100)).to.have.lengthOf(1);
      expect(await factory.getVaults(99, 10)).to.have.lengthOf(0);
    });

    it("validates page limits", async function () {
      const { factory } = await loadFixture(populatedFixture);

      await expect(factory.getVaults(0, 0)).to.be.revertedWithCustomError(
        factory,
        "InvalidPageLimit"
      );
      await expect(factory.getVaults(0, 501)).to.be.revertedWithCustomError(
        factory,
        "InvalidPageLimit"
      );
      expect(await factory.MAX_PAGE_LIMIT()).to.equal(500n);
    });

    it("indexes vaults per creator", async function () {
      const { factory, alice, bob } = await loadFixture(populatedFixture);

      expect(await factory.vaultCountOf(alice.address)).to.equal(2n);
      expect(await factory.vaultCountOf(bob.address)).to.equal(2n);

      const alicePage = await factory.getVaultsOf(alice.address, 0, 10);
      expect(alicePage).to.have.lengthOf(2);
      for (const v of alicePage) {
        const vault = await ethers.getContractAt("NostromVault", v);
        expect(await vault.owner()).to.equal(alice.address);
      }
    });

    it("batches live snapshots in one call", async function () {
      const { factory, vaults, alice } = await loadFixture(populatedFixture);

      await alice.sendTransaction({ to: vaults[0].vaultAddress, value: ONE_BOT });

      const addresses = vaults.map((v) => v.vaultAddress);
      const snapshots = await factory.getVaultsSnapshot(addresses);

      expect(snapshots).to.have.lengthOf(4);
      expect(snapshots[0].vault).to.equal(addresses[0]);
      expect(snapshots[0].balance).to.equal(ONE_BOT);
      expect(snapshots[0].timeoutPeriod).to.equal(DAY);
      expect(snapshots[0].isTriggered).to.equal(false);
      expect(snapshots[0].secondsRemaining).to.be.greaterThan(0n);
    });

    it("zeroes unknown addresses in a batch instead of reverting the page", async function () {
      const { factory, vaults, carol } = await loadFixture(populatedFixture);

      const snapshots = await factory.getVaultsSnapshot([
        vaults[0].vaultAddress,
        carol.address, // not a vault
      ]);

      expect(snapshots[0].vault).to.equal(vaults[0].vaultAddress);
      expect(snapshots[1].vault).to.equal(ethers.ZeroAddress);
      expect(snapshots[1].owner).to.equal(ethers.ZeroAddress);
    });

    it("reports only the vaults a keeper can actually rescue", async function () {
      const { factory, alice, bob, aliceRecovery } = await loadFixture(factoryFixture);

      // Two short-timeout vaults and one long-timeout vault.
      const short1 = await createVault(
        factory,
        alice,
        ethers.Wallet.createRandom().address,
        aliceRecovery,
        60n
      );
      const short2 = await createVault(
        factory,
        alice,
        ethers.Wallet.createRandom().address,
        aliceRecovery,
        60n
      );
      const long = await createVault(
        factory,
        bob,
        ethers.Wallet.createRandom().address,
        ethers.Wallet.createRandom().address,
        365n * DAY
      );

      let [executable, scanned] = await factory.getExecutableVaults(0, 100);
      expect(executable).to.have.lengthOf(0);
      expect(scanned).to.equal(3n);

      await time.increase(61n);

      [executable, scanned] = await factory.getExecutableVaults(0, 100);
      expect(scanned).to.equal(3n);
      // Spread: ethers returns a frozen Result array that chai cannot sort in place.
      expect([...executable]).to.have.members([short1.vaultAddress, short2.vaultAddress]);
      expect([...executable]).to.not.include(long.vaultAddress);
    });

    it("drops vaults from the executable list once they have fired", async function () {
      const { factory, alice, keeper, aliceRecovery } = await loadFixture(factoryFixture);

      const { vault, vaultAddress } = await createVault(
        factory,
        alice,
        ethers.Wallet.createRandom().address,
        aliceRecovery,
        60n
      );

      await time.increase(61n);
      let [executable] = await factory.getExecutableVaults(0, 10);
      expect(executable).to.deep.equal([vaultAddress]);

      await vault.connect(keeper).executeDeadManSwitch();

      [executable] = await factory.getExecutableVaults(0, 10);
      expect(executable).to.have.lengthOf(0);
    });
  });

  // =========================================================================
  describe("End-to-end lifecycle on a cloned vault", function () {
    it("runs the full heartbeat then rescue flow", async function () {
      const { factory, alice, keeper } = await loadFixture(factoryFixture);

      // A real agent signer so it can actually send ping().
      const agent = ethers.Wallet.createRandom().connect(ethers.provider);
      await alice.sendTransaction({ to: agent.address, value: ONE_BOT });
      const recovery = ethers.Wallet.createRandom().address;

      const { vault, vaultAddress } = await createVault(factory, alice, agent.address, recovery, 300n);
      await alice.sendTransaction({ to: vaultAddress, value: ONE_BOT * 6n });

      // Healthy: heartbeats keep pushing the deadline out.
      for (let i = 1; i <= 3; i += 1) {
        await time.increase(100n);
        await vault.connect(agent).ping();
        expect(await vault.pingCount()).to.equal(BigInt(i));
        expect(await vault.timeUntilTrigger()).to.equal(300n);
      }

      await expect(vault.connect(keeper).executeDeadManSwitch()).to.be.revertedWithCustomError(
        vault,
        "AgentStillAlive"
      );

      // Owner can still operate normally.
      await vault.connect(alice).withdrawByOwner(ONE_BOT);
      expect(await vault.vaultBalance()).to.equal(ONE_BOT * 5n);

      // Agent dies.
      await time.increase(301n);
      expect(await vault.isExecutable()).to.equal(true);

      const before = await ethers.provider.getBalance(recovery);
      await expect(vault.connect(keeper).executeDeadManSwitch()).to.emit(
        vault,
        "DeadManSwitchTriggered"
      );
      expect(await ethers.provider.getBalance(recovery)).to.equal(before + ONE_BOT * 5n);

      // Frozen afterwards.
      await expect(vault.connect(alice).withdrawByOwner(1n)).to.be.revertedWithCustomError(
        vault,
        "SwitchAlreadyTriggered"
      );
      await expect(vault.connect(agent).ping()).to.be.revertedWithCustomError(
        vault,
        "SwitchAlreadyTriggered"
      );

      // Owner can rearm for reuse.
      await vault.connect(alice).rearm();
      expect(await vault.isTriggered()).to.equal(false);
      await vault.connect(agent).ping();
    });

    it("rescues tracked ERC-20 balances from a clone", async function () {
      const { factory, alice, keeper } = await loadFixture(factoryFixture);

      const recovery = ethers.Wallet.createRandom().address;
      const { vault, vaultAddress } = await createVault(
        factory,
        alice,
        ethers.Wallet.createRandom().address,
        recovery,
        60n
      );

      const Token = await ethers.getContractFactory("MockERC20");
      const token = await Token.deploy("Test USD", "TUSD");
      const amount = ethers.parseUnits("250", 18);
      await token.mint(vaultAddress, amount);

      await vault.connect(alice).addTrackedToken(await token.getAddress());
      expect(await vault.trackedTokenCount()).to.equal(1n);

      await time.increase(61n);
      await expect(vault.connect(keeper).executeDeadManSwitch()).to.emit(vault, "TokenRescued");

      expect(await token.balanceOf(recovery)).to.equal(amount);
      expect(await token.balanceOf(vaultAddress)).to.equal(0n);
    });
  });

  // =========================================================================
  describe("Proxy funding behaviour (documented caveat)", function () {
    it("accepts wallet transfers and deposit() calls", async function () {
      const { factory, alice, aliceAgent, aliceRecovery } = await loadFixture(factoryFixture);
      const { vault, vaultAddress } = await createVault(factory, alice, aliceAgent, aliceRecovery);

      // Plain EOA transfer with a normal gas limit.
      await expect(alice.sendTransaction({ to: vaultAddress, value: ONE_BOT })).to.emit(
        vault,
        "VaultFunded"
      );

      // Explicit deposit().
      await expect(vault.connect(alice).deposit({ value: ONE_BOT })).to.emit(vault, "VaultFunded");
      expect(await vault.vaultBalance()).to.equal(ONE_BOT * 2n);
    });

    it("rejects a 2300-gas stipend transfer but works via deposit() or call", async function () {
      const { factory, alice, aliceAgent, aliceRecovery } = await loadFixture(factoryFixture);
      const { vault, vaultAddress } = await createVault(factory, alice, aliceAgent, aliceRecovery);

      const Sender = await ethers.getContractFactory("StipendSender");
      const sender = await Sender.deploy();

      // Solidity's transfer() forwards only 2300 gas, which is not enough for a
      // delegatecall through the proxy plus an event. This is inherent to
      // EIP-1167 clones and is why deposit() is the documented path.
      await expect(sender.sendViaTransfer(vaultAddress, { value: ONE_BOT })).to.be.reverted;

      // Both supported paths work.
      await sender.sendViaCall(vaultAddress, { value: ONE_BOT });
      await sender.depositInto(vaultAddress, { value: ONE_BOT });
      expect(await vault.vaultBalance()).to.equal(ONE_BOT * 2n);
    });
  });
});

/** Matcher placeholder for an address we do not want to pin exactly. */
const anyAddress = (value) => ethers.isAddress(value);
