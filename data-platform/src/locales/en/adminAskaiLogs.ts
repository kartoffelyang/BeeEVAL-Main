const adminAskaiLogs = {
  'askai_logs': 'User Q&A Data',
  'askai_logs_title': 'User Q&A Data',
  'askai_logs_refresh': 'Refresh',
  'askai_logs_export': 'Export Excel',
  'askai_logs_retention_banner': 'Retrieval detail data is kept for only 90 days, then auto-cleared (Q&A text is retained long-term). Export backups regularly if you need to preserve the retrieval context.',

  // Tabs
  'askai_logs_tab_detail': 'Q&A Details',
  'askai_logs_tab_dashboard': 'Dashboard',
  'askai_logs_tab_topn': 'Top N',

  // Filters
  'askai_logs_filter_user': 'User',
  'askai_logs_filter_status': 'Status',
  'askai_logs_filter_model': 'Model',
  'askai_logs_filter_keyword': 'Keyword',
  'askai_logs_filter_low_relevance': 'Low relevance only',
  'askai_logs_filter_start': 'Start',
  'askai_logs_filter_end': 'End',
  'askai_logs_filter_apply': 'Search',
  'askai_logs_filter_reset': 'Reset',

  // Status labels
  'askai_logs_status_ok': 'Success',
  'askai_logs_status_no_data': 'No data',
  'askai_logs_status_content_rejected': 'Rejected',
  'askai_logs_status_param_error': 'Param error',
  'askai_logs_status_prepare_failed': 'Retrieval failed',
  'askai_logs_status_stream_failed': 'Generation failed',
  'askai_logs_status_client_aborted': 'Client aborted',

  // Detail table columns
  'askai_logs_col_time': 'Time',
  'askai_logs_col_user': 'User',
  'askai_logs_col_question': 'Question',
  'askai_logs_col_status': 'Status',
  'askai_logs_col_model': 'Model',
  'askai_logs_col_total_latency': 'Total',
  'askai_logs_col_llm_latency': 'LLM',
  'askai_logs_col_retrieved': 'Retrieved',
  'askai_logs_low_relevance_tag': 'Low rel.',
  'askai_logs_total_count': '{{count}} total',
  'askai_logs_prev': 'Prev',
  'askai_logs_next': 'Next',
  'askai_logs_empty': 'No data',
  'askai_logs_load_failed': 'Load failed',

  // Detail modal
  'askai_logs_detail_title': 'Q&A Detail',
  'askai_logs_detail_question': 'Question',
  'askai_logs_detail_answer': 'Answer',
  'askai_logs_detail_sources': 'Retrieved Sources',
  'askai_logs_detail_no_answer': '(no answer)',
  'askai_logs_detail_sources_compressed': 'Retrieval data was compressed/cleared on {{date}}',
  'askai_logs_detail_error': 'Error',
  'askai_logs_detail_close': 'Close',

  // Dashboard
  'askai_logs_kpi_total': 'Total Q&A',
  'askai_logs_kpi_success_rate': 'Success rate',
  'askai_logs_kpi_low_relevance': 'Low relevance %',
  'askai_logs_kpi_avg_total': 'Avg total latency',
  'askai_logs_kpi_avg_llm': 'Avg LLM latency',
  'askai_logs_chart_trend': 'Volume Trend',
  'askai_logs_chart_status': 'Status Distribution',

  // Top N
  'askai_logs_topn_users': 'Most Active Users',
  'askai_logs_topn_no_data': 'Top Unanswered Questions',
  'askai_logs_topn_low_rel': 'Top Low-Relevance Questions',
  'askai_logs_topn_count': '{{count}}x',
  'askai_logs_topn_empty': 'None',

  // Export
  'askai_logs_export_too_large': 'Too many results. Narrow the time range or add filters before exporting.',
  'askai_logs_export_failed': 'Export failed',
};

export default adminAskaiLogs;
