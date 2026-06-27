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

    def connect(self) -> bool:
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(3)
            s.connect((self.host, self.port))
            s.close()
            return True
        except Exception:
            return False

    def disconnect(self):
        pass

    def _send(self, data: dict) -> dict | None:
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(5)
            s.connect((self.host, self.port))
            msg = json.dumps(data) + "\n"
            s.sendall(msg.encode())
            response = b""
            while b"\n" not in response:
                chunk = s.recv(4096)
                if not chunk:
                    break
                response += chunk
            s.close()
            if response:
                return json.loads(response.decode("utf-8-sig").strip())
        except Exception as e:
            logger.warning(f"NT8: {e}")
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

    def close_position(self, position_id: str, symbol: str = "", account: str = "") -> dict | None:
        return self._send({
            "action": "CLOSE",
            "position_id": position_id,
            "symbol": symbol,
            "account": account,
        })

    def modify_position(self, symbol: str, sl: float = 0, tp: float = 0, magic: int = 0, account: str = "") -> dict | None:
        return self._send({
            "action": "MODIFY",
            "symbol": symbol,
            "sl": sl,
            "tp": tp,
            "magic": magic,
            "account": account,
        })

    def modify_position(self, position_id: str, sl: float = 0, tp: float = 0) -> dict | None:
        return self._send({
            "action": "MODIFY",
            "position_id": position_id,
            "sl": sl,
            "tp": tp,
        })
