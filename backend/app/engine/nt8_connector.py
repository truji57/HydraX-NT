"""TCP connector al bridge C# de NinjaTrader 8."""
import socket
import json
import time
from app.utils.logger import get_logger

logger = get_logger("hydrax.nt8")


class NT8Connector:
    def __init__(self, host: str = "localhost", port: int = 5555):
        self.host = host
        self.port = port
        self._sock: socket.socket | None = None

    def connect(self) -> bool:
        try:
            self._sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self._sock.settimeout(5)
            self._sock.connect((self.host, self.port))
            logger.info(f"NT8: connected to {self.host}:{self.port}")
            return True
        except Exception as e:
            logger.error(f"NT8: connect failed: {e}")
            return False

    def disconnect(self):
        if self._sock:
            try:
                self._sock.close()
            except Exception:
                pass
            self._sock = None

    def _send(self, data: dict) -> dict | None:
        if not self._sock:
            return None
        try:
            msg = json.dumps(data) + "\n"
            self._sock.sendall(msg.encode())
            response = b""
            while b"\n" not in response:
                chunk = self._sock.recv(4096)
                if not chunk:
                    break
                response += chunk
            if response:
                return json.loads(response.decode("utf-8-sig").strip())
        except Exception as e:
            logger.warning(f"NT8: send error: {e}")
            self.disconnect()
            if not self.connect():
                logger.warning(f"NT8: reconnect failed")
        return None

    def get_account(self, account_name: str = "") -> dict | None:
        resp = self._send({"action": "ACCOUNT", "account": account_name})
        return resp

    def get_positions(self, account_name: str = "") -> list[dict]:
        resp = self._send({"action": "POSITIONS", "account": account_name})
        if resp and resp.get("ok"):
            return resp.get("positions", [])
        return []

    def get_orders(self, account_name: str = "") -> list[dict]:
        resp = self._send({"action": "ORDERS", "account": account_name})
        if resp and resp.get("ok"):
            return resp.get("orders", [])
        return []

    def open_position(self, symbol: str, contracts: int, direction: str,
                      sl: float = 0, tp: float = 0, magic: int = 0,
                      comment: str = "", account: str = "") -> dict | None:
        return self._send({
            "action": "OPEN",
            "symbol": symbol,
            "contracts": contracts,
            "direction": direction,
            "sl": sl,
            "tp": tp,
            "magic": magic,
            "comment": comment,
            "account": account,
        })

    def close_position(self, position_id: str, account: str = "") -> dict | None:
        return self._send({
            "action": "CLOSE",
            "position_id": position_id,
            "account": account,
        })

    def modify_position(self, position_id: str, sl: float = 0, tp: float = 0) -> dict | None:
        return self._send({
            "action": "MODIFY",
            "position_id": position_id,
            "sl": sl,
            "tp": tp,
        })
