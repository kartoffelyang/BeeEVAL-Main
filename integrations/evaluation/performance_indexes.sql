-- Read accelerators only. No evaluation, score, publication or user is modified.
-- Run outside a transaction; CONCURRENTLY keeps normal reads and writes available.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_video_results_valid_case_page
ON public.video_results (case_id ASC NULLS LAST, id DESC)
INCLUDE (brand_model, system_version, function_domain, created_at, video_name)
WHERE metadata->>'status' IS DISTINCT FROM 'failed'
  AND metadata->>'status' IS DISTINCT FROM 'invalid'
  AND COALESCE((metadata->>'needs_review')::boolean, false) = false;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_video_results_valid_domain_page
ON public.video_results (function_domain, case_id ASC NULLS LAST, id DESC)
INCLUDE (brand_model, system_version, created_at, video_name)
WHERE metadata->>'status' IS DISTINCT FROM 'failed'
  AND metadata->>'status' IS DISTINCT FROM 'invalid'
  AND COALESCE((metadata->>'needs_review')::boolean, false) = false;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_video_results_valid_video_path
ON public.video_results ((metadata->>'path'), function_domain)
INCLUDE (id)
WHERE metadata->>'status' IS DISTINCT FROM 'failed'
  AND metadata->>'status' IS DISTINCT FROM 'invalid'
  AND COALESCE((metadata->>'needs_review')::boolean, false) = false;

ANALYZE public.video_results;
