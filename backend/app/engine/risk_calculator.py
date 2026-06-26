from app.utils.logger import get_logger

logger = get_logger("hydrax.risk")


def calculate_contracts_fixed(fixed_contracts: int) -> int:
    return max(1, fixed_contracts)


def calculate_contracts_risk_percent(balance: float, risk_percent: float, sl_ticks: int, tick_value: float) -> int:
    if sl_ticks <= 0 or tick_value <= 0:
        return 1
    risk_usd = balance * (risk_percent / 100.0)
    loss_per_contract = sl_ticks * tick_value
    if loss_per_contract <= 0:
        return 1
    contracts = max(1, int(risk_usd / loss_per_contract))
    return contracts


def calculate_contracts_risk_usd(risk_usd: float, sl_ticks: int, tick_value: float) -> int:
    if sl_ticks <= 0 or tick_value <= 0:
        return 1
    loss_per_contract = sl_ticks * tick_value
    if loss_per_contract <= 0:
        return 1
    return max(1, int(risk_usd / loss_per_contract))


def calculate_contracts_ratio(master_contracts: int, multiplier: float) -> int:
    return max(1, int(master_contracts * multiplier))


def calculate_contracts_balance_prop(master_contracts: int, slave_balance: float, master_balance: float) -> int:
    if master_balance <= 0:
        return 1
    return max(1, int(master_contracts * (slave_balance / master_balance)))
