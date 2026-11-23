-- Compact, synchronously maintained search text. The source records and scores
-- remain untouched; authorization always joins the live source/publication rows.
-- Never use this table as a public or independently authorized data source.
SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.beeeval_case_search_text(cid text, filename text, transcript text, meta jsonb)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $function$
  SELECT LOWER(REGEXP_REPLACE(normalize(CONCAT_WS(' ',cid,filename,transcript,
    jsonb_path_query_array(jsonb_build_array(
      meta->'user_question',meta->'system_response',meta->'dialogue',meta->'summary',
      meta->'content',meta->'task_detail',meta->'task_family',meta->'intent_label',
      meta->'labels',meta->'case_tags',meta->'scenario_tags'),
      '$.** ? (@.type() == "string" || @.type() == "number")')::text),NFKC),
    '[[:punct:][:space:]]', '', 'g'))
$function$;

CREATE TABLE IF NOT EXISTS public.video_case_search_text (
  result_id text PRIMARY KEY,
  content text NOT NULL,
  task_detail text,
  acceptance_tag text,
  projection_version integer NOT NULL DEFAULT 2
);
ALTER TABLE public.video_case_search_text ADD COLUMN IF NOT EXISTS task_detail text;
ALTER TABLE public.video_case_search_text ADD COLUMN IF NOT EXISTS acceptance_tag text;
ALTER TABLE public.video_case_search_text ADD COLUMN IF NOT EXISTS projection_version integer NOT NULL DEFAULT 1;

-- The source ID is text (some installations also store UUID-looking IDs as
-- text). Preserve it verbatim, including identifiers that are not UUIDs.
DO $block$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
      AND table_name='video_case_search_text' AND column_name='result_id' AND data_type='uuid') THEN
    ALTER TABLE public.video_case_search_text ALTER COLUMN result_id TYPE text USING result_id::text;
  END IF;
END
$block$;

CREATE OR REPLACE FUNCTION public.beeeval_sync_case_search_text()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.video_case_search_text WHERE result_id=OLD.id;
    RETURN OLD;
  END IF;
  INSERT INTO public.video_case_search_text(result_id,content,task_detail,acceptance_tag,projection_version)
  VALUES(NEW.id,public.beeeval_case_search_text(NEW.case_id,NEW.video_name,NEW.transcript,NEW.metadata),NEW.metadata->>'task_detail',NEW.metadata->>'acceptance_tag',2)
  ON CONFLICT(result_id) DO UPDATE SET content=EXCLUDED.content,
    task_detail=EXCLUDED.task_detail,acceptance_tag=EXCLUDED.acceptance_tag,projection_version=2;
  RETURN NEW;
END
$function$;

DO $block$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='beeeval_sync_case_search_text' AND tgrelid='public.video_results'::regclass) THEN
    CREATE TRIGGER beeeval_sync_case_search_text
    AFTER INSERT OR UPDATE OF case_id,video_name,transcript,metadata OR DELETE
    ON public.video_results FOR EACH ROW EXECUTE FUNCTION public.beeeval_sync_case_search_text();
  END IF;
END
$block$;

-- Install the trigger before backfill. If a writer races this statement, its
-- newer projection wins: DO NOTHING cannot overwrite it with an older snapshot.
INSERT INTO public.video_case_search_text(result_id,content,task_detail,acceptance_tag,projection_version)
SELECT vr.id,public.beeeval_case_search_text(vr.case_id,vr.video_name,vr.transcript,vr.metadata),vr.metadata->>'task_detail',vr.metadata->>'acceptance_tag',2
FROM public.video_results vr
WHERE NOT EXISTS (SELECT 1 FROM public.video_case_search_text st WHERE st.result_id=vr.id)
ON CONFLICT(result_id) DO NOTHING;

UPDATE public.video_case_search_text st SET task_detail=vr.metadata->>'task_detail',
  acceptance_tag=vr.metadata->>'acceptance_tag',projection_version=2
FROM public.video_results vr WHERE st.result_id=vr.id AND st.projection_version<2;

ANALYZE public.video_case_search_text;
