const common = {
  // Buttons & Actions
  'edit': '编辑',
  'save_changes': '保存修改',
  'cancel': '取消',
  'confirm': '确认',
  'delete': '删除',
  'refresh': '刷新',
  'retry': '重试',
  'loading': '加载中…',
  'search': '搜索',
  'save': '保存',
  'close': '关闭',
  'export': '导出',
  'reset': '重置',

  // Pagination
  'prev_page': '上一页',
  'next_page': '下一页',
  'first_page': '首页',
  'last_page': '末页',
  'page_of': '第 {{current}} / {{total}} 页',
  'showing_records': '显示 {{shown}} / {{total}} 条（第 {{current}}/{{pages}} 页）',
  'per_page': '每页显示',
  'jump_to_page': '跳转到第',
  'page_unit': '页',
  'go': '跳转',

  // Status
  'status_all': '全部',
  'status_completed': '已完成',
  'status_failed': '失败',
  'status_invalid': '无效跳过',
  'invalid_no_reason': '被判定为无效视频（无可评测内容），已跳过分析。',
  'status_processing': '处理中',
  'status_pending': '待处理',
  'err_download': '视频下载失败：模型服务无法获取该视频（可能视频地址失效或网络问题）',
  'err_invalid_json': '模型返回格式异常：无法解析模型输出（通常重试可恢复）',
  'err_quota': '大模型 API 配额不足：账户额度已用尽，需充值或更换密钥',
  'err_rate_limit': '请求过于频繁：触发限流，稍后重试即可',
  'err_corrupted': '视频数据损坏：模型无法处理该视频内容',
  'err_video_broken': '视频文件异常：无法读取时长/内容（文件可能损坏或格式不支持）',
  'err_timeout': '分析超时：模型处理耗时过长',
  'err_cancelled': '已人工取消',
  'err_generic': '分析失败（详见下方原始报错）',
  'err_unknown': '未知错误',
  'err_detail_toggle': '查看原始报错',

  // Roles
  'role_admin': '管理员',
  'role_analyst': '分析员',
  'role_tester': '测试员',
  'role_viewer': '体验员',

  // Common labels
  'total': '总计',
  'selected': '已选择',
  'select_all': '全选',
  'no_results': '未找到结果。',
  'no_data': '暂无数据',
  'actions': '操作',
  'version': 'v1.0.0',
  'items': '个项目',
  'preview': '预览',
  'more': '台',
  'done': '完成',
  'failed': '失败',
  'processing': '处理中',

  // Shared labels
  'interaction_log': '交互日志',
  'required_label': '必填:',
  'optional_label': '可选:',
  'total_ms': '总 {{ms}}ms',
  'click_to_play': '点击播放视频',
  'no_video_path': '暂无视频路径',
  'evaluation_details': '评估详情',
  'summary': '总结',

  // 体验账号：车型/用例/报告列表被后端按白名单裁剪后的统一提示。
  // 只说"还有更多"，不透出被屏蔽的车型名称。
  'trial_upgrade_more': '升级账号可查看更多',

  // 体验账号：首页 Ask AI 问答框遮罩提示。压在输入框上的单行胶囊，
  // 必须短到一行放得下，别写成两三句。
  'landing_ask_trial_locked': '升级账号权限可解锁智能问答',
};

export default common;
