"""
Nostrom heartbeat client (Python / web3.py).

Liveness reporter for an autonomous agent running on BOT Chain. Most AI agent
runtimes are Python, so this mirrors the Node client feature-for-feature.

    pip install web3 python-dotenv

── Embed in an agent ──────────────────────────────────────────────────────────
    from nostrom_heartbeat import NostromHeartbeat

    heartbeat = NostromHeartbeat(
        rpc_url="https://rpc.bohr.life",
        vault_address=os.environ["NOSTROM_ADDRESS"],
        private_key=os.environ["AGENT_PRIVATE_KEY"],
        interval_seconds=3600,
        health_check=lambda: my_agent.is_healthy(),
    )

    heartbeat.start()          # background thread, pings immediately
    ...                        # agent does its real work
    heartbeat.stop()

Single ping inside an existing loop (no thread):

    heartbeat.preflight()
    while agent.running:
        agent.do_work()
        heartbeat.ping_once()

── Run standalone ─────────────────────────────────────────────────────────────
    python agent/nostrom_heartbeat.py            # loop forever
    python agent/nostrom_heartbeat.py --once     # single ping, then exit
    python agent/nostrom_heartbeat.py --status   # read state, send nothing
"""

from __future__ import annotations

import json
import logging
import os
import sys
import threading
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Optional

from web3 import Web3
from web3.exceptions import ContractLogicError

LOGGER = logging.getLogger("nostrom")

# BOT Chain testnet (chainId 968). Mainnet: https://rpc.botchain.ai (chainId 677).
DEFAULT_RPC_URL = "https://rpc.bohr.life"

# Minimal ABI — only what the agent needs.
NOSTROM_ABI = json.loads(
    """
[
  {"inputs":[],"name":"ping","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[],"name":"agentAddress","outputs":[{"type":"address"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"timeoutPeriod","outputs":[{"type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"lastPingTime","outputs":[{"type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"isTriggered","outputs":[{"type":"bool"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"pingCount","outputs":[{"type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"timeUntilTrigger","outputs":[{"type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"executionDeadline","outputs":[{"type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"vaultBalance","outputs":[{"type":"uint256"}],"stateMutability":"view","type":"function"}
]
"""
)


class HeartbeatError(RuntimeError):
    """Raised for unrecoverable heartbeat conditions."""


class VaultTriggeredError(HeartbeatError):
    """The dead-man's switch already fired; pings are frozen forever."""


class AgentKeyMismatchError(HeartbeatError):
    """The configured key is not the vault's registered agent."""


@dataclass
class VaultStatus:
    timeout_period: int
    last_ping_time: int
    is_triggered: bool
    ping_count: int
    seconds_remaining: int
    deadline: int
    balance_wei: int

    @property
    def balance_bot(self) -> float:
        return self.balance_wei / 1e18

    @property
    def healthy(self) -> bool:
        return not self.is_triggered and self.seconds_remaining > 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "timeoutPeriod": self.timeout_period,
            "lastPingTime": self.last_ping_time,
            "isTriggered": self.is_triggered,
            "pingCount": self.ping_count,
            "secondsRemaining": self.seconds_remaining,
            "deadline": self.deadline,
            "balanceWei": self.balance_wei,
            "balanceBOT": self.balance_bot,
            "healthy": self.healthy,
        }


@dataclass
class HeartbeatStats:
    pings: int = 0
    failures: int = 0
    last_ping_at: Optional[float] = None
    last_error: Optional[str] = None
    extra: dict[str, Any] = field(default_factory=dict)


class NostromHeartbeat:
    """Sends periodic ``ping()`` transactions to a Nostrom vault."""

    def __init__(
        self,
        vault_address: str,
        private_key: str,
        rpc_url: str = DEFAULT_RPC_URL,
        interval_seconds: int = 3600,
        max_retries: int = 3,
        retry_delay_seconds: float = 5.0,
        gas_limit: int = 120_000,
        auto_tune_interval: bool = True,
        health_check: Optional[Callable[[], bool]] = None,
        on_ping: Optional[Callable[[dict[str, Any]], None]] = None,
        on_error: Optional[Callable[[Exception], None]] = None,
    ) -> None:
        if not private_key:
            raise ValueError("private_key is required (the agent's heartbeat key).")

        self.w3 = Web3(Web3.HTTPProvider(rpc_url, request_kwargs={"timeout": 30}))
        self._install_poa_middleware()

        if not self.w3.is_connected():
            raise HeartbeatError(f"Cannot reach BOT Chain RPC at {rpc_url}")

        if not self.w3.is_address(vault_address):
            raise ValueError(f"vault_address is not a valid address: {vault_address}")

        self.account = self.w3.eth.account.from_key(private_key)
        self.address = self.account.address
        self.vault_address = self.w3.to_checksum_address(vault_address)
        self.vault = self.w3.eth.contract(address=self.vault_address, abi=NOSTROM_ABI)

        self.interval_seconds = interval_seconds
        self.max_retries = max_retries
        self.retry_delay_seconds = retry_delay_seconds
        self.gas_limit = gas_limit
        self.auto_tune_interval = auto_tune_interval
        self.health_check = health_check
        self.on_ping = on_ping
        self.on_error = on_error

        self.stats = HeartbeatStats()
        self._running = False
        self._stop_event = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._chain_id = self.w3.eth.chain_id

    # -- infrastructure ----------------------------------------------------

    def _install_poa_middleware(self) -> None:
        """
        Many EVM sidechains produce a 97-byte ``extraData`` field, which trips
        web3.py's block validation. Installing the PoA middleware is harmless on
        chains that do not need it, so do it defensively. Import paths differ
        between web3.py v6 and v7.
        """
        try:  # web3.py >= 7
            from web3.middleware import ExtraDataToPOAMiddleware

            self.w3.middleware_onion.inject(ExtraDataToPOAMiddleware, layer=0)
            return
        except ImportError:
            pass

        try:  # web3.py v6
            from web3.middleware import geth_poa_middleware

            self.w3.middleware_onion.inject(geth_poa_middleware, layer=0)
        except ImportError:
            LOGGER.debug("No PoA middleware available; continuing without it.")

    @staticmethod
    def _raw_tx_bytes(signed_tx: Any) -> bytes:
        """web3.py v7 renamed ``rawTransaction`` to ``raw_transaction``."""
        return getattr(signed_tx, "raw_transaction", None) or signed_tx.rawTransaction

    @staticmethod
    def _tx_hash_hex(tx_hash: Any) -> str:
        """Render a tx hash as 0x-prefixed hex across web3.py versions."""
        to_0x = getattr(tx_hash, "to_0x_hex", None)
        if callable(to_0x):
            return to_0x()
        raw = tx_hash.hex()
        return raw if raw.startswith("0x") else f"0x{raw}"

    def _build_fee_fields(self) -> dict[str, Any]:
        """
        Prefer EIP-1559 fees, fall back to legacy ``gasPrice`` when the node does
        not report a base fee.
        """
        try:
            base_fee = self.w3.eth.get_block("latest").get("baseFeePerGas")
        except Exception:  # pragma: no cover - RPC quirk
            base_fee = None

        if base_fee:
            priority = self.w3.to_wei(1, "gwei")
            return {
                "maxFeePerGas": base_fee * 2 + priority,
                "maxPriorityFeePerGas": priority,
            }

        return {"gasPrice": self.w3.eth.gas_price}

    # -- reads -------------------------------------------------------------

    def get_status(self) -> VaultStatus:
        """Read vault state without sending a transaction."""
        return VaultStatus(
            timeout_period=self.vault.functions.timeoutPeriod().call(),
            last_ping_time=self.vault.functions.lastPingTime().call(),
            is_triggered=self.vault.functions.isTriggered().call(),
            ping_count=self.vault.functions.pingCount().call(),
            seconds_remaining=self.vault.functions.timeUntilTrigger().call(),
            deadline=self.vault.functions.executionDeadline().call(),
            balance_wei=self.vault.functions.vaultBalance().call(),
        )

    def preflight(self) -> VaultStatus:
        """
        Validate configuration before relying on this for treasury safety.
        A silent key mismatch means every ping reverts and the switch fires on a
        perfectly healthy agent, so fail loudly here instead.
        """
        on_chain_agent = self.vault.functions.agentAddress().call()
        if on_chain_agent.lower() != self.address.lower():
            raise AgentKeyMismatchError(
                f"Vault expects agent {on_chain_agent} but this key is {self.address}. "
                "Every ping would revert."
            )

        status = self.get_status()
        if status.is_triggered:
            raise VaultTriggeredError(
                "Vault already triggered — the switch has fired and pings are frozen."
            )

        gas_balance = self.w3.eth.get_balance(self.address)
        if gas_balance == 0:
            raise HeartbeatError(
                f"Agent {self.address} holds 0 BOT and cannot pay gas for heartbeats. Fund it."
            )

        # Ping ~3x per timeout window so two missed transactions are survivable.
        if self.auto_tune_interval:
            safe_interval = max(10, status.timeout_period // 3)
            if self.interval_seconds > safe_interval:
                LOGGER.warning(
                    "Interval %ss is too close to the %ss timeout. Reducing to %ss.",
                    self.interval_seconds,
                    status.timeout_period,
                    safe_interval,
                )
                self.interval_seconds = safe_interval

        LOGGER.info(
            "Preflight OK. chainId=%s agent=%s timeout=%ss interval=%ss gas=%.6f BOT vault=%.6f BOT",
            self._chain_id,
            self.address,
            status.timeout_period,
            self.interval_seconds,
            gas_balance / 1e18,
            status.balance_bot,
        )
        return status

    # -- writes ------------------------------------------------------------

    def ping_once(self) -> dict[str, Any]:
        """
        Send exactly one heartbeat, with retries.

        Returns a dict describing the transaction, or ``{"skipped": True}`` when
        ``health_check`` reports the agent is unhealthy.
        """
        if self.health_check is not None:
            try:
                healthy = bool(self.health_check())
            except Exception as exc:  # noqa: BLE001 - treat any failure as unhealthy
                LOGGER.error("health_check raised: %s. Treating agent as unhealthy.", exc)
                healthy = False

            if not healthy:
                # Deliberately do NOT ping. An unhealthy agent should let the
                # switch arm — that is the entire purpose of the vault.
                LOGGER.warning("health_check failed — withholding heartbeat so the fail-safe can arm.")
                return {"skipped": True, "reason": "unhealthy"}

        last_error: Optional[Exception] = None

        for attempt in range(1, self.max_retries + 1):
            try:
                # Simulate first: catches "triggered" / wrong-key without burning gas.
                self.vault.functions.ping().call({"from": self.address})

                tx = self.vault.functions.ping().build_transaction(
                    {
                        "from": self.address,
                        "nonce": self.w3.eth.get_transaction_count(self.address, "pending"),
                        "gas": self.gas_limit,
                        "chainId": self._chain_id,
                        **self._build_fee_fields(),
                    }
                )

                signed = self.w3.eth.account.sign_transaction(tx, self.account.key)
                tx_hash = self.w3.eth.send_raw_transaction(self._raw_tx_bytes(signed))
                tx_hex = self._tx_hash_hex(tx_hash)
                LOGGER.info("ping() sent: %s (attempt %s/%s)", tx_hex, attempt, self.max_retries)

                receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=180)
                if receipt["status"] != 1:
                    raise HeartbeatError(f"ping() reverted on-chain: {tx_hex}")

                info = {
                    "txHash": tx_hex,
                    "blockNumber": receipt["blockNumber"],
                    "gasUsed": receipt["gasUsed"],
                    "pingCount": self.vault.functions.pingCount().call(),
                    "deadline": self.vault.functions.executionDeadline().call(),
                }

                self.stats.pings += 1
                self.stats.last_ping_at = time.time()
                self.stats.last_error = None

                LOGGER.info(
                    "Heartbeat #%s confirmed in block %s. Next deadline: %s",
                    info["pingCount"],
                    info["blockNumber"],
                    time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(info["deadline"])),
                )

                if self.on_ping is not None:
                    self.on_ping(info)
                return info

            except ContractLogicError as exc:
                message = str(exc)
                # Unrecoverable — retrying cannot help.
                if "SwitchAlreadyTriggered" in message:
                    self._running = False
                    raise VaultTriggeredError(
                        "Vault is triggered. Heartbeats are permanently frozen."
                    ) from exc
                if "NotAgent" in message:
                    self._running = False
                    raise AgentKeyMismatchError(
                        f"This key ({self.address}) is not the registered agent."
                    ) from exc

                last_error = exc
                LOGGER.warning("ping() attempt %s/%s reverted: %s", attempt, self.max_retries, message)

            except Exception as exc:  # noqa: BLE001 - network/nonce errors are retryable
                last_error = exc
                LOGGER.warning("ping() attempt %s/%s failed: %s", attempt, self.max_retries, exc)

            if attempt < self.max_retries:
                time.sleep(self.retry_delay_seconds * attempt)  # linear backoff

        self.stats.failures += 1
        self.stats.last_error = str(last_error)
        if self.on_error is not None and last_error is not None:
            self.on_error(last_error)

        assert last_error is not None
        raise last_error

    # -- loop --------------------------------------------------------------

    def _loop(self) -> None:
        while self._running and not self._stop_event.is_set():
            try:
                self.ping_once()
            except HeartbeatError as exc:
                LOGGER.error("Heartbeat stopped: %s", exc)
                self._running = False
                return
            except Exception as exc:  # noqa: BLE001 - keep looping through transient errors
                LOGGER.error("Heartbeat cycle failed, will retry next interval: %s", exc)

            self._stop_event.wait(self.interval_seconds)

    def start(self, background: bool = True) -> None:
        """Start the heartbeat loop. Pings once immediately."""
        if self._running:
            LOGGER.warning("Heartbeat already running.")
            return

        self.preflight()
        self._running = True
        self._stop_event.clear()

        if not background:
            self._loop()
            return

        self._thread = threading.Thread(target=self._loop, name="nostrom-heartbeat", daemon=True)
        self._thread.start()
        LOGGER.info("Heartbeat loop started (every %ss).", self.interval_seconds)

    def stop(self, timeout: float = 10.0) -> None:
        """Stop the loop. In-flight transactions are not cancelled."""
        self._running = False
        self._stop_event.set()
        if self._thread is not None and self._thread.is_alive():
            self._thread.join(timeout=timeout)
        LOGGER.info("Heartbeat stopped. pings=%s failures=%s", self.stats.pings, self.stats.failures)

    @property
    def running(self) -> bool:
        return self._running


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------
def _main() -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="[nostrom][%(asctime)s] %(levelname)s %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%SZ",
    )

    try:
        from dotenv import load_dotenv

        load_dotenv()
    except ImportError:
        LOGGER.debug("python-dotenv not installed; relying on real environment variables.")

    vault_address = os.getenv("NOSTROM_ADDRESS")
    private_key = os.getenv("AGENT_PRIVATE_KEY")

    if not vault_address or not private_key:
        print("Set NOSTROM_ADDRESS and AGENT_PRIVATE_KEY in your environment or .env file.")
        return 1

    heartbeat = NostromHeartbeat(
        vault_address=vault_address,
        private_key=private_key,
        rpc_url=os.getenv("BOTCHAIN_TESTNET_RPC", DEFAULT_RPC_URL),
        interval_seconds=int(os.getenv("PING_INTERVAL_SECONDS", "3600")),
    )

    args = sys.argv[1:]

    try:
        if "--status" in args:
            print(json.dumps(heartbeat.get_status().to_dict(), indent=2))
            return 0

        if "--once" in args:
            heartbeat.preflight()
            heartbeat.ping_once()
            return 0

        # Foreground loop so Ctrl-C is handled predictably.
        heartbeat.start(background=False)
        return 0

    except KeyboardInterrupt:
        print("\nReceived interrupt, shutting down heartbeat.")
        heartbeat.stop()
        return 0
    except HeartbeatError as exc:
        LOGGER.error("%s", exc)
        return 1


if __name__ == "__main__":
    raise SystemExit(_main())
