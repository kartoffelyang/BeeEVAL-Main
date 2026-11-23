-- Compact metadata for benchmark reads. Full evidence keeps using video_results.
SET lock_timeout = '5s';
ALTER TABLE public.video_case_search_text ADD COLUMN IF NOT EXISTS benchmark_metadata jsonb;

CREATE OR REPLACE FUNCTION public.beeeval_benchmark_metadata(meta jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $function$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'analysis_source',meta->'analysis_source','status',meta->'status',
    'needs_review',meta->'needs_review','task_success',meta->'task_success',
    'response_quality_score',meta->'response_quality_score','path',meta->'path',
    'user_question',meta->'user_question',
    'first_response_latency_ms',meta->'first_response_latency_ms',
    'text_output_speed',meta->'text_output_speed'))
$function$;

CREATE OR REPLACE FUNCTION public.beeeval_sync_case_search_text()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.video_case_search_text WHERE result_id=OLD.id;
    RETURN OLD;
  END IF;
  INSERT INTO public.video_case_search_text(result_id,content,task_detail,acceptance_tag,projection_version,benchmark_metadata)
  VALUES(NEW.id,public.beeeval_case_search_text(NEW.case_id,NEW.video_name,NEW.transcript,NEW.metadata),
    NEW.metadata->>'task_detail',NEW.metadata->>'acceptance_tag',3,public.beeeval_benchmark_metadata(NEW.metadata))
  ON CONFLICT(result_id) DO UPDATE SET content=EXCLUDED.content,
    task_detail=EXCLUDED.task_detail,acceptance_tag=EXCLUDED.acceptance_tag,
    projection_version=3,benchmark_metadata=EXCLUDED.benchmark_metadata;
  RETURN NEW;
END
$function$;

UPDATE public.video_case_search_text st SET benchmark_metadata=public.beeeval_benchmark_metadata(vr.metadata),projection_version=3
FROM public.video_results vr WHERE st.result_id=vr.id AND st.projection_version<3;

DO $block$
DECLARE columns_sql text; reader text;
BEGIN
  SELECT string_agg(CASE WHEN column_name='metadata' THEN 'st.benchmark_metadata AS metadata'
    ELSE 'vr.' || quote_ident(column_name) END, ', ' ORDER BY ordinal_position)
  INTO columns_sql FROM information_schema.columns WHERE table_schema='public' AND table_name='video_results';
  EXECUTE 'CREATE OR REPLACE VIEW public.beeeval_benchmark_results WITH (security_invoker=true) AS SELECT '
    || columns_sql || ' FROM public.video_results vr JOIN public.video_case_search_text st ON st.result_id=vr.id';
  -- Existing database readers retain the same dataset; no application user is added.
  FOR reader IN SELECT DISTINCT grantee FROM information_schema.role_table_grants
    WHERE table_schema='public' AND table_name='video_results' AND privilege_type='SELECT' AND grantee<>'PUBLIC'
  LOOP
    EXECUTE format('GRANT SELECT ON public.beeeval_benchmark_results, public.video_case_search_text TO %I',reader);
  END LOOP;
END
$block$;
ANALYZE public.video_case_search_text;
