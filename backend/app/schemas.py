from typing import Any, Dict, List, Optional
from pydantic import BaseModel


class LoginRequest(BaseModel):
    student_id: str
    password: str


class AdminLoginRequest(BaseModel):
    admin_id: str
    password: str


class RegisterRequest(BaseModel):
    username: str
    password: str
    nickname: Optional[str] = None


class ProductCreate(BaseModel):
    name: str
    category: str
    price: float
    stock: int = 0
    description: str = ""


class CartUpdateRequest(BaseModel):
    action: str  # add, update, remove, clear
    product_id: Optional[str] = None
    quantity: Optional[int] = None
    variant_id: Optional[str] = None


class ChatMessage(BaseModel):
    role: str
    content: Optional[str] = None
    tool_calls: Optional[List[Dict[str, Any]]] = None
    tool_call_id: Optional[str] = None


class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    model: Optional[str] = None
    conversation_id: Optional[str] = None


class ChatThreadCreateRequest(BaseModel):
    title: Optional[str] = None


class ChatThreadUpdateRequest(BaseModel):
    title: Optional[str] = None


class ProductUpdateRequest(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    price: Optional[float] = None
    stock: Optional[int] = None
    discount: Optional[float] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
    is_hot: Optional[bool] = None
    is_not_for_sale: Optional[bool] = None
    cost: Optional[float] = None
    owner_id: Optional[str] = None
    reservation_required: Optional[bool] = None
    reservation_cutoff: Optional[str] = None
    reservation_note: Optional[str] = None


class StockUpdateRequest(BaseModel):
    stock: int


class CategoryCreateRequest(BaseModel):
    name: str
    description: str = ""


class CategoryUpdateRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class ProductDeleteRequest(BaseModel):
    product_ids: List[str]


class BulkProductUpdateRequest(BaseModel):
    product_ids: List[str]
    discount: Optional[float] = None
    owner_id: Optional[str] = None
    is_active: Optional[bool] = None


class AgentCreateRequest(BaseModel):
    account: str
    password: str
    name: str
    building_ids: List[str] = []


class AgentUpdateRequest(BaseModel):
    password: Optional[str] = None
    name: Optional[str] = None
    building_ids: Optional[List[str]] = None
    is_active: Optional[bool] = None


class LocationUpdateRequest(BaseModel):
    address_id: str
    building_id: str


class OrderCreateRequest(BaseModel):
    shipping_info: Dict[str, str]
    payment_method: str = "wechat"
    note: str = ""
    coupon_id: Optional[str] = None
    apply_coupon: Optional[bool] = True
    reservation_requested: Optional[bool] = False


class OrderStatusUpdateRequest(BaseModel):
    status: str


class PaymentStatusUpdateRequest(BaseModel):
    payment_status: str


class OrderExportRequest(BaseModel):
    start_time_ms: Optional[float] = None
    end_time_ms: Optional[float] = None
    status_filter: Optional[str] = None
    keyword: Optional[str] = None
    agent_filter: Optional[str] = None
    timezone_offset_minutes: Optional[int] = None
    cycle_id: Optional[str] = None


class AddressCreateRequest(BaseModel):
    name: str
    enabled: bool = True
    sort_order: int = 0


class AddressUpdateRequest(BaseModel):
    name: Optional[str] = None
    enabled: Optional[bool] = None
    sort_order: Optional[int] = None


class BuildingCreateRequest(BaseModel):
    address_id: str
    name: str
    enabled: bool = True
    sort_order: int = 0


class BuildingUpdateRequest(BaseModel):
    name: Optional[str] = None
    enabled: Optional[bool] = None
    sort_order: Optional[int] = None


class AddressReorderRequest(BaseModel):
    order: List[str]


class BuildingReorderRequest(BaseModel):
    address_id: str
    order: List[str]


class CouponIssueRequest(BaseModel):
    student_id: str
    amount: float
    quantity: int = 1
    expires_at: Optional[str] = None


class PaymentQrCreateRequest(BaseModel):
    name: str


class PaymentQrUpdateRequest(BaseModel):
    name: Optional[str] = None


class PaymentQrStatusRequest(BaseModel):
    is_enabled: bool


class ShopStatusUpdate(BaseModel):
    is_open: bool
    note: Optional[str] = None


class AgentStatusUpdateRequest(BaseModel):
    is_open: bool
    closed_note: Optional[str] = ""
    allow_reservation: Optional[bool] = False


class VariantCreate(BaseModel):
    name: str
    stock: int


class VariantUpdate(BaseModel):
    name: Optional[str] = None
    stock: Optional[int] = None


class LotteryPrizeItemInput(BaseModel):
    id: Optional[str] = None
    product_id: str
    variant_id: Optional[str] = None


class LotteryPrizeInput(BaseModel):
    id: Optional[str] = None
    display_name: str
    weight: float
    is_active: Optional[bool] = True
    items: List[LotteryPrizeItemInput] = []


class LotteryConfigUpdateRequest(BaseModel):
    prizes: List[LotteryPrizeInput] = []
    threshold_amount: Optional[float] = None


class LotteryThresholdUpdateRequest(BaseModel):
    threshold_amount: float


class LotteryEnabledUpdateRequest(BaseModel):
    is_enabled: bool


class AutoGiftItemInput(BaseModel):
    product_id: str
    variant_id: Optional[str] = None


class AutoGiftUpdateRequest(BaseModel):
    items: List[AutoGiftItemInput] = []


class GiftThresholdCreate(BaseModel):
    threshold_amount: float
    gift_products: bool = False
    gift_coupon: bool = False
    coupon_amount: float = 0.0
    per_order_limit: Optional[int] = None
    items: List[AutoGiftItemInput] = []


class GiftThresholdUpdate(BaseModel):
    threshold_amount: Optional[float] = None
    gift_products: Optional[bool] = None
    gift_coupon: Optional[bool] = None
    coupon_amount: Optional[float] = None
    per_order_limit: Optional[int] = None
    is_active: Optional[bool] = None
    items: Optional[List[AutoGiftItemInput]] = None


class DeliverySettingsCreate(BaseModel):
    delivery_fee: float = 1.0
    free_delivery_threshold: float = 10.0


class OrderDeleteRequest(BaseModel):
    order_ids: List[str]
