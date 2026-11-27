-- A separate, read-only presentation of the evaluation database. The API only
-- selects this schema while serving website reads. The scoring pipeline uses public.
BEGIN;
CREATE SCHEMA IF NOT EXISTS beeeval_web;
CREATE OR REPLACE VIEW beeeval_web.v1_versions WITH (security_invoker=true) AS
SELECT brand_model, system_version FROM public.vehicle_overall_scores WHERE eval_version = 'V1';

CREATE OR REPLACE VIEW beeeval_web.vehicle_overall_scores WITH (security_invoker=true) AS
SELECT * FROM public.vehicle_overall_scores WHERE eval_version IS DISTINCT FROM 'V1';

CREATE OR REPLACE VIEW beeeval_web.vehicle_aggregated_scores WITH (security_invoker=true) AS
SELECT a.* FROM public.vehicle_aggregated_scores a WHERE NOT EXISTS (
    SELECT 1 FROM beeeval_web.v1_versions h WHERE h.brand_model=a.brand_model
    AND h.system_version IS NOT DISTINCT FROM a.system_version);

-- Apply the same predicate to both the compact projection and full evidence.
-- mimo-v2.5 is the legacy V1 analysis source, including before a score is published.
DO $views$
DECLARE relation_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY['video_results','beeeval_benchmark_results'] LOOP
    EXECUTE format($view$
      CREATE OR REPLACE VIEW beeeval_web.%1$I WITH (security_invoker=true) AS
      SELECT r.* FROM public.%1$I r WHERE NOT EXISTS (
          SELECT 1 FROM beeeval_web.v1_versions h WHERE h.brand_model=r.brand_model
          AND h.system_version IS NOT DISTINCT FROM r.system_version)
      AND r.metadata->>'analysis_source' IS DISTINCT FROM 'mimo-v2.5'
    $view$, relation_name);
  END LOOP;
END $views$;

GRANT USAGE ON SCHEMA beeeval_web TO beeeval_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA beeeval_web TO beeeval_readonly;
COMMIT;

-- These indexes keep Range requests and thumbnail checks cheap on the NAS path.
CREATE INDEX CONCURRENTLY IF NOT EXISTS beeeval_web_media_path
    ON public.video_case_search_text ((benchmark_metadata->>'path'));
CREATE INDEX CONCURRENTLY IF NOT EXISTS beeeval_web_video_name ON public.video_results (video_name);
CREATE INDEX CONCURRENTLY IF NOT EXISTS beeeval_web_thumbnail
    ON public.video_results ((regexp_replace(metadata->>'screenshot_path','_[0-9]+[.]jpg$','.jpg')))
    WHERE metadata->>'screenshot_path' IS NOT NULL;
