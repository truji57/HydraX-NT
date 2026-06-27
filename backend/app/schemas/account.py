from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field
from app.models.account import AccountRole, RiskMode


class AccountBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    role: AccountRole
    login: str = Field(..., min_length=1)
    password: str
    bridge_host: str = "localhost"
    bridge_port: int = 5555
    poll_interval: float = Field(0.5, ge=0.1)
    active: bool = True
    color: str = "#3b82f6"


class AccountCreate(AccountBase):
    pass


class AccountUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    role: Optional[AccountRole] = None
    login: Optional[str] = None
    password: Optional[str] = None
    bridge_host: Optional[str] = None
    bridge_port: Optional[int] = None
    poll_interval: Optional[float] = Field(None, ge=0.1)
    active: Optional[bool] = None
    color: Optional[str] = None


class AccountResponse(BaseModel):
    id: str
    name: str
    role: AccountRole
    login: str
    bridge_host: str
    bridge_port: int
    poll_interval: float
    active: bool
    color: str
    created_at: datetime
    updated_at: datetime
    linked_masters: list[str] = []
    model_config = {"from_attributes": True}


class SlaveConfigBase(BaseModel):
    risk_mode: RiskMode = RiskMode.FIXED
    fixed_contracts: int = 1
    risk_percent: float = 0.5
    risk_usd: float = 50.0
    lot_multiplier: float = 1.0
    max_contracts: int = 100
    max_positions: int = 100
    autocopy_enable: bool = True
    copy_sl: bool = True
    copy_tp: bool = True
    inverse_copy: bool = False
    delay_sec: float = 0.0
    magic_number: int = 0


class SlaveConfigUpdate(SlaveConfigBase):
    pass


class SlaveConfigResponse(SlaveConfigBase):
    id: str
    account_id: str
    model_config = {"from_attributes": True}


class SlaveMasterLinkRequest(BaseModel):
    master_ids: list[str]


class AccountTestResult(BaseModel):
    success: bool
    message: str
    balance: Optional[float] = None
    server: Optional[str] = None


class SlaveTemplateBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    risk_mode: RiskMode = RiskMode.FIXED
    fixed_contracts: int = 1
    risk_percent: float = 0.5
    risk_usd: float = 50.0
    lot_multiplier: float = 1.0
    max_contracts: int = 100
    max_positions: int = 100
    autocopy_enable: bool = True
    copy_sl: bool = True
    copy_tp: bool = True
    inverse_copy: bool = False
    delay_sec: float = 0.0
    magic_number: int = 0


class SlaveTemplateCreate(SlaveTemplateBase):
    pass


class SlaveTemplateUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    risk_mode: Optional[RiskMode] = None
    fixed_contracts: Optional[int] = None
    risk_percent: Optional[float] = None
    risk_usd: Optional[float] = None
    lot_multiplier: Optional[float] = None
    max_contracts: Optional[int] = None
    max_positions: Optional[int] = None
    autocopy_enable: Optional[bool] = None
    copy_sl: Optional[bool] = None
    copy_tp: Optional[bool] = None
    inverse_copy: Optional[bool] = None
    delay_sec: Optional[float] = None
    magic_number: Optional[int] = None


class SlaveTemplateResponse(SlaveTemplateBase):
    id: str
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}
