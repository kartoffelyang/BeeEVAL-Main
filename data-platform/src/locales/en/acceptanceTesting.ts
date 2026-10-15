const acceptanceTesting = {
  // Platform home
  'acceptance_testing_title': 'Acceptance Platform',
  'acceptance_testing_subtitle': 'For the acceptance workflow: case generation, baseline comparison, improvement list and auto ticketing.',
  // Modules (bookmark bar)
  'at_mod_case_gen': 'Case Generation',
  'at_mod_case_gen_desc': 'Auto-generate test cases by function domain and acceptance grade (planned).',
  'at_mod_baseline': 'Acceptance Baseline',
  'at_mod_baseline_desc': 'Pick a reference (target model or industry average) and compare acceptance completion per scenario.',
  'at_mod_improvement': 'Improvement List',
  'at_mod_improvement_desc': 'Auto-summarize task types this model has not completed vs. the reference, drillable to case videos.',
  'at_mod_ticket': 'Auto Ticketing',
  'at_mod_ticket_desc': 'Turn improvement items into defect tickets in one click (planned).',
  // Vehicle selection
  'at_select_hint': 'Pick the primary model first, then add target models as reference.',
  // Reference mode
  'at_ref_mode': 'Reference',
  'at_ref_target': 'Target Model',
  'at_ref_target_hint': 'Use the average of selected target (competitor) models as reference.',
  'at_ref_industry': 'Industry Average',
  'at_ref_industry_hint': 'Use the industry-wide average as reference (coming soon).',
  'at_coming_soon': 'Coming soon',
  // Case generation placeholder
  'at_case_gen_placeholder_title': 'Case Generation',
  'at_case_gen_placeholder_desc': 'This will support batch generation of standardized test cases by function domain and acceptance grade. Under development, stay tuned.',
  // Auto ticketing placeholder
  'at_ticket_placeholder_title': 'Auto Ticketing',
  'at_ticket_placeholder_desc': 'This will let you turn improvement items into defect tickets in one click, linked back to the corresponding test videos. Under development, stay tuned.',
  // Improvement list
  'at_improve_title': 'Improvement List',
  'at_improve_desc': 'By acceptance completion rate, summarize the task types (function domain × acceptance grade × task type) this model underperforms or has not completed.',
  'at_improve_need_primary': 'Please select the primary model first.',
  'at_improve_loading': 'Analyzing acceptance completion…',
  'at_improve_load_failed': 'Failed to load improvement list',
  'at_improve_empty': 'No notable improvement items found. This model performs well!',
  'at_improve_ref_target': 'Reference: average of {{count}} target model(s)',
  'at_improve_ref_none': 'No reference selected; listing by this model’s low completion rate (below {{threshold}})',
  'at_improve_gap_hint': 'Sorted by (reference rate − primary rate) descending; larger gaps first.',
  'at_improve_solo_hint': 'Sorted by primary completion rate ascending; lower rates first.',
  'at_improve_count': '{{count}} improvement item(s)',
  // Table headers
  'at_col_domain': 'Domain',
  'at_col_grade': 'Grade',
  'at_col_task': 'Task Type',
  'at_col_primary_rate': 'Primary Rate',
  'at_col_ref_rate': 'Reference Rate',
  'at_col_gap': 'Gap',
  'at_col_cases': 'Cases',
  'at_col_failed': 'Failed',
  'at_improve_view_cases': 'View case videos',
  // Category expand area (failed cases)
  'at_expand_hint': 'Click to expand failed cases of this task type',
  'at_failed_cases_title': 'Failed Cases',
  'at_failed_cases_loading': 'Loading failed cases…',
  'at_failed_cases_empty': 'No failed cases for this task type.',
  'at_failed_cases_load_failed': 'Failed to load cases',
  'at_case_status_failed': 'Failed',
  'at_case_status_success': 'Success',
  'at_case_play': 'Play video',
};

export default acceptanceTesting;
