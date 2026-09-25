// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  NOSTROM PROTOCOL — multi-tenant Dead-Man's Switch vaults for BOT Chain
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  This single file contains the whole protocol so it can be pasted straight
 *  into Remix:
 *
 *    1. Clones        — EIP-1167 minimal proxy helper (from OpenZeppelin v5)
 *    2. NostromVault  — the vault logic, one instance per user
 *    3. NostromFactory— deploy THIS one. It creates vaults for everybody.
 *
 *  ── How multi-tenancy works ────────────────────────────────────────────────
 *  You deploy `NostromFactory` exactly once. Its constructor also deploys a
 *  single `NostromVault` "implementation" that holds the logic but never any
 *  funds. After that, any user can call:
 *
 *      factory.createVault(myAgent, myColdWallet, 86400)
 *
 *  and receive their OWN vault contract at its own address, with themselves as
 *  owner. Each vault is a separate contract holding its own balance, so no
 *  user's funds are ever commingled with another's. The factory only keeps a
 *  registry so a frontend can find and display them.
 *
 *  Because vaults are EIP-1167 clones, creating one costs a small fraction of
 *  a full deployment — the clone is ~45 bytes of bytecode that delegates every
 *  call to the shared implementation.
 *
 *  ── Trust model ────────────────────────────────────────────────────────────
 *  The factory has NO owner, NO admin functions, NO fees and NO upgrade path.
 *  Once deployed it is immutable, so there is nothing for the deployer to
 *  abuse. Each vault trusts only its own owner.
 */

// ═══════════════════════════════════════════════════════════════════════════
//  1. Clones — EIP-1167 minimal proxy
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @dev Verbatim from OpenZeppelin Contracts v5.x (`proxy/Clones.sol`), inlined
 *      here so this file has no external imports. This assembly is widely
 *      audited and battle-tested; it is deliberately NOT hand-rolled.
 *
 *      https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/proxy/Clones.sol
 */
library Clones {
    error ERC1167FailedCreateClone();

    /// @dev Deploys an EIP-1167 minimal proxy pointing at `implementation`.
    function clone(address implementation) internal returns (address instance) {
        return clone(implementation, 0);
    }

    /// @dev Same as {clone}, forwarding `value` wei to the new proxy.
    function clone(address implementation, uint256 value) internal returns (address instance) {
        assembly ("memory-safe") {
            // Cleans the upper 96 bits of the `implementation` word, then packs the first 3 bytes
            // of the `implementation` address with the bytecode before the address.
            mstore(0x00, or(shr(0xe8, shl(0x60, implementation)), 0x3d602d80600a3d3981f3363d3d373d3d3d363d73000000))
            // Packs the remaining 17 bytes of `implementation` with the bytecode after the address.
            mstore(0x20, or(shl(0x78, implementation), 0x5af43d82803e903d91602b57fd5bf3))
            instance := create(value, 0x09, 0x37)
        }
        if (instance == address(0)) {
            revert ERC1167FailedCreateClone();
        }
    }

    /// @dev Deterministic (CREATE2) variant, so the address is known in advance.
    function cloneDeterministic(address implementation, bytes32 salt) internal returns (address instance) {
        return cloneDeterministic(implementation, salt, 0);
    }

    /// @dev Same as {cloneDeterministic}, forwarding `value` wei to the new proxy.
    function cloneDeterministic(
        address implementation,
        bytes32 salt,
        uint256 value
    ) internal returns (address instance) {
        assembly ("memory-safe") {
            mstore(0x00, or(shr(0xe8, shl(0x60, implementation)), 0x3d602d80600a3d3981f3363d3d373d3d3d363d73000000))
            mstore(0x20, or(shl(0x78, implementation), 0x5af43d82803e903d91602b57fd5bf3))
            instance := create2(value, 0x09, 0x37, salt)
        }
        if (instance == address(0)) {
            revert ERC1167FailedCreateClone();
        }
    }

    /// @dev Computes the address {cloneDeterministic} would produce.
    function predictDeterministicAddress(
        address implementation,
        bytes32 salt,
        address deployer
    ) internal pure returns (address predicted) {
        assembly ("memory-safe") {
            let ptr := mload(0x40)
            mstore(add(ptr, 0x38), deployer)
            mstore(add(ptr, 0x24), 0x5af43d82803e903d91602b57fd5bf3ff)
            mstore(add(ptr, 0x14), implementation)
            mstore(ptr, 0x3d602d80600a3d3981f3363d3d373d3d3d363d73)
            mstore(add(ptr, 0x58), salt)
            mstore(add(ptr, 0x78), keccak256(add(ptr, 0x0c), 0x37))
            predicted := and(keccak256(add(ptr, 0x43), 0x55), 0xffffffffffffffffffffffffffffffffffffffff)
        }
    }
}

/**
 * @dev Minimal ERC-20 surface used for emergency token rescue.
 */
interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
}

// ═══════════════════════════════════════════════════════════════════════════
//  2. NostromVault — one instance per user
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @title  NostromVault
 * @notice Dead-Man's Switch / Fail-Safe Vault for an autonomous AI agent treasury.
 *
 * @dev This is the clone-compatible version of the vault. EIP-1167 proxies
 *      cannot run a constructor, so configuration happens in {initialize},
 *      which the factory calls atomically in the same transaction as the clone.
 *
 *      Do NOT deploy this contract directly and expect to use it — deploy
 *      {NostromFactory} and call `createVault` instead. The copy the factory
 *      deploys as its implementation is permanently locked by its constructor
 *      and can never hold funds.
 *
 * ## Lifecycle
 *   1. Factory clones this logic and calls {initialize} with the user's config.
 *   2. Funds live in the clone. The agent calls {ping} on a schedule.
 *   3. If no ping arrives within `timeoutPeriod`, ANYONE may call
 *      {executeDeadManSwitch} and the balance is pushed to `recoveryAddress`.
 *
 * ## Security notes
 *   - {executeDeadManSwitch} follows checks-effects-interactions: `isTriggered`
 *     is set before any value transfer, so a hostile `recoveryAddress` cannot
 *     re-enter and drain twice.
 *   - Tracked ERC-20 sweeps are isolated so one malicious or broken token
 *     cannot brick the native-token rescue path.
 *   - Every fund-moving entry point requires initialisation, so an un-configured
 *     clone cannot be griefed into a triggered state.
 */
contract NostromVault {
    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error AlreadyInitialized();
    error NotInitialized();
    error NotOwner(address caller);
    error NotAgent(address caller);
    error SwitchAlreadyTriggered();
    error SwitchNotTriggered();
    error ZeroAddress(string field);
    error InvalidAddress(string field);
    error InvalidTimeoutPeriod(uint256 provided, uint256 min, uint256 max);
    error AgentStillAlive(uint256 secondsRemaining);
    error ZeroAmount();
    error InsufficientBalance(uint256 requested, uint256 available);
    error NativeTransferFailed(address to, uint256 amount);
    error TokenTransferFailed(address token, address to, uint256 amount);
    error TokenAlreadyTracked(address token);
    error TokenNotTracked(address token);
    error TrackedTokenLimitReached(uint256 limit);
    error NothingToSweep();

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event VaultInitialized(
        address indexed owner,
        address indexed agentAddress,
        address indexed recoveryAddress,
        uint256 timeoutPeriod,
        uint256 lastPingTime
    );

    /// @notice Funds arrived in the vault.
    event VaultFunded(address indexed from, uint256 amount, uint256 newBalance);

    /// @notice The agent proved it is alive. `deadline` is the new execution deadline.
    event Heartbeat(address indexed agent, uint256 timestamp, uint256 pingCount, uint256 deadline);

    /// @notice Owner pulled funds out during normal operation.
    event OwnerWithdrawal(address indexed to, uint256 amount);

    /// @notice The dead-man's switch fired. This is the event keepers/indexers watch.
    event DeadManSwitchTriggered(address indexed recoveryAddress, uint256 amountRescued, uint256 timestamp);

    /// @notice An ERC-20 balance was rescued to the recovery address.
    event TokenRescued(address indexed token, address indexed recoveryAddress, uint256 amount);

    /// @notice An ERC-20 rescue attempt failed and was skipped (non-fatal).
    event TokenRescueFailed(address indexed token);

    /// @notice Owner moved ERC-20 tokens during normal operation.
    event TokenWithdrawal(address indexed token, address indexed to, uint256 amount);

    /// @notice Post-trigger native dust was pushed to the recovery address.
    event NativeSwept(address indexed recoveryAddress, uint256 amount);

    event TimeoutPeriodUpdated(uint256 previousTimeout, uint256 newTimeout);
    event RecoveryAddressUpdated(address indexed previousRecovery, address indexed newRecovery);
    event AgentAddressUpdated(address indexed previousAgent, address indexed newAgent, uint256 lastPingTime);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event TrackedTokenAdded(address indexed token);
    event TrackedTokenRemoved(address indexed token);

    /// @notice The vault was put back into service after a trigger.
    event SwitchRearmed(address indexed owner, uint256 lastPingTime);

    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    /// @notice Floor on the timeout so block-timestamp drift can never race a heartbeat.
    uint256 public constant MIN_TIMEOUT_PERIOD = 30 seconds;

    /// @notice Ceiling on the timeout; a switch that can never fire is not a safety device.
    uint256 public constant MAX_TIMEOUT_PERIOD = 365 days;

    /// @notice Bound on the ERC-20 watchlist so {executeDeadManSwitch} stays inside the block gas limit.
    uint256 public constant MAX_TRACKED_TOKENS = 20;

    uint8 private constant _UNINITIALIZED = 0;
    uint8 private constant _READY = 1;
    uint8 private constant _LOCKED = type(uint8).max;

    // -------------------------------------------------------------------------
    // State
    //
    // Layout is deliberately packed: `_status`, `isTriggered` and `owner`
    // together occupy a single 32-byte slot (1 + 1 + 20 bytes).
    // -------------------------------------------------------------------------

    /// @dev Initialisation state machine: 0 = fresh clone, 1 = ready, 255 = permanently locked.
    uint8 private _status;

    /// @notice True once the fail-safe has fired. Normal vault operations are frozen.
    bool public isTriggered;

    /// @notice Vault owner / AI agent developer. Full control during normal operation.
    address public owner;

    /// @notice Wallet the AI agent signs heartbeats with. Can only call {ping}.
    address public agentAddress;

    /// @notice Cold wallet that receives everything if the agent goes dark.
    address public recoveryAddress;

    /// @notice Factory that created this vault. Informational; no runtime dependency.
    address public factory;

    /// @notice Seconds of silence tolerated before the switch may be executed.
    uint256 public timeoutPeriod;

    /**
     * @dev `_lastPingTime` and `_pingCount` share one storage slot so {ping} —
     *      by far the most frequent call in the protocol — costs a single
     *      SSTORE instead of two. Public getters below still expose uint256 so
     *      the ABI is unchanged. uint128 is far beyond any plausible timestamp
     *      or ping total.
     */
    uint128 private _lastPingTime;
    uint128 private _pingCount;

    /// @dev ERC-20 watchlist swept during {executeDeadManSwitch}.
    address[] private _trackedTokens;

    /// @dev token => 1-based index into `_trackedTokens` (0 means "not tracked").
    mapping(address => uint256) private _trackedTokenIndex;

    // -------------------------------------------------------------------------
    // Modifiers
    // -------------------------------------------------------------------------

    /// @dev Restricts to the AI agent's heartbeat key.
    modifier onlyAgent() {
        if (msg.sender != agentAddress) revert NotAgent(msg.sender);
        _;
    }

    /// @dev Restricts to the vault owner.
    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner(msg.sender);
        _;
    }

    /// @dev Normal-operation guard. Once the switch fires, the vault stops serving the owner.
    modifier whenNotTriggered() {
        if (isTriggered) revert SwitchAlreadyTriggered();
        _;
    }

    /// @dev Emergency-only guard.
    modifier whenTriggered() {
        if (!isTriggered) revert SwitchNotTriggered();
        _;
    }

    /**
     * @dev Blocks the permissionless entry points on an un-configured clone.
     *      Without this, a fresh clone has `timeoutPeriod == 0`, so its deadline
     *      would already be in the past and anyone could flip `isTriggered`
     *      before the owner ever configured it.
     */
    modifier whenInitialized() {
        if (_status != _READY) revert NotInitialized();
        _;
    }

    // -------------------------------------------------------------------------
    // A. Initialisation
    // -------------------------------------------------------------------------

    /**
     * @dev Permanently locks this copy. The factory deploys one instance as the
     *      shared implementation; that instance must never be usable as a vault.
     *      Clones never execute this constructor, so their `_status` starts at 0.
     */
    constructor() {
        _status = _LOCKED;
    }

    /**
     * @notice Configure a freshly created clone. Callable exactly once.
     * @dev    The factory calls this in the same transaction as the clone, so
     *         there is no window for anyone else to initialise it first. If you
     *         clone this implementation yourself, you MUST initialise in the
     *         same transaction for the same reason.
     *
     * @param _owner           Address that will control the vault.
     * @param _agentAddress    Wallet the AI agent uses to send heartbeats.
     * @param _recoveryAddress Cold wallet that receives funds on failure.
     * @param _timeoutPeriod   Seconds of silence tolerated (e.g. 86400 for 24h).
     */
    function initialize(
        address _owner,
        address _agentAddress,
        address _recoveryAddress,
        uint256 _timeoutPeriod
    ) external {
        if (_status != _UNINITIALIZED) revert AlreadyInitialized();

        if (_owner == address(0)) revert ZeroAddress("owner");
        if (_agentAddress == address(0)) revert ZeroAddress("agentAddress");
        if (_recoveryAddress == address(0)) revert ZeroAddress("recoveryAddress");

        // A recovery address pointing at the vault itself would make rescue a no-op.
        if (_recoveryAddress == address(this)) revert InvalidAddress("recoveryAddress");

        // The agent key is the hot/expendable key. If it were also the recovery
        // target, compromising the agent would compromise recovery.
        if (_recoveryAddress == _agentAddress) revert InvalidAddress("recoveryAddress");

        _validateTimeout(_timeoutPeriod);

        _status = _READY;
        owner = _owner;
        agentAddress = _agentAddress;
        recoveryAddress = _recoveryAddress;
        factory = msg.sender;
        timeoutPeriod = _timeoutPeriod;
        _lastPingTime = uint128(block.timestamp);

        emit OwnershipTransferred(address(0), _owner);
        emit VaultInitialized(_owner, _agentAddress, _recoveryAddress, _timeoutPeriod, block.timestamp);
    }

    /// @notice Whether this vault has been configured and is usable.
    function isInitialized() external view returns (bool) {
        return _status == _READY;
    }

    // -------------------------------------------------------------------------
    // B. Heartbeat mechanism (normal operation)
    // -------------------------------------------------------------------------

    /**
     * @notice Proof-of-life from the AI agent. Resets the countdown.
     * @dev    Called on a schedule by the agent runtime. Keep the interval well
     *         below `timeoutPeriod` (a third of it is a good rule of thumb) so a
     *         few missed transactions do not fire the switch.
     */
    function ping() external onlyAgent whenNotTriggered {
        uint256 timestamp = block.timestamp;
        uint256 newCount = uint256(_pingCount) + 1;

        _lastPingTime = uint128(timestamp);
        _pingCount = uint128(newCount);

        emit Heartbeat(msg.sender, timestamp, newCount, timestamp + timeoutPeriod);
    }

    // -------------------------------------------------------------------------
    // C. Deposits & normal withdrawals
    // -------------------------------------------------------------------------

    /**
     * @notice Accept native BOT deposits.
     * @dev    NOTE for contract integrators: this vault is an EIP-1167 proxy, so
     *         a plain transfer is forwarded by `delegatecall` and costs well over
     *         the 2300-gas stipend that Solidity's `transfer()`/`send()` forward.
     *         Sending from a wallet/EOA is fine, but another contract should call
     *         {deposit} or use `call` with an adequate gas budget.
     */
    receive() external payable {
        emit VaultFunded(msg.sender, msg.value, address(this).balance);
    }

    /**
     * @notice Explicit deposit entry point.
     * @dev    Preferred over a plain transfer: it is cheaper to reason about for
     *         contract callers and clearer in block explorers.
     */
    function deposit() external payable {
        if (msg.value == 0) revert ZeroAmount();
        emit VaultFunded(msg.sender, msg.value, address(this).balance);
    }

    /**
     * @notice Owner withdraws native BOT during normal operation.
     * @param _amount Amount in wei.
     */
    function withdrawByOwner(uint256 _amount) external onlyOwner whenNotTriggered {
        if (_amount == 0) revert ZeroAmount();

        uint256 balance = address(this).balance;
        if (_amount > balance) revert InsufficientBalance(_amount, balance);

        emit OwnerWithdrawal(owner, _amount);
        _sendNative(owner, _amount);
    }

    /// @notice Owner withdraws the entire native balance during normal operation.
    function withdrawAllByOwner() external onlyOwner whenNotTriggered {
        uint256 balance = address(this).balance;
        if (balance == 0) revert InsufficientBalance(0, 0);

        emit OwnerWithdrawal(owner, balance);
        _sendNative(owner, balance);
    }

    /**
     * @notice Owner moves ERC-20 tokens out during normal operation.
     * @param _token  Token contract.
     * @param _to     Destination.
     * @param _amount Amount in token base units.
     */
    function withdrawTokenByOwner(address _token, address _to, uint256 _amount)
        external
        onlyOwner
        whenNotTriggered
    {
        if (_token == address(0)) revert ZeroAddress("token");
        if (_to == address(0)) revert ZeroAddress("to");
        if (_amount == 0) revert ZeroAmount();

        emit TokenWithdrawal(_token, _to, _amount);

        if (!_tryTransferToken(_token, _to, _amount)) {
            revert TokenTransferFailed(_token, _to, _amount);
        }
    }

    // -------------------------------------------------------------------------
    // D. Fail-safe / recovery (emergency)
    // -------------------------------------------------------------------------

    /**
     * @notice Fire the dead-man's switch and evacuate the treasury.
     *
     * @dev PERMISSIONLESS — any address (keeper bot, watchtower, the owner, a
     *      bystander) may call this. That is the point: recovery must not depend
     *      on any single party being online. The caller cannot choose the
     *      destination, so there is no value to extract by calling it.
     *
     * Requires `block.timestamp - lastPingTime > timeoutPeriod`.
     *
     * Order of operations (checks-effects-interactions):
     *   1. Verify the agent has actually gone silent.
     *   2. Set `isTriggered = true`, freezing owner withdrawals and further
     *      heartbeats. Done BEFORE any transfer, so a malicious
     *      `recoveryAddress` cannot re-enter.
     *   3. Sweep every tracked ERC-20 balance to `recoveryAddress`
     *      (each isolated; a broken token cannot block the rescue).
     *   4. Sweep the full native balance to `recoveryAddress`.
     *   5. Emit {DeadManSwitchTriggered}.
     *
     * If the native transfer fails (e.g. the recovery address is a contract that
     * reverts on receive) the whole transaction reverts, leaving `isTriggered`
     * false so the switch can be fired again later. It never half-executes.
     */
    function executeDeadManSwitch() external whenInitialized whenNotTriggered {
        uint256 deadline = executionDeadline();
        if (block.timestamp <= deadline) {
            revert AgentStillAlive(deadline - block.timestamp);
        }

        // --- effects before interactions ---
        isTriggered = true;

        address recovery = recoveryAddress;
        uint256 amountRescued = address(this).balance;

        // --- interactions ---
        _sweepTrackedTokens(recovery);

        if (amountRescued > 0) {
            _sendNative(recovery, amountRescued);
        }

        emit DeadManSwitchTriggered(recovery, amountRescued, block.timestamp);
    }

    /**
     * @notice Push any native dust that arrived after the trigger to the recovery address.
     * @dev    Permissionless. Covers forced transfers and late refunds.
     */
    function sweepNativeToRecovery() external whenInitialized whenTriggered {
        uint256 balance = address(this).balance;
        if (balance == 0) revert NothingToSweep();

        address recovery = recoveryAddress;
        emit NativeSwept(recovery, balance);
        _sendNative(recovery, balance);
    }

    /**
     * @notice Push an ERC-20 balance to the recovery address after the trigger.
     * @dev    Permissionless, and works for tokens that were never on the
     *         watchlist. The destination is fixed, so this is safe to expose.
     * @param _token Token contract to sweep.
     */
    function sweepTokenToRecovery(address _token) external whenInitialized whenTriggered {
        if (_token == address(0)) revert ZeroAddress("token");

        uint256 balance = IERC20(_token).balanceOf(address(this));
        if (balance == 0) revert NothingToSweep();

        address recovery = recoveryAddress;
        emit TokenRescued(_token, recovery, balance);

        if (!_tryTransferToken(_token, recovery, balance)) {
            revert TokenTransferFailed(_token, recovery, balance);
        }
    }

    // -------------------------------------------------------------------------
    // E. Admin configuration
    // -------------------------------------------------------------------------

    /**
     * @notice Change how long silence is tolerated.
     * @dev    Shortening the timeout can make the vault immediately eligible for
     *         execution if the agent is already overdue. Check {timeUntilTrigger}
     *         first, or have the agent ping before tightening the window.
     */
    function updateTimeoutPeriod(uint256 _newTimeout) external onlyOwner whenNotTriggered {
        _validateTimeout(_newTimeout);

        uint256 previous = timeoutPeriod;
        timeoutPeriod = _newTimeout;
        emit TimeoutPeriodUpdated(previous, _newTimeout);
    }

    /// @notice Change the cold wallet that receives funds on failure.
    function updateRecoveryAddress(address _newRecovery) external onlyOwner whenNotTriggered {
        if (_newRecovery == address(0)) revert ZeroAddress("recoveryAddress");
        if (_newRecovery == address(this)) revert InvalidAddress("recoveryAddress");
        if (_newRecovery == agentAddress) revert InvalidAddress("recoveryAddress");

        address previous = recoveryAddress;
        recoveryAddress = _newRecovery;
        emit RecoveryAddressUpdated(previous, _newRecovery);
    }

    /**
     * @notice Rotate the agent's heartbeat key.
     * @dev    Also refreshes `lastPingTime`, giving the incoming agent a full
     *         timeout window to come online instead of inheriting a stale clock.
     */
    function updateAgentAddress(address _newAgent) external onlyOwner whenNotTriggered {
        if (_newAgent == address(0)) revert ZeroAddress("agentAddress");
        if (_newAgent == recoveryAddress) revert InvalidAddress("agentAddress");

        address previous = agentAddress;
        agentAddress = _newAgent;
        _lastPingTime = uint128(block.timestamp);

        emit AgentAddressUpdated(previous, _newAgent, block.timestamp);
    }

    /// @notice Hand the vault to a new owner.
    function transferOwnership(address _newOwner) external onlyOwner {
        if (_newOwner == address(0)) revert ZeroAddress("newOwner");

        address previous = owner;
        owner = _newOwner;
        emit OwnershipTransferred(previous, _newOwner);
    }

    /**
     * @notice Put a fired vault back into service.
     * @dev    Funds have already left for the recovery address; this only clears
     *         the frozen flag and restarts the clock so the vault can be reused
     *         with a fresh agent instead of creating a new one.
     */
    function rearm() external onlyOwner whenTriggered {
        isTriggered = false;
        _lastPingTime = uint128(block.timestamp);
        emit SwitchRearmed(msg.sender, block.timestamp);
    }

    /**
     * @notice Add an ERC-20 to the watchlist swept by {executeDeadManSwitch}.
     * @dev    Native BOT is always rescued; only ERC-20s need registering,
     *         because the EVM gives no way to enumerate a contract's token holdings.
     */
    function addTrackedToken(address _token) external onlyOwner {
        if (_token == address(0)) revert ZeroAddress("token");
        if (_trackedTokenIndex[_token] != 0) revert TokenAlreadyTracked(_token);
        if (_trackedTokens.length >= MAX_TRACKED_TOKENS) {
            revert TrackedTokenLimitReached(MAX_TRACKED_TOKENS);
        }

        _trackedTokens.push(_token);
        _trackedTokenIndex[_token] = _trackedTokens.length; // 1-based
        emit TrackedTokenAdded(_token);
    }

    /// @notice Remove an ERC-20 from the watchlist.
    function removeTrackedToken(address _token) external onlyOwner {
        uint256 indexPlusOne = _trackedTokenIndex[_token];
        if (indexPlusOne == 0) revert TokenNotTracked(_token);

        uint256 index = indexPlusOne - 1;
        uint256 lastIndex = _trackedTokens.length - 1;

        if (index != lastIndex) {
            address lastToken = _trackedTokens[lastIndex];
            _trackedTokens[index] = lastToken;
            _trackedTokenIndex[lastToken] = indexPlusOne;
        }

        _trackedTokens.pop();
        delete _trackedTokenIndex[_token];
        emit TrackedTokenRemoved(_token);
    }

    // -------------------------------------------------------------------------
    // Views
    // -------------------------------------------------------------------------

    /// @notice Timestamp of the most recent heartbeat.
    function lastPingTime() public view returns (uint256) {
        return _lastPingTime;
    }

    /// @notice Total heartbeats received. Useful for agent health dashboards.
    function pingCount() public view returns (uint256) {
        return _pingCount;
    }

    /// @notice Native BOT held by the vault.
    function vaultBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /// @notice Timestamp after which {executeDeadManSwitch} becomes callable.
    function executionDeadline() public view returns (uint256) {
        return uint256(_lastPingTime) + timeoutPeriod;
    }

    /// @notice Seconds of grace left. Zero means the switch is executable now.
    function timeUntilTrigger() public view returns (uint256) {
        uint256 deadline = executionDeadline();
        if (block.timestamp > deadline) return 0;
        return deadline - block.timestamp;
    }

    /// @notice Seconds since the last heartbeat.
    function timeSinceLastPing() external view returns (uint256) {
        return block.timestamp - _lastPingTime;
    }

    /// @notice True when the switch can be executed right now.
    function isExecutable() public view returns (bool) {
        return _status == _READY && !isTriggered && block.timestamp > executionDeadline();
    }

    /// @notice ERC-20 watchlist swept on trigger.
    function trackedTokens() external view returns (address[] memory) {
        return _trackedTokens;
    }

    /// @notice Number of tracked ERC-20s.
    function trackedTokenCount() external view returns (uint256) {
        return _trackedTokens.length;
    }

    /// @notice Whether a token is on the watchlist.
    function isTokenTracked(address _token) external view returns (bool) {
        return _trackedTokenIndex[_token] != 0;
    }

    /**
     * @notice One-call snapshot for agents, keepers and dashboards.
     */
    function status()
        external
        view
        returns (
            address vaultOwner,
            address agent,
            address recovery,
            uint256 balance,
            uint256 timeout,
            uint256 lastPing,
            uint256 deadline,
            uint256 secondsRemaining,
            bool triggered,
            bool executable,
            uint256 totalPings
        )
    {
        return (
            owner,
            agentAddress,
            recoveryAddress,
            address(this).balance,
            timeoutPeriod,
            _lastPingTime,
            executionDeadline(),
            timeUntilTrigger(),
            isTriggered,
            isExecutable(),
            _pingCount
        );
    }

    // -------------------------------------------------------------------------
    // Internals
    // -------------------------------------------------------------------------

    function _validateTimeout(uint256 _timeout) private pure {
        if (_timeout < MIN_TIMEOUT_PERIOD || _timeout > MAX_TIMEOUT_PERIOD) {
            revert InvalidTimeoutPeriod(_timeout, MIN_TIMEOUT_PERIOD, MAX_TIMEOUT_PERIOD);
        }
    }

    /// @dev Forwards all remaining gas so contract recipients (multisigs) work.
    function _sendNative(address _to, uint256 _amount) private {
        (bool ok, ) = _to.call{value: _amount}("");
        if (!ok) revert NativeTransferFailed(_to, _amount);
    }

    /**
     * @dev Non-reverting ERC-20 transfer.
     *      Handles the three shapes of token in the wild:
     *        - standard tokens returning `bool`
     *        - older tokens (e.g. early USDT-style) returning nothing on success
     *        - broken tokens returning malformed data
     *
     *      The return value is decoded as `uint256`, not `bool`, on purpose.
     *      `abi.decode(data, (bool))` reverts when the word is anything other
     *      than 0 or 1, and that revert would propagate out of the sweep loop
     *      and brick the native-token rescue.
     */
    function _tryTransferToken(address _token, address _to, uint256 _amount) private returns (bool) {
        (bool ok, bytes memory data) =
            _token.call(abi.encodeCall(IERC20.transfer, (_to, _amount)));

        if (!ok) return false;
        if (data.length == 0) return true; // no return value == success by convention
        if (data.length < 32) return false; // too short to be a meaningful response
        return abi.decode(data, (uint256)) != 0;
    }

    /**
     * @dev Best-effort sweep of every watchlisted ERC-20. Each token is
     *      isolated: a reverting `balanceOf`, a failing `transfer`, a token
     *      returning false, or a non-ERC-20 address is logged via
     *      {TokenRescueFailed} and skipped. The native rescue always proceeds.
     */
    function _sweepTrackedTokens(address _recovery) private {
        address[] memory tokens = _trackedTokens;
        uint256 length = tokens.length;

        for (uint256 i; i < length; ) {
            address token = tokens[i];

            uint256 balance;
            bool readOk = true;
            try IERC20(token).balanceOf(address(this)) returns (uint256 tokenBalance) {
                balance = tokenBalance;
            } catch {
                readOk = false;
            }

            if (!readOk) {
                emit TokenRescueFailed(token);
            } else if (balance > 0) {
                if (_tryTransferToken(token, _recovery, balance)) {
                    emit TokenRescued(token, _recovery, balance);
                } else {
                    emit TokenRescueFailed(token);
                }
            }

            unchecked {
                ++i;
            }
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  3. NostromFactory — deploy this one
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @title  NostromFactory
 * @notice Permissionless factory and registry for {NostromVault} instances.
 *
 * @dev Deploy this contract once per network. It deploys the shared vault
 *      implementation in its own constructor, then any user can mint their own
 *      vault as an EIP-1167 clone.
 *
 *      The factory is intentionally immutable and ownerless: no admin, no fees,
 *      no pause, no upgrade. There is nothing here for the deployer to abuse,
 *      which is what makes it safe for strangers to build on.
 *
 * ## Registry semantics — read this before building a frontend
 * `vaultsOf(creator)` is indexed by the address that CALLED `createVault`, and
 * that link never changes. It is not the same thing as "current owner": a vault
 * owner can hand the vault over with `transferOwnership`, and agent/recovery
 * addresses can be rotated too. The factory does not track those changes, on
 * purpose — mirroring mutable vault state into factory storage would cost every
 * user gas forever and couple the vault to the factory at runtime.
 *
 * For live state, read it from the vault itself. {getVaultsSnapshot} batches
 * that into a single call, and the vault emits events
 * (`OwnershipTransferred`, `AgentAddressUpdated`, `RecoveryAddressUpdated`) that
 * an indexer such as The Graph can follow.
 */
contract NostromFactory {
    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error NotANostromVault(address queried);
    error InvalidPageLimit(uint256 provided, uint256 max);
    error VaultAlreadyExists(address predicted);

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    /**
     * @notice A new vault was created.
     * @param vault           Address of the new vault clone.
     * @param creator         Address that called the factory (initial owner).
     * @param agentAddress    Heartbeat key configured at creation.
     * @param recoveryAddress Cold wallet configured at creation.
     * @param timeoutPeriod   Timeout configured at creation.
     * @param vaultIndex      Position in the global registry.
     * @param initialDeposit  Native BOT deposited during creation (0 if none).
     */
    event VaultCreated(
        address indexed vault,
        address indexed creator,
        address indexed agentAddress,
        address recoveryAddress,
        uint256 timeoutPeriod,
        uint256 vaultIndex,
        uint256 initialDeposit
    );

    // -------------------------------------------------------------------------
    // Constants & immutables
    // -------------------------------------------------------------------------

    /// @notice Upper bound on pagination page size, to keep view calls RPC-friendly.
    uint256 public constant MAX_PAGE_LIMIT = 500;

    /// @notice The shared vault logic every clone delegates to. Holds no funds, permanently locked.
    address public immutable implementation;

    // -------------------------------------------------------------------------
    // Registry
    // -------------------------------------------------------------------------

    /// @notice O(1) check that an address is a genuine vault from this factory.
    /// @dev    Frontends should gate on this to avoid users interacting with look-alike contracts.
    mapping(address => bool) public isVault;

    /// @dev Every vault ever created, in creation order.
    address[] private _allVaults;

    /// @dev Vaults grouped by the address that created them (immutable link).
    mapping(address => address[]) private _vaultsByCreator;

    /// @notice Creation metadata, keyed by vault address.
    struct VaultRecord {
        address creator;
        uint96 createdAt; // seconds since epoch; uint96 is ample and packs with `creator`
        uint256 vaultIndex;
    }

    mapping(address => VaultRecord) private _records;

    /// @notice Batched live view of a vault, assembled from the vault itself.
    struct VaultSnapshot {
        address vault;
        address owner;
        address agentAddress;
        address recoveryAddress;
        uint256 balance;
        uint256 timeoutPeriod;
        uint256 lastPingTime;
        uint256 executionDeadline;
        uint256 secondsRemaining;
        bool isTriggered;
        bool isExecutable;
        uint256 pingCount;
    }

    // -------------------------------------------------------------------------
    // Construction
    // -------------------------------------------------------------------------

    /**
     * @dev Deploys the shared implementation. Its constructor locks itself, so
     *      it can never be initialised or hold funds.
     */
    constructor() {
        implementation = address(new NostromVault());
    }

    // -------------------------------------------------------------------------
    // Vault creation
    // -------------------------------------------------------------------------

    /**
     * @notice Create a vault owned by the caller.
     *
     * @param _agentAddress    Wallet the caller's AI agent will send heartbeats from.
     * @param _recoveryAddress Cold wallet that receives funds if the agent goes dark.
     *                         Must differ from `_agentAddress`.
     * @param _timeoutPeriod   Seconds of silence tolerated. Between 30 and 365 days.
     * @return vault           Address of the caller's new vault.
     */
    function createVault(
        address _agentAddress,
        address _recoveryAddress,
        uint256 _timeoutPeriod
    ) external returns (address vault) {
        vault = Clones.clone(implementation);
        _setupVault(vault, _agentAddress, _recoveryAddress, _timeoutPeriod, 0);
    }

    /**
     * @notice Create a vault and fund it in the same transaction.
     * @dev    One signature instead of two — the path a frontend should use.
     */
    function createVaultAndFund(
        address _agentAddress,
        address _recoveryAddress,
        uint256 _timeoutPeriod
    ) external payable returns (address vault) {
        vault = Clones.clone(implementation);
        _setupVault(vault, _agentAddress, _recoveryAddress, _timeoutPeriod, msg.value);
    }

    /**
     * @notice Create a vault at an address you can compute in advance (CREATE2).
     * @dev    Lets a UI show the vault address, or let a user pre-fund it, before
     *         the creating transaction is mined. The salt is namespaced by
     *         `msg.sender` internally, so two users can pick the same salt and
     *         nobody can front-run somebody else's address.
     *
     * @param _salt Caller-chosen value. Reusing one you already used reverts.
     */
    function createVaultDeterministic(
        address _agentAddress,
        address _recoveryAddress,
        uint256 _timeoutPeriod,
        bytes32 _salt
    ) external payable returns (address vault) {
        bytes32 saltHash = _namespacedSalt(msg.sender, _salt);

        address predicted = Clones.predictDeterministicAddress(implementation, saltHash, address(this));
        if (isVault[predicted]) revert VaultAlreadyExists(predicted);

        vault = Clones.cloneDeterministic(implementation, saltHash);
        _setupVault(vault, _agentAddress, _recoveryAddress, _timeoutPeriod, msg.value);
    }

    /**
     * @notice Address that {createVaultDeterministic} will produce for `_creator` and `_salt`.
     */
    function predictVaultAddress(address _creator, bytes32 _salt) external view returns (address) {
        return
            Clones.predictDeterministicAddress(
                implementation,
                _namespacedSalt(_creator, _salt),
                address(this)
            );
    }

    // -------------------------------------------------------------------------
    // Registry views — global
    // -------------------------------------------------------------------------

    /// @notice Total vaults created by this factory.
    function totalVaults() external view returns (uint256) {
        return _allVaults.length;
    }

    /**
     * @notice Paginated list of every vault.
     * @param _offset Index to start at.
     * @param _limit  Maximum entries to return (cap {MAX_PAGE_LIMIT}).
     */
    function getVaults(uint256 _offset, uint256 _limit) external view returns (address[] memory page) {
        return _paginate(_allVaults, _offset, _limit);
    }

    /// @notice Creation metadata for a vault. Reverts if `_vault` is not from this factory.
    function getVaultRecord(address _vault)
        external
        view
        returns (address creator, uint256 createdAt, uint256 vaultIndex)
    {
        if (!isVault[_vault]) revert NotANostromVault(_vault);
        VaultRecord memory record = _records[_vault];
        return (record.creator, record.createdAt, record.vaultIndex);
    }

    // -------------------------------------------------------------------------
    // Registry views — per creator
    // -------------------------------------------------------------------------

    /// @notice How many vaults an address has created.
    function vaultCountOf(address _creator) external view returns (uint256) {
        return _vaultsByCreator[_creator].length;
    }

    /**
     * @notice Every vault created by `_creator`.
     * @dev    Unbounded. Prefer {getVaultsOf} for addresses with many vaults.
     */
    function vaultsOf(address _creator) external view returns (address[] memory) {
        return _vaultsByCreator[_creator];
    }

    /// @notice Paginated variant of {vaultsOf}.
    function getVaultsOf(
        address _creator,
        uint256 _offset,
        uint256 _limit
    ) external view returns (address[] memory page) {
        return _paginate(_vaultsByCreator[_creator], _offset, _limit);
    }

    // -------------------------------------------------------------------------
    // Live batch reads — what a dashboard and a keeper actually need
    // -------------------------------------------------------------------------

    /**
     * @notice Live snapshot of one vault, read from the vault itself.
     */
    function getVaultSnapshot(address _vault) public view returns (VaultSnapshot memory snapshot) {
        if (!isVault[_vault]) revert NotANostromVault(_vault);
        return _snapshot(_vault);
    }

    /**
     * @notice Live snapshots for many vaults in a single RPC call.
     * @dev    Turns an N-call dashboard render into one call. Unknown addresses
     *         are returned zeroed rather than reverting, so one bad entry cannot
     *         spoil a whole page.
     */
    function getVaultsSnapshot(address[] calldata _vaults)
        external
        view
        returns (VaultSnapshot[] memory snapshots)
    {
        snapshots = new VaultSnapshot[](_vaults.length);
        for (uint256 i; i < _vaults.length; ) {
            if (isVault[_vaults[i]]) {
                snapshots[i] = _snapshot(_vaults[i]);
            }
            unchecked {
                ++i;
            }
        }
    }

    /**
     * @notice Vaults whose dead-man's switch can be fired right now.
     * @dev    The primary query for a keeper bot: scan a page, then call
     *         `executeDeadManSwitch()` on whatever comes back. Returned array is
     *         trimmed to the number of hits.
     *
     * @param _offset Index into the global vault list.
     * @param _limit  How many vaults to examine (cap {MAX_PAGE_LIMIT}).
     * @return executable Vaults ready to be rescued.
     * @return scanned    How many vaults were examined, so callers can page on.
     */
    function getExecutableVaults(uint256 _offset, uint256 _limit)
        external
        view
        returns (address[] memory executable, uint256 scanned)
    {
        address[] memory page = _paginate(_allVaults, _offset, _limit);
        scanned = page.length;

        address[] memory buffer = new address[](scanned);
        uint256 hits;

        for (uint256 i; i < scanned; ) {
            // try/catch so a pathological vault cannot break the scan.
            try NostromVault(payable(page[i])).isExecutable() returns (bool ready) {
                if (ready) {
                    buffer[hits] = page[i];
                    unchecked {
                        ++hits;
                    }
                }
            } catch {
                // skip
            }
            unchecked {
                ++i;
            }
        }

        executable = new address[](hits);
        for (uint256 i; i < hits; ) {
            executable[i] = buffer[i];
            unchecked {
                ++i;
            }
        }
    }

    // -------------------------------------------------------------------------
    // Internals
    // -------------------------------------------------------------------------

    /// @dev Initialise, register and optionally fund a freshly cloned vault.
    function _setupVault(
        address _vault,
        address _agentAddress,
        address _recoveryAddress,
        uint256 _timeoutPeriod,
        uint256 _deposit
    ) private {
        // Same transaction as the clone, so nobody can initialise it first.
        // The vault itself validates the arguments and reverts on bad input.
        NostromVault(payable(_vault)).initialize(
            msg.sender,
            _agentAddress,
            _recoveryAddress,
            _timeoutPeriod
        );

        uint256 index = _allVaults.length;

        isVault[_vault] = true;
        _allVaults.push(_vault);
        _vaultsByCreator[msg.sender].push(_vault);
        _records[_vault] = VaultRecord({
            creator: msg.sender,
            createdAt: uint96(block.timestamp),
            vaultIndex: index
        });

        emit VaultCreated(
            _vault,
            msg.sender,
            _agentAddress,
            _recoveryAddress,
            _timeoutPeriod,
            index,
            _deposit
        );

        // Funded after registration so the vault's VaultFunded event lands last
        // and the vault is already discoverable if the deposit reverts.
        if (_deposit > 0) {
            NostromVault(payable(_vault)).deposit{value: _deposit}();
        }
    }

    /// @dev Reads live state from a vault. Caller must have verified `isVault`.
    function _snapshot(address _vault) private view returns (VaultSnapshot memory snapshot) {
        (
            address vaultOwner,
            address agent,
            address recovery,
            uint256 balance,
            uint256 timeout,
            uint256 lastPing,
            uint256 deadline,
            uint256 secondsRemaining,
            bool triggered,
            bool executable,
            uint256 totalPings
        ) = NostromVault(payable(_vault)).status();

        snapshot = VaultSnapshot({
            vault: _vault,
            owner: vaultOwner,
            agentAddress: agent,
            recoveryAddress: recovery,
            balance: balance,
            timeoutPeriod: timeout,
            lastPingTime: lastPing,
            executionDeadline: deadline,
            secondsRemaining: secondsRemaining,
            isTriggered: triggered,
            isExecutable: executable,
            pingCount: totalPings
        });
    }

    /**
     * @dev Binds a user-supplied salt to its creator so CREATE2 addresses cannot
     *      be squatted or front-run by another account using the same salt.
     */
    function _namespacedSalt(address _creator, bytes32 _salt) private pure returns (bytes32) {
        return keccak256(abi.encode(_creator, _salt));
    }

    /// @dev Bounds-safe slice of a storage array.
    function _paginate(
        address[] storage _source,
        uint256 _offset,
        uint256 _limit
    ) private view returns (address[] memory page) {
        if (_limit == 0 || _limit > MAX_PAGE_LIMIT) revert InvalidPageLimit(_limit, MAX_PAGE_LIMIT);

        uint256 length = _source.length;
        if (_offset >= length) return new address[](0);

        uint256 end = _offset + _limit;
        if (end > length) end = length;

        page = new address[](end - _offset);
        for (uint256 i; i < page.length; ) {
            page[i] = _source[_offset + i];
            unchecked {
                ++i;
            }
        }
    }
}
