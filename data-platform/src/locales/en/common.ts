const common = {
  // Buttons & Actions
  'edit': 'Edit',
  'save_changes': 'Save Changes',
  'cancel': 'Cancel',
  'confirm': 'Confirm',
  'delete': 'Delete',
  'refresh': 'Refresh',
  'retry': 'Retry',
  'loading': 'Loading...',
  'search': 'Search',
  'save': 'Save',
  'close': 'Close',
  'export': 'Export',
  'reset': 'Reset',

  // Pagination
  'prev_page': 'Previous',
  'next_page': 'Next',
  'first_page': 'First',
  'last_page': 'Last',
  'page_of': 'Page {{current}} / {{total}}',
  'showing_records': 'Showing {{shown}} of {{total}} records (Page {{current}}/{{pages}})',
  'per_page': 'Show',
  'jump_to_page': 'Go to page',
  'page_unit': '',
  'go': 'Go',

  // Status
  'status_all': 'All',
  'status_completed': 'Completed',
  'status_failed': 'Failed',
  'status_invalid': 'Invalid (Skipped)',
  'invalid_no_reason': 'Judged as an invalid video (no evaluable content); analysis skipped.',
  'status_processing': 'Processing',
  'status_pending': 'Pending',
  'err_download': 'Video download failed: the model service could not fetch the video (bad URL or network issue)',
  'err_invalid_json': 'Malformed model output: could not parse the response (usually recoverable on retry)',
  'err_quota': 'LLM API quota exhausted: account balance used up, needs top-up or new key',
  'err_rate_limit': 'Too many requests: rate-limited, retry later',
  'err_corrupted': 'Corrupted video data: the model cannot process this video',
  'err_video_broken': 'Bad video file: cannot read duration/content (file may be corrupted or unsupported)',
  'err_timeout': 'Analysis timed out: the model took too long',
  'err_cancelled': 'Cancelled manually',
  'err_generic': 'Analysis failed (see raw error below)',
  'err_unknown': 'Unknown error',
  'err_detail_toggle': 'Show raw error',

  // Roles
  'role_admin': 'Admin',
  'role_analyst': 'Analyst',
  'role_tester': 'Tester',
  'role_viewer': 'Viewer',

  // Common labels
  'total': 'Total',
  'selected': 'selected',
  'select_all': 'Select All',
  'no_results': 'No results found.',
  'no_data': 'No data',
  'actions': 'Actions',
  'version': 'v1.0.0',
  'items': 'items',
  'preview': 'Preview',
  'more': 'more',
  'done': 'Done',
  'failed': 'Failed',
  'processing': 'Processing',

  // Shared labels
  'interaction_log': 'Interaction Log',
  'required_label': 'Required:',
  'optional_label': 'Optional:',
  'total_ms': 'Total {{ms}}ms',
  'click_to_play': 'Click to play video',
  'no_video_path': 'No video path',
  'evaluation_details': 'Evaluation Details',
  'summary': 'Summary',

  // Trial accounts: shown under vehicle / test-case / report lists that the
  // backend has trimmed to the whitelist. Never names the hidden models.
  'trial_upgrade_more': 'Upgrade your account to see more',

  // Trial accounts: single-line pill sitting on the homepage Ask AI composer.
  // Keep it short enough for one line.
  'landing_ask_trial_locked': 'Upgrade your account to unlock Ask AI',
};

export default common;
