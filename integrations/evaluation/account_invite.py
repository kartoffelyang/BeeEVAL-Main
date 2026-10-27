"""Membership-aware invitation, shared by bulk and approved account creation."""
from html import escape
from datetime import timezone, timedelta

def render_invite_email(*, display_name, username, initial_password, role,
                        login_url=None, lang='zh', expires_at=None,
                        membership_tier='free', scenario_enabled=False):
    en = lang == 'en'
    admin = role == 'admin'
    tier = (membership_tier or 'free').lower()
    level = 'Trial' if tier == 'trial' else tier.capitalize()
    access = {
        'free': ('阅读标记 Free 的报告，预览部分车型功能域得分。', 'Read reports marked Free and preview selected vehicle domain scores.'),
        'base': ('阅读会员洞察报告。', 'Access member insight reports.'),
        'plus': ('阅读会员报告，查询 BeeEVAL 数据、用例视频、车型对标与场景表现。', 'Access member reports, evaluation data, case videos, vehicle comparisons and scenario performance.'),
        'pro': ('包含 Plus 数据与报告权限。指定车型测试和定制报告按合作约定交付。', 'Includes Plus data and reports. Designated vehicle testing and custom reports follow your service agreement.'),
        'trial': ('所有车型的汇总得分、指标与排行榜开放。具体用例、对比和视频仅开放出行域。', 'Aggregate scores, metrics and rankings are available for all vehicles. Case details, comparisons and videos are limited to the travel domain.'),
    }
    rights = ('管理员拥有全部权限。', 'Administrators have full access.')[en] if admin else access.get(tier, access['free'])[en]
    scene = ('已开放', 'Enabled')[en] if admin or scenario_enabled else ('未开放，需单独授权', 'Not enabled; licensed separately')[en]
    expiry = expires_at.astimezone(timezone(timedelta(hours=8))).strftime('%Y-%m-%d %H:%M (UTC+8)') if expires_at else ('永久', 'Permanent')[en]
    url = 'https://www.beeeval.com/login.html'
    fields = [
        (('登录账号','Username')[en], username),
        (('初始密码','Initial password')[en], initial_password),
        (('角色','Role')[en], ('管理员','Administrator')[en] if admin else ('会员','Member')[en]),
        (('会员等级','Membership')[en], ('全部权限','Full access')[en] if admin else level),
        (('场景库授权','Scenario library')[en], scene),
        (('账号有效期','Account validity')[en], expiry),
    ]
    greeting = f"Hello, {display_name or username}" if en else f"您好，{display_name or username}"
    intro = 'Your BeeEVAL account is ready.' if en else '您的 BeeEVAL 账号已开通。'
    footer = ('可使用以上账号和初始密码直接登录，无需先修改密码。请妥善保管，并可在个人中心修改密码。', 'Sign in directly with these credentials. No password reset is required before use. Keep them private; you can change your password in your profile.')[en]
    subject = '[BeeEVAL] Your account is ready' if en else '【BeeEVAL】账号开通及权限通知'
    plain = '\n\n'.join([greeting,intro,'\n'.join(f'{k}: {v}' for k,v in fields),rights,f'{("Sign in" if en else "立即登录")}: {url}',footer])
    rows = ''.join(f'<tr><td style="padding:8px;color:#62675d">{escape(k)}</td><td style="padding:8px">{escape(str(v))}</td></tr>' for k,v in fields)
    html = f'<html><body style="font-family:Arial,sans-serif;color:#252820"><div style="max-width:640px;margin:auto;padding:28px"><h2>BeeEVAL</h2><p>{escape(greeting)}</p><p>{intro}</p><table style="width:100%;background:#f5f5ef">{rows}</table><p>{escape(rights)}</p><p><a href="{url}">{"Sign in" if en else "立即登录"}</a></p><p>{footer}</p></div></body></html>'
    return subject, plain, html
