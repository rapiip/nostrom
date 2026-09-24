// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Clones, NostromVault} from "../NostromFactory.sol";

/**
 * @dev Test-only. Creates raw, UNINITIALISED clones so tests can prove that a
 *      fresh clone cannot be griefed into a triggered state before its owner
 *      configures it. Production code must always clone+initialise atomically.
 */
contract RawCloneSpawner {
    event Spawned(address clone);

    function spawn(address implementation) external returns (address instance) {
        instance = Clones.clone(implementation);
        emit Spawned(instance);
    }

    function predict(address implementation, bytes32 salt) external view returns (address) {
        return Clones.predictDeterministicAddress(implementation, salt, address(this));
    }

    function spawnDeterministic(address implementation, bytes32 salt) external returns (address instance) {
        instance = Clones.cloneDeterministic(implementation, salt);
        emit Spawned(instance);
    }
}

/**
 * @dev Test-only. Sends native value using Solidity's `transfer()`, which
 *      forwards only the 2300 gas stipend. Used to document and verify the
 *      known EIP-1167 behaviour: a proxied `receive()` needs more than that.
 */
contract StipendSender {
    function sendViaTransfer(address payable target) external payable {
        target.transfer(msg.value);
    }

    function sendViaCall(address payable target) external payable {
        (bool ok, ) = target.call{value: msg.value}("");
        require(ok, "StipendSender: call failed");
    }

    function depositInto(NostromVault vault) external payable {
        vault.deposit{value: msg.value}();
    }
}
