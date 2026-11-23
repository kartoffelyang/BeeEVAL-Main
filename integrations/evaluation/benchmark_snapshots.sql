-- Durable derived benchmark responses. No scores or publication decisions change.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.beeeval_benchmark_revision (
    singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
    revision bigint NOT NULL DEFAULT 1,
    changed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO public.beeeval_benchmark_revision(singleton) VALUES (true)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.beeeval_benchmark_snapshots (
    cache_key text PRIMARY KEY,
    namespace text NOT NULL,
    parameters jsonb NOT NULL,
    scope jsonb NOT NULL,
    fingerprint text NOT NULL,
    revision bigint NOT NULL,
    payload jsonb NOT NULL,
    computed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE OR REPLACE FUNCTION public.beeeval_benchmark_changed()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
    UPDATE public.beeeval_benchmark_revision
       SET revision=revision+1, changed_at=clock_timestamp() WHERE singleton;
    RETURN NULL;
END
$function$;

-- Draft evaluation writes do not invalidate the published research snapshots.
-- Transition tables turn a bulk write into at most one invalidation per statement.
CREATE OR REPLACE FUNCTION public.beeeval_published_benchmark_changed()
RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE relevant boolean;
BEGIN
    IF TG_TABLE_NAME='video_results' THEN
        IF TG_OP='DELETE' THEN
            SELECT EXISTS(SELECT 1 FROM old_rows r JOIN public.evaluation_publication_results p ON p.result_id=r.id) INTO relevant;
        ELSIF TG_OP='UPDATE' THEN
            SELECT EXISTS(SELECT 1 FROM new_rows r JOIN public.evaluation_publication_results p ON p.result_id=r.id
                          UNION ALL SELECT 1 FROM old_rows r JOIN public.evaluation_publication_results p ON p.result_id=r.id) INTO relevant;
        ELSE
            SELECT EXISTS(SELECT 1 FROM new_rows r JOIN public.evaluation_publication_results p ON p.result_id=r.id) INTO relevant;
        END IF;
    ELSE
        IF TG_OP='DELETE' THEN
            SELECT EXISTS(SELECT 1 FROM old_rows r JOIN public.evaluation_publication_results p ON p.result_id=r.result_id) INTO relevant;
        ELSIF TG_OP='UPDATE' THEN
            SELECT EXISTS(SELECT 1 FROM new_rows r JOIN public.evaluation_publication_results p ON p.result_id=r.result_id
                          UNION ALL SELECT 1 FROM old_rows r JOIN public.evaluation_publication_results p ON p.result_id=r.result_id) INTO relevant;
        ELSE
            SELECT EXISTS(SELECT 1 FROM new_rows r JOIN public.evaluation_publication_results p ON p.result_id=r.result_id) INTO relevant;
        END IF;
    END IF;
    IF relevant THEN
        UPDATE public.beeeval_benchmark_revision
           SET revision=revision+1, changed_at=clock_timestamp() WHERE singleton;
    END IF;
    RETURN NULL;
END
$function$;

DO $block$
DECLARE source_table text; writer text;
BEGIN
    FOREACH source_table IN ARRAY ARRAY['evaluation_publication_results','vehicle_aggregated_scores','vehicle_overall_scores','test_case_pool']
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS beeeval_snapshot_revision ON public.%I',source_table);
        EXECUTE format('CREATE TRIGGER beeeval_snapshot_revision AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.beeeval_benchmark_changed()',source_table);
    END LOOP;
    FOREACH source_table IN ARRAY ARRAY['video_results','evaluation_scores']
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS beeeval_snapshot_insert ON public.%I',source_table);
        EXECUTE format('DROP TRIGGER IF EXISTS beeeval_snapshot_update ON public.%I',source_table);
        EXECUTE format('DROP TRIGGER IF EXISTS beeeval_snapshot_delete ON public.%I',source_table);
        EXECUTE format('DROP TRIGGER IF EXISTS beeeval_snapshot_truncate ON public.%I',source_table);
        EXECUTE format('CREATE TRIGGER beeeval_snapshot_insert AFTER INSERT ON public.%I REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.beeeval_published_benchmark_changed()',source_table);
        EXECUTE format('CREATE TRIGGER beeeval_snapshot_update AFTER UPDATE ON public.%I REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.beeeval_published_benchmark_changed()',source_table);
        EXECUTE format('CREATE TRIGGER beeeval_snapshot_delete AFTER DELETE ON public.%I REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION public.beeeval_published_benchmark_changed()',source_table);
        EXECUTE format('CREATE TRIGGER beeeval_snapshot_truncate AFTER TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.beeeval_benchmark_changed()',source_table);
    END LOOP;
    -- Only existing application writers can maintain this cache, never PUBLIC.
    FOR writer IN SELECT DISTINCT grantee FROM information_schema.role_table_grants
        WHERE table_schema='public' AND table_name='video_results' AND privilege_type='UPDATE' AND grantee<>'PUBLIC'
    LOOP
        EXECUTE format('GRANT SELECT, UPDATE ON public.beeeval_benchmark_revision TO %I',writer);
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.beeeval_benchmark_snapshots TO %I',writer);
    END LOOP;
END
$block$;
COMMIT;
