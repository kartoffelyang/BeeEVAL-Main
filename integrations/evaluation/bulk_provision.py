"""Membership-aware Excel/CSV account roster parser.

First worksheet, first-row headers; maximum 500 recipients. Role is admin/member
(internal viewer). Membership defaults to Free, scenario access defaults closed.
Blank expiry uses the batch default; zero or 永久 explicitly means permanent.
The reviewed template is versioned alongside this service, with examples kept
on the instructions sheet so they cannot be accidentally provisioned.
"""
from __future__ import annotations

import csv
import io
import secrets
import string
from dataclasses import dataclass
from typing import Iterable, Literal, Optional

from openpyxl import load_workbook

from api.services.email_service import is_valid_email


# 角色取值：和 admin_users 里 RoleLiteral 保持一致；新增角色要同步改这里。
ALLOWED_ROLES = ("admin", "viewer")
DEFAULT_ROLE: Literal["viewer"] = "viewer"

# 列名别名表：key 是规范化字段名，value 是允许的输入别名（小写匹配，去掉首尾空白）。
# 用户从飞书 / 钉钉 / OA 导花名册过来时，列名经常是中文，这里多映射几个能省事。
_COLUMN_ALIASES: dict[str, tuple[str, ...]] = {
    "email":        ("email", "e-mail", "邮箱", "邮件", "邮件地址", "电子邮件", "账号", "登录账号"),
    "display_name": ("display_name", "displayname", "name", "姓名", "昵称", "显示名", "用户名"),
    "role":         ("role", "角色", "权限"),
    "membership_tier": ("membership_tier", "会员等级", "会员级别", "等级", "tier"),
    "scenario_enabled": ("scenario_enabled", "场景库授权", "场景库权限", "场景库"),
    "department":   ("department", "dept", "部门", "组织", "团队"),
    # 每行账号独立的到期天数；留空时该行走批次默认（弹窗里设的统一值）。
    # 兼容几种常见写法：英文 / 中文 / 简写。
    "expires_days": (
        "expires_days", "expire_days", "valid_days", "days",
        "到期天数", "有效天数", "有效期天数", "使用天数", "天数",
    ),
}

# Excel 单次最多导多少行；超过这个量级建议拆分上传，避免 SMTP 节流和前端卡死。
MAX_ROWS = 500


@dataclass
class ParsedRow:
    """解析后的单行结果。row_no 是 1-based 的"用户文件里看到的行号"（含表头）。
    error 为空字符串时表示该行字段都拿到了；具体能否插入由后续 commit 阶段判断
    （比如和 DB 里已有账号撞）。

    expires_days：None = 该行没填，commit 时按批次默认到期；非 None = 行级覆盖。
    """
    row_no: int
    email: str
    display_name: str
    role: str
    department: str
    error: str = ""
    expires_days: Optional[int] = None
    membership_tier: Optional[str] = "free"
    scenario_enabled: bool = False


@dataclass
class ParseResult:
    """批量解析后回传给前端的整体结果。前端用 invalid / total 渲染概览，
    rows 渲染每行明细。"""
    total: int
    valid: int
    invalid: int
    rows: list[ParsedRow]


# ──────────────────────────────────────────────────────────────────────
# Excel / CSV 解析
# ──────────────────────────────────────────────────────────────────────
def _normalize_header(h) -> str:
    """把表头单元格规整成可用 key：转字符串、去空白、转小写。
    Excel 的空单元格会是 None，None 在 dict key 里没意义，统一吃成空串。"""
    if h is None:
        return ""
    return str(h).strip().lower()


def _build_column_map(headers: Iterable[str]) -> dict[str, int]:
    """把每个识别得到的"规范字段名"映射到 Excel 列序号（0-based）。
    一个规范字段只匹配第一个出现的列；后续重复列会被忽略，方便容错。"""
    norm = [_normalize_header(h) for h in headers]
    result: dict[str, int] = {}
    for field, aliases in _COLUMN_ALIASES.items():
        for idx, h in enumerate(norm):
            if h in aliases and field not in result:
                result[field] = idx
                break
    return result


def _row_cell(row: list, col_map: dict[str, int], field: str) -> str:
    """读 row[col_map[field]] 并规整成 str；列不存在 / 单元格 None 都返回空串。"""
    idx = col_map.get(field)
    if idx is None or idx >= len(row):
        return ""
    val = row[idx]
    if val is None:
        return ""
    return str(val).strip()


def _parse_expires_days_cell(raw: str) -> tuple[Optional[int], Optional[str]]:
    """解析"到期天数"单元格。返回 (days, error_code)。
    - 空 → (None, None)，表示该行走批次默认，**不是错误**。
    - 合法正整数 1..3650 → (int, None)。
    - 其它（非整数 / 0 / 负数 / 超 3650）→ (None, error_code)。

    Excel 的数字单元格 openpyxl 会以 int/float 给我们；同时兼容用户写成 "30"、
    "30 " 这种 str。其它如 "30天" 这种带后缀的就当不合法 —— 因为模糊解析容易出歧义。
    """
    raw = raw.strip()
    if not raw:
        return None, None
    if raw.lower() in ("永久", "permanent"):
        return 0, None
    # openpyxl 把整数读成 int，浮点读成 float（如 30.0），都接受
    try:
        # 走 float 再回 int 以兼容 "30.0" / 30.0
        val_f = float(raw)
    except (ValueError, OverflowError):
        return None, "expires_days_invalid"
    import math
    if not math.isfinite(val_f):
        return None, "expires_days_invalid"
    if val_f != int(val_f):
        # 非整数（如 7.5 天）拒绝；按"天"语义就该整数
        return None, "expires_days_invalid"
    val = int(val_f)
    if val < 0:
        return None, "expires_days_invalid"
    if val > 3650:
        return None, "expires_days_too_large"
    return val, None


def _parse_one_row(row_no: int, row: list, col_map: dict[str, int]) -> ParsedRow:
    """单行解析 + 字段级校验。能修复的（角色小写、去空白）就修复，
    不能修复的（邮箱不合法 / role 不在白名单）写到 error 字段返回。"""
    email = _row_cell(row, col_map, "email").lower()
    display_name = _row_cell(row, col_map, "display_name")
    role_raw = _row_cell(row, col_map, "role").lower()
    role_raw = {"会员":"viewer", "member":"viewer", "管理员":"admin"}.get(role_raw, role_raw)
    tier = _row_cell(row, col_map, "membership_tier").lower() or "free"
    tier = {"试用":"trial", "试用会员":"trial", "免费":"free"}.get(tier,tier)
    scenario = _row_cell(row,col_map,"scenario_enabled").lower()
    scenario_true = ("开放","是","true","1","yes","enabled")
    scenario_false = ("","不开放","否","false","0","no","disabled")
    department = _row_cell(row, col_map, "department")
    expires_raw = _row_cell(row, col_map, "expires_days")

    role: str = DEFAULT_ROLE
    error_parts: list[str] = []

    if not email:
        error_parts.append("email_required")
    elif not is_valid_email(email):
        error_parts.append("email_invalid")

    if role_raw:
        if role_raw in ALLOWED_ROLES:
            role = role_raw
        else:
            # 角色写错的不要静默回退到 viewer —— 容易让 admin 误以为分配了高权限
            error_parts.append("role_invalid")

    if tier not in ("free","base","plus","pro","trial"):
        error_parts.append("membership_tier_invalid")
    if scenario not in scenario_true + scenario_false:
        error_parts.append("scenario_enabled_invalid")

    if display_name and len(display_name) > 128:
        error_parts.append("display_name_too_long")
    if department and len(department) > 128:
        error_parts.append("department_too_long")

    expires_days, exp_err = _parse_expires_days_cell(expires_raw)
    if exp_err:
        error_parts.append(exp_err)

    return ParsedRow(
        row_no=row_no,
        email=email,
        display_name=display_name,
        role=role,
        department=department,
        error=",".join(error_parts),
        expires_days=expires_days,
        membership_tier=None if role == "admin" else tier,
        scenario_enabled=role == "admin" or scenario in scenario_true,
    )


def parse_xlsx(content: bytes) -> ParseResult:
    """解析 .xlsx 字节流；任何 IO / 格式错误抛 ValueError，路由层转 400。"""
    try:
        wb = load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    except Exception as e:
        raise ValueError(f"failed_to_open_xlsx: {e}")
    try:
        ws = wb.worksheets[0]
        rows_iter = ws.iter_rows(values_only=True)
        try:
            header_row = next(rows_iter)
        except StopIteration:
            raise ValueError("empty_sheet")

        col_map = _build_column_map(header_row or [])
        if "email" not in col_map:
            raise ValueError("missing_email_column")

        parsed: list[ParsedRow] = []
        # row_no 从 2 开始：第 1 行是表头
        for idx, raw_row in enumerate(rows_iter, start=2):
            if raw_row is None:
                continue
            row = list(raw_row)
            # 完全空白行直接跳过（用户在 Excel 里习惯留空行做分组，别报错）
            if all((c is None or (isinstance(c, str) and not c.strip())) for c in row):
                continue
            parsed.append(_parse_one_row(idx, row, col_map))
            if len(parsed) > MAX_ROWS:
                # 超出上限就截断 + 留一行报错信息；用户能看到"被截断了"而不是悄无声息
                parsed.append(ParsedRow(
                    row_no=idx + 1,
                    email="",
                    display_name="",
                    role=DEFAULT_ROLE,
                    department="",
                    error="too_many_rows",
                ))
                break
    finally:
        wb.close()

    return _summarize(parsed)


def parse_csv(content: bytes) -> ParseResult:
    """解析 CSV 字节流。优先尝试 UTF-8-BOM（Excel 另存为 CSV 时默认带 BOM），
    再回退到 GBK（国内 Windows Excel 的旧默认编码）。两种都失败就抛错。"""
    text: Optional[str] = None
    for enc in ("utf-8-sig", "utf-8", "gbk"):
        try:
            text = content.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    if text is None:
        raise ValueError("failed_to_decode_csv")

    reader = csv.reader(io.StringIO(text))
    try:
        header_row = next(reader)
    except StopIteration:
        raise ValueError("empty_sheet")

    col_map = _build_column_map(header_row)
    if "email" not in col_map:
        raise ValueError("missing_email_column")

    parsed: list[ParsedRow] = []
    for idx, raw_row in enumerate(reader, start=2):
        if not raw_row:
            continue
        if all((not c or not c.strip()) for c in raw_row):
            continue
        parsed.append(_parse_one_row(idx, list(raw_row), col_map))
        if len(parsed) > MAX_ROWS:
            parsed.append(ParsedRow(
                row_no=idx + 1,
                email="",
                display_name="",
                role=DEFAULT_ROLE,
                department="",
                error="too_many_rows",
            ))
            break

    return _summarize(parsed)


def parse_upload(filename: str, content: bytes) -> ParseResult:
    """根据文件后缀派发到 xlsx / csv 解析器。
    .xls（老二进制格式）不支持 —— openpyxl 不读它，提示用户另存为 xlsx。"""
    name = (filename or "").lower()
    if name.endswith(".xlsx"):
        return parse_xlsx(content)
    if name.endswith(".csv"):
        return parse_csv(content)
    if name.endswith(".xls"):
        raise ValueError("xls_not_supported")
    raise ValueError("unsupported_file_type")


def _summarize(rows: list[ParsedRow]) -> ParseResult:
    """文件内去重：同一份 Excel 里有重复邮箱时，第一条保留、后续标 duplicate_in_file，
    避免一次 commit 给同一人发两封邀请邮件。"""
    seen: set[str] = set()
    for r in rows:
        if not r.email or r.error:
            continue
        if r.email in seen:
            r.error = "duplicate_in_file"
        else:
            seen.add(r.email)

    valid = sum(1 for r in rows if not r.error)
    return ParseResult(total=len(rows), valid=valid, invalid=len(rows) - valid, rows=rows)


# ──────────────────────────────────────────────────────────────────────
# 初始密码生成
# ──────────────────────────────────────────────────────────────────────
# 排除掉容易看错的字符：0/O、1/I/l。8 位字母+数字，约 36^8 = 2.8e12 种组合，
# 通过邮件发送，用户可直接登录并在个人中心自主改密。
_PWD_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ" "abcdefghijkmnpqrstuvwxyz" "23456789"


def generate_initial_password(length: int = 8) -> str:
    """用 secrets（CSPRNG）抽 length 个字符。
    保证至少包含 1 个字母 + 1 个数字：避免运气差出一串纯字母，给"密码强度感知"差体验。"""
    if length < 6:
        length = 6
    while True:
        pwd = "".join(secrets.choice(_PWD_ALPHABET) for _ in range(length))
        if any(c.isalpha() for c in pwd) and any(c.isdigit() for c in pwd):
            return pwd


# ──────────────────────────────────────────────────────────────────────
# 模板文件生成（让前端用户直接下载一份示例 xlsx）
# ──────────────────────────────────────────────────────────────────────
def build_template_xlsx() -> bytes:
    """Serve the reviewed versioned template; first sheet is deliberately blank."""
    from pathlib import Path
    return (Path(__file__).parent / "templates" / "beeeval_users_template.xlsx").read_bytes()
