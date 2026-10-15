const nasBrowser = {
  'nas_browser': 'NAS 浏览器',
  'nas_browser_desc': '从 NAS 存储浏览和分析视频。',
  'nas_unavailable': 'NAS 不可用',
  'nas_unavailable_desc': 'NAS 服务未配置或无法连接。请检查 .env 中的 NAS_URL 和 NAS_TOKEN。',
  'nas_connected': '已连接',
  'nas_search_placeholder': '按文件名搜索...',
  'all_files': '全部文件',
  'videos_only': '仅视频',
  'folders_only': '仅文件夹',
  'videos_in_dir': '个视频',
  'search_results': '搜索结果',
  'generating_link': '正在生成播放链接...',
  'link_failed': '播放链接生成失败：{{error}}',

  // 多模态视频分析
  'mimo_analyze': '视频分析',
  'mimo_filter_large': '≥300MB',
  'mimo_oversized_title': '多模态视频分析',
  'mimo_oversized_desc': '已选择 {{total}} 个视频，其中 {{count}} 个超过 300MB：',
  'mimo_oversized_hint': '超大视频需要先压缩才能进行分析。压缩会适当降低画质但不影响基本分析准确性。',
  'mimo_skip_oversized': '跳过超大视频（仅分析 {{count}} 个）',
  'mimo_compress_all': '压缩后全部分析',
  'mimo_cancel': '取消',
  'mimo_submitted': '分析任务已提交',
  'mimo_submitted_detail': '任务 ID: {{taskId}}，共 {{total}} 个视频{{compress}}',
  'mimo_compress_note': '（含 {{count}} 个需压缩）',
  'mimo_no_videos': '请先选择视频',
};

export default nasBrowser;
