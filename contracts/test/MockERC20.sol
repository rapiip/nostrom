// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/**
 * @dev Test-only ERC-20. Not part of the Nostrom protocol; used to prove the
 *      emergency token sweep works, including against hostile tokens.
 */
contract MockERC20 {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    /// @dev Failure modes used to prove the sweep cannot be bricked by one bad token.
    bool public transferReverts;
    bool public transferReturnsFalse;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory _name, string memory _symbol) {
        name = _name;
        symbol = _symbol;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
        emit Transfer(address(0), to, amount);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(!transferReverts, "MockERC20: transfer disabled");
        if (transferReturnsFalse) return false;

        uint256 balance = balanceOf[msg.sender];
        require(balance >= amount, "MockERC20: insufficient balance");

        balanceOf[msg.sender] = balance - amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function setTransferReverts(bool value) external {
        transferReverts = value;
    }

    function setTransferReturnsFalse(bool value) external {
        transferReturnsFalse = value;
    }
}

/**
 * @dev Token whose `balanceOf` reverts. Proves `_sweepTrackedTokens` isolates
 *      read failures instead of aborting the whole rescue.
 */
contract RevertingBalanceToken {
    function balanceOf(address) external pure returns (uint256) {
        revert("balanceOf disabled");
    }

    function transfer(address, uint256) external pure returns (bool) {
        return true;
    }
}

/**
 * @dev Token whose `transfer` returns a `bytes1` instead of a `bool`. Solidity
 *      pads that to a 32-byte word like `0x0100…00`, which is neither 0 nor 1:
 *      `abi.decode(data, (bool))` would revert on it. Proves the sweep decodes
 *      defensively instead of letting one weird token abort the whole rescue.
 */
contract MalformedReturnToken {
    mapping(address => uint256) public balanceOf;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function transfer(address, uint256) external pure returns (bytes1) {
        return 0x01;
    }
}

/**
 * @dev Token whose `transfer` returns a single raw byte (too short to decode as
 *      anything. Proves the `data.length < 32` guard treats it as a failure
 *      rather than reverting.
 */
contract ShortReturnToken {
    mapping(address => uint256) public balanceOf;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    /// @dev Catches `transfer(address,uint256)` and returns 1 byte of data.
    fallback() external {
        assembly {
            mstore(0, 1)
            return(0, 1)
        }
    }
}

/// @dev Recipient that rejects native transfers, to test the atomic-revert path.
contract RejectingRecipient {
    receive() external payable {
        revert("RejectingRecipient: no thanks");
    }
}

/**
 * @dev Attempts to re-enter the vault when it receives native BOT.
 *      Proves the checks-effects-interactions ordering holds.
 */
contract ReentrantRecipient {
    address public immutable vault;
    uint256 public attempts;

    constructor(address _vault) {
        vault = _vault;
    }

    receive() external payable {
        attempts += 1;
        // Should always fail: isTriggered is set before any value moves.
        (bool ok, ) = vault.call(abi.encodeWithSignature("executeDeadManSwitch()"));
        ok; // ignored on purpose; the outer assertion is on final balances
    }
}
