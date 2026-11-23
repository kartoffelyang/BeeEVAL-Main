"""PostgreSQL regression in an isolated schema, unconditionally rolled back.

Run in the API environment after copying this test and the integration SQL.
The real evaluation, score, publication and account tables are never written.
"""
from pathlib import Path
import uuid
from api.services.supabase_client import supabase

schema = 'snapshot_test_' + uuid.uuid4().hex[:12]
sql = (Path(__file__).resolve().parents[1] / 'integrations/evaluation/benchmark_snapshots.sql').read_text()
sql = sql.replace('BEGIN;', '', 1).rsplit('COMMIT;', 1)[0]
sql = sql.replace('public.', schema + '.').replace("table_schema='public'", "table_schema='" + schema + "'")
connection = supabase._get_connection()
try:
    with connection.cursor() as cursor:
        cursor.execute('CREATE SCHEMA ' + schema)
        cursor.execute('SET LOCAL search_path TO ' + schema + ', public')
        cursor.execute('''CREATE TABLE video_results(id text PRIMARY KEY, metadata jsonb);
            CREATE TABLE evaluation_scores(result_id text, score numeric);
            CREATE TABLE evaluation_publication_results(result_id text PRIMARY KEY);
            CREATE TABLE vehicle_aggregated_scores(score numeric);
            CREATE TABLE vehicle_overall_scores(score numeric);
            CREATE TABLE test_case_pool(case_id text);''')
        cursor.execute(sql)

        def revision():
            cursor.execute('SELECT revision FROM beeeval_benchmark_revision')
            return cursor.fetchone()[0]

        r = revision()
        cursor.execute("INSERT INTO video_results VALUES ('draft','{}'::jsonb),('published','{}'::jsonb)")
        cursor.execute("INSERT INTO evaluation_scores VALUES ('draft',3)")
        assert revision() == r, 'Draft insert invalidated published snapshots'
        cursor.execute("UPDATE video_results SET metadata='{\"status\":\"completed\"}'::jsonb WHERE id='draft'")
        cursor.execute("UPDATE evaluation_scores SET score=4 WHERE result_id='draft'")
        assert revision() == r, 'Draft update invalidated published snapshots'
        cursor.execute("INSERT INTO evaluation_publication_results VALUES ('published')")
        assert revision() == r + 1
        r = revision()
        cursor.execute("UPDATE video_results SET metadata='{\"task_success\":true}'::jsonb WHERE id='published'")
        assert revision() == r + 1
        cursor.execute("INSERT INTO evaluation_scores VALUES ('published',3),('published',4)")
        assert revision() == r + 2, 'Bulk insert must invalidate once, not once per row'
        cursor.execute("UPDATE evaluation_scores SET score=5 WHERE result_id='published'")
        assert revision() == r + 3
        cursor.execute("DELETE FROM evaluation_scores WHERE result_id='published'")
        assert revision() == r + 4
        cursor.execute('SAVEPOINT cancelled_update')
        cursor.execute("UPDATE video_results SET metadata='{}'::jsonb WHERE id='published'")
        assert revision() == r + 5
        cursor.execute('ROLLBACK TO SAVEPOINT cancelled_update')
        assert revision() == r + 4, 'Rollback changed snapshot revision'
        for table in ('vehicle_aggregated_scores','vehicle_overall_scores'):
            before = revision()
            cursor.execute('INSERT INTO ' + table + ' VALUES (4)')
            assert revision() == before + 1
        before = revision()
        cursor.execute("INSERT INTO test_case_pool VALUES ('2001')")
        assert revision() == before + 1
        cursor.execute("DELETE FROM evaluation_publication_results WHERE result_id='published'")
        assert revision() == before + 2
        cursor.execute("DELETE FROM video_results WHERE id='draft'")
        assert revision() == before + 2
        cursor.execute('TRUNCATE evaluation_scores')
        assert revision() == before + 3
    print('PASS: SQL migration, published insert/update/delete and bulk invalidation, draft isolation, publication/score/pool changes, transactional rollback and truncate; isolated schema rolled back')
finally:
    connection.rollback()
    supabase._put_connection(connection)
