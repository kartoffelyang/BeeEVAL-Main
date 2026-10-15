const acceptanceTesting = {
  // 平台首页
  'acceptance_testing_title': '验收平台',
  'acceptance_testing_subtitle': '面向验收流程：用例生成、验收基线对比、改进清单与自动提票。',
  // 模块（书签栏）
  'at_mod_case_gen': '用例生成',
  'at_mod_case_gen_desc': '按功能域与验收梯度自动生成测试用例（规划中）。',
  'at_mod_baseline': '验收基线',
  'at_mod_baseline_desc': '选择参考（目标车型或行业均值），看本品各场景验收完成率对比。',
  'at_mod_improvement': '改进清单',
  'at_mod_improvement_desc': '自动汇总本品相对参考未完成的题目类别，可下钻到具体用例视频。',
  'at_mod_ticket': '自动提票',
  'at_mod_ticket_desc': '将改进项一键提为缺陷工单（规划中）。',
  // 车型选择
  'at_select_hint': '先选择本品车型（第一辆），再添加目标车型作为参考。',
  // 参考模式
  'at_ref_mode': '参考对象',
  'at_ref_target': '目标车型',
  'at_ref_target_hint': '以已选的目标车型（竞品）均值作为参考。',
  'at_ref_industry': '行业均值',
  'at_ref_industry_hint': '以全行业车型均值作为参考（即将上线）。',
  'at_coming_soon': '即将上线',
  // 用例生成占位
  'at_case_gen_placeholder_title': '用例生成',
  'at_case_gen_placeholder_desc': '这里将支持按功能域、验收梯度批量生成标准化测试用例。功能规划中，敬请期待。',
  // 自动提票占位
  'at_ticket_placeholder_title': '自动提票',
  'at_ticket_placeholder_desc': '这里将支持把改进清单中的问题一键提为缺陷工单，并回链到对应测试视频。功能规划中，敬请期待。',
  // 改进清单
  'at_improve_title': '改进清单',
  'at_improve_desc': '按验收完成率口径，汇总本品做得不好、尚未完成的题目类别（功能域 × 验收梯度 × 任务类型）。',
  'at_improve_need_primary': '请先选择本品车型。',
  'at_improve_loading': '正在分析验收完成率…',
  'at_improve_load_failed': '加载改进清单失败',
  'at_improve_empty': '未发现明显的待改进项，本品验收表现良好！',
  'at_improve_ref_target': '对比参考：目标车型均值（{{count}} 台）',
  'at_improve_ref_none': '未选参考车型，按本品低完成率列出（低于 {{threshold}}）',
  'at_improve_gap_hint': '按「参考完成率 − 本品完成率」的差距降序排列，差距越大越靠前。',
  'at_improve_solo_hint': '按本品完成率升序排列，完成率越低越靠前。',
  'at_improve_count': '共 {{count}} 个待改进项',
  // 表头
  'at_col_domain': '功能域',
  'at_col_grade': '验收梯度',
  'at_col_task': '任务类型',
  'at_col_primary_rate': '本品完成率',
  'at_col_ref_rate': '参考完成率',
  'at_col_gap': '差距',
  'at_col_cases': '用例数',
  'at_col_failed': '失败数',
  'at_improve_view_cases': '查看该类用例视频',
  // 类别展开区（失败用例）
  'at_expand_hint': '点击展开该类型下的失败用例',
  'at_failed_cases_title': '失败用例',
  'at_failed_cases_loading': '加载失败用例中…',
  'at_failed_cases_empty': '该类型下暂无失败用例。',
  'at_failed_cases_load_failed': '加载用例失败',
  'at_case_status_failed': '失败',
  'at_case_status_success': '成功',
  'at_case_play': '播放视频',
};

export default acceptanceTesting;
