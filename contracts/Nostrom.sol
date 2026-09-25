// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/**
 * @dev Minimal ERC-20 surface used for emergency token rescue.
 *      Declared locally so the contract has zero external dependencies
 *      (single-file deploy via Remix works out of the box).
 */
interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
}

/**
 * @title  Nostrom
 * @notice Dead-Man's Switch / Fail-Safe Vault for autonomous AI agent treasuries.
 * @dev    Built for BOT Chain (EVM-compatible: testnet chainId 968, mainnet chainId 677).
 *
 * ## Threat model
 * An autonomous agent holds operating funds. If the agent's process dies, its key
 * is lost, or it is compromised and goes silent, those funds become unreachable.
 * Nostrom makes silence itself the trigger for recovery.
 *
 * ## Lifecycle
 *   1. Owner deploys the vault with an agent key, a cold recovery address and a timeout.
 *   2. Funds live in the vault. The agent calls {ping} on a schedule to prove liveness.
 *   3. If no ping arrives within `timeoutPeriod`, ANYONE may call
 *      {executeDeadManSwitch} and the entire balance is pushed to `recoveryAddress`.
 *
 * Execution is permissionless on purpose: recovery must not depend on the owner
 * being online, so any keeper/bot can fire the switch. The caller has no
 * discretion over the destination, so there is nothing to extract by calling it.
 *
 * ## Security notes
 *   - {executeDeadManSwitch} follows checks-effects-interactions: `isTriggered`
 *     is set before any value transfer, so a hostile `recoveryAddress` cannot
 *     re-enter and drain twice.
 *   - Tracked ERC-20 sweeps are wrapped in try/catch so one malicious or broken
 *     token cannot brick the native-token rescue path.
 *   - `block.timestamp` is used for timing. Validator drift is on the order of
 *     seconds, which is irrelevant against timeouts measured in hours or days.
 *     `MIN_TIMEOUT_PERIOD` exists to keep that assumption true.
 */
contract Nostrom {
    // -------------------------------------------------------------------------
    // Errors (cheaper than revert strings, and self-documenting in traces)
    // -------------------------------------------------------------------------

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

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    /// @notice Vault owner / AI agent developer. Full control during normal operation.
    address public owner;

    /// @notice Wallet the AI agent signs heartbeats with. Can only call {ping}.
    address public agentAddress;

    /// @notice Cold wallet that receives everything if the agent goes dark.
    address public recoveryAddress;

    /// @notice Seconds of silence tolerated before the switch may be executed.
    uint256 public timeoutPeriod;

    /// @notice Timestamp of the most recent heartbeat.
    uint256 public lastPingTime;

    /// @notice True once the fail-safe has fired. Normal vault operations are frozen.
    bool public isTriggered;

    /// @notice Total heartbeats received. Useful for agent health dashboards.
    uint256 public pingCount;

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

    // -------------------------------------------------------------------------
    // A. Initialisation & setup
    // -------------------------------------------------------------------------

    /**
     * @param _agentAddress    Wallet the AI agent uses to send heartbeats.
     * @param _recoveryAddress Cold wallet that receives funds on failure.
     * @param _timeoutPeriod   Seconds of silence tolerated (e.g. 86400 for 24h).
     *
     * @dev The deployer becomes `owner`. The heartbeat clock starts immediately,
     *      so the agent has a full `timeoutPeriod` to send its first ping.
     */
    constructor(address _agentAddress, address _recoveryAddress, uint256 _timeoutPeriod) {
        if (_agentAddress == address(0)) revert ZeroAddress("agentAddress");
        if (_recoveryAddress == address(0)) revert ZeroAddress("recoveryAddress");

        // A recovery address pointing at the vault itself would make rescue a no-op.
        if (_recoveryAddress == address(this)) revert InvalidAddress("recoveryAddress");

        // The agent key is assumed to be the hot/expendable key. If it were also
        // the recovery target, compromising the agent would compromise recovery.
        if (_recoveryAddress == _agentAddress) revert InvalidAddress("recoveryAddress");

        _validateTimeout(_timeoutPeriod);

        owner = msg.sender;
        agentAddress = _agentAddress;
        recoveryAddress = _recoveryAddress;
        timeoutPeriod = _timeoutPeriod;
        lastPingTime = block.timestamp;

        emit OwnershipTransferred(address(0), msg.sender);
        emit AgentAddressUpdated(address(0), _agentAddress, block.timestamp);
        emit RecoveryAddressUpdated(address(0), _recoveryAddress);
        emit TimeoutPeriodUpdated(0, _timeoutPeriod);
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
        lastPingTime = block.timestamp;
        unchecked {
            ++pingCount;
        }
        emit Heartbeat(msg.sender, block.timestamp, pingCount, block.timestamp + timeoutPeriod);
    }

    // -------------------------------------------------------------------------
    // C. Deposits & normal withdrawals
    // -------------------------------------------------------------------------

    /// @notice Accept native BOT deposits.
    receive() external payable {
        emit VaultFunded(msg.sender, msg.value, address(this).balance);
    }

    /**
     * @notice Explicit deposit entry point.
     * @dev    Functionally identical to a plain transfer, but easier to call from
     *         contracts and clearer in block explorers.
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
     * @dev PERMISSIONLESS: any address (keeper bot, watchtower, the owner, a
     *      bystander) may call this. That is the point: recovery must not depend
     *      on any single party being online. The caller cannot choose the
     *      destination, so there is no value to extract by calling it.
     *
     * Requires `block.timestamp - lastPingTime > timeoutPeriod`.
     *
     * Order of operations (checks-effects-interactions):
     *   1. Verify the agent has actually gone silent.
     *   2. Set `isTriggered = true`, permanently freezing owner withdrawals
     *      and further heartbeats. Done BEFORE any transfer, so a malicious
     *      `recoveryAddress` cannot re-enter.
     *   3. Sweep every tracked ERC-20 balance to `recoveryAddress`
     *      (individually try/catch'd; a broken token cannot block the rescue).
     *   4. Sweep the full native balance to `recoveryAddress`.
     *   5. Emit {DeadManSwitchTriggered}.
     *
     * If the native transfer fails (e.g. the recovery address is a contract that
     * reverts on receive) the whole transaction reverts, leaving `isTriggered`
     * false so the switch can be fired again later. It never half-executes.
     */
    function executeDeadManSwitch() external whenNotTriggered {
        uint256 deadline = lastPingTime + timeoutPeriod;
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
     * @dev    Permissionless. Covers forced transfers (selfdestruct) and late refunds.
     */
    function sweepNativeToRecovery() external whenTriggered {
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
    function sweepTokenToRecovery(address _token) external whenTriggered {
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
        lastPingTime = block.timestamp;

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
     *         with a fresh agent instead of being redeployed.
     */
    function rearm() external onlyOwner whenTriggered {
        isTriggered = false;
        lastPingTime = block.timestamp;
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
    // Views: everything a keeper bot or dashboard needs
    // -------------------------------------------------------------------------

    /// @notice Native BOT held by the vault.
    function vaultBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /// @notice Timestamp after which {executeDeadManSwitch} becomes callable.
    function executionDeadline() public view returns (uint256) {
        return lastPingTime + timeoutPeriod;
    }

    /// @notice Seconds of grace left. Zero means the switch is executable now.
    function timeUntilTrigger() public view returns (uint256) {
        uint256 deadline = executionDeadline();
        if (block.timestamp > deadline) return 0;
        return deadline - block.timestamp;
    }

    /// @notice Seconds since the last heartbeat.
    function timeSinceLastPing() external view returns (uint256) {
        return block.timestamp - lastPingTime;
    }

    /// @notice True when the switch can be executed right now.
    function isExecutable() public view returns (bool) {
        return !isTriggered && block.timestamp > executionDeadline();
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
     * @return vaultOwner      Current owner.
     * @return agent           Current heartbeat key.
     * @return recovery        Current recovery destination.
     * @return balance         Native balance in wei.
     * @return timeout         Configured timeout in seconds.
     * @return lastPing        Timestamp of the last heartbeat.
     * @return deadline        Timestamp the switch becomes executable.
     * @return secondsRemaining Grace period left (0 when executable).
     * @return triggered       Whether the switch has already fired.
     * @return executable      Whether the switch can be fired right now.
     * @return totalPings      Lifetime heartbeat count.
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
            lastPingTime,
            executionDeadline(),
            timeUntilTrigger(),
            isTriggered,
            isExecutable(),
            pingCount
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
     *      and brick the native-token rescue. Decoding as a word can never
     *      revert, so a garbage response degrades to "treat as success/failure"
     *      instead of taking the whole fail-safe down with it.
     *
     * @return True only if the transfer is believed to have succeeded.
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
     * @dev Best-effort sweep of every watchlisted ERC-20.
     *      Each token is isolated: a reverting `balanceOf`, a failing `transfer`,
     *      a token returning false, or a non-ERC-20 address is logged via
     *      {TokenRescueFailed} and skipped. The native rescue always proceeds.
     *
     *      Residual risk: a watchlisted token could grief by burning all forwarded
     *      gas. Only the owner can add tokens, so this is an owner-trust boundary,
     *      and {sweepNativeToRecovery} plus {sweepTokenToRecovery} provide a
     *      fallback path if it ever happened.
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
