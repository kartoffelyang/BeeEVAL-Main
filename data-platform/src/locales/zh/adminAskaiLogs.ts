const adminAskaiLogs = {
  'askai_logs': '用户问答数据',
  'askai_logs_title': '用户问答数据',
  'askai_logs_refresh': '刷新',
  'askai_logs_export': '导出 Excel',
  'askai_logs_retention_banner': '检索明细数据仅保留 90 天，到期自动清空（问答正文长期保留）。如需长期留存检索现场，请定期导出备份到本地。',

  // Tabs
  'askai_logs_tab_detail': '问答明细',
  'askai_logs_tab_dashboard': '指标仪表盘',
  'askai_logs_tab_topn': 'Top N 排行',

  // Filters
  'askai_logs_filter_user': '用户',
  'askai_logs_filter_status': '状态',
  'askai_logs_filter_model': '模型',
  'askai_logs_filter_keyword': '关键词',
  'askai_logs_filter_low_relevance': '仅看低相关',
  'askai_logs_filter_start': '开始时间',
  'askai_logs_filter_end': '结束时间',
  'askai_logs_filter_apply': '查询',
  'askai_logs_filter_reset': '重置',

  // Status labels
  'askai_logs_status_ok': '成功',
  'askai_logs_status_no_data': '无数据',
  'askai_logs_status_content_rejected': '模型拒答',
  'askai_logs_status_param_error': '参数错误',
  'askai_logs_status_prepare_failed': '检索失败',
  'askai_logs_status_stream_failed': '生成失败',
  'askai_logs_status_client_aborted': '客户端断开',

  // Detail table columns
  'askai_logs_col_time': '时间',
  'askai_logs_col_user': '用户',
  'askai_logs_col_question': '问题',
  'askai_logs_col_status': '状态',
  'askai_logs_col_model': '模型',
  'askai_logs_col_total_latency': '总耗时',
  'askai_logs_col_llm_latency': 'LLM耗时',
  'askai_logs_col_retrieved': '检索数',
  'askai_logs_low_relevance_tag': '低相关',
  'askai_logs_total_count': '共 {{count}} 条',
  'askai_logs_prev': '上一页',
  'askai_logs_next': '下一页',
  'askai_logs_empty': '暂无数据',
  'askai_logs_load_failed': '加载失败',

  // Detail modal
  'askai_logs_detail_title': '问答详情',
  'askai_logs_detail_question': '问题',
  'askai_logs_detail_answer': '回答',
  'askai_logs_detail_sources': '检索来源',
  'askai_logs_detail_no_answer': '（无回答）',
  'askai_logs_detail_sources_compressed': '检索数据已于 {{date}} 压缩清理',
  'askai_logs_detail_error': '错误信息',
  'askai_logs_detail_close': '关闭',

  // Dashboard
  'askai_logs_kpi_total': '总问答数',
  'askai_logs_kpi_success_rate': '成功率',
  'askai_logs_kpi_low_relevance': '低相关比例',
  'askai_logs_kpi_avg_total': '平均总耗时',
  'askai_logs_kpi_avg_llm': '平均 LLM 耗时',
  'askai_logs_chart_trend': '问答量趋势',
  'askai_logs_chart_status': '状态分布',

  // Top N
  'askai_logs_topn_users': '最活跃用户',
  'askai_logs_topn_no_data': '答不上来的高频问题',
  'askai_logs_topn_low_rel': '低相关高频问题',
  'askai_logs_topn_count': '{{count}} 次',
  'askai_logs_topn_empty': '暂无',

  // Export
  'askai_logs_export_too_large': '结果过多，请缩小时间范围或增加筛选条件后再导出',
  'askai_logs_export_failed': '导出失败',
};

export default adminAskaiLogs;
