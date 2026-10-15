const path = require("node:path"),
  assert = require("node:assert/strict");
const root = process.cwd();
const esbuild = require(require.resolve("esbuild", { paths: [root] }));
(async () => {
  const out = path.join(root, "node_modules/.tmp/benchmark-refinements.cjs");
  await esbuild.build({
    stdin: {
      contents:
        "export * from './src/utils/scoreRanges';export * from './local-server/case-search';export * from './src/pages/vehicle-scores/industryComparison';",
      resolveDir: root,
      loader: "ts",
    },
    outfile: out,
    bundle: true,
    platform: "node",
    format: "cjs",
  });
  const {
    scoreBounds,
    SCORE_RANGES,
    queryCases,
    industryRows,
    sortIndustryRows,
  } = require(out);
  const scores = [0, 1.99, 2, 2.99, 3, 3.99, 4, 4.99, 5];
  const records = scores.map((score) => ({
    id: String(score),
    case_id: String(score),
    metadata: { response_quality_score: score },
  }));
  const expected = {
    "4-5": [4, 4.99, 5],
    "3-4": [3, 3.99],
    "2-3": [2, 2.99],
    "below-2": [0, 1.99],
  };
  for (const range of SCORE_RANGES) {
    const params = new URLSearchParams(
      Object.entries(scoreBounds(range.value)).map(([k, v]) => [k, String(v)]),
    );
    const matches = queryCases(records, params).data.map(
      (r) => r.metadata.response_quality_score,
    );
    assert.deepEqual(matches, expected[range.value]);
  }
  assert.equal(
    queryCases(
      [{ id: "x", metadata: { response_quality_score: "N/A" } }],
      new URLSearchParams({ min_score: "2" }),
    ).total,
    0,
  );
  const dataset = (rate, score, cases) => ({
    by_grade: [
      {
        grade: "Basic",
        task_details: [
          {
            task_detail: "task",
            completion_rate: rate,
            score,
            case_count: cases,
          },
        ],
      },
    ],
  });
  const row = industryRows(
    dataset(0.8, 4, 20),
    [dataset(0.5, 2, 100), dataset(0.9, 4, 1)],
    "rate",
  )[0];
  assert.equal(row.reference, 0.7);
  assert.ok(Math.abs(row.delta - 0.1) < 1e-9);
  assert.equal(row.referenceVehicles, 2);
  assert.equal(row.primaryCases, 20);
  const score = industryRows(
    dataset(0.8, 4, 20),
    [dataset(0.5, 2, 100), dataset(0.9, 4, 1)],
    "score",
  )[0];
  assert.equal(score.reference, 3);
  assert.equal(score.delta, 1);
  const missing = industryRows(
    undefined,
    [dataset(0.5, null, 100)],
    "score",
  )[0];
  assert.equal(missing.primary, null);
  assert.equal(missing.reference, null);
  assert.equal(missing.delta, null);
  assert.equal(missing.referenceVehicles, 0);
  assert.equal(
    industryRows(dataset(0.8, 4, 20), [], "rate", "other").length,
    0,
  );
  const sortable = [
    { ...row, key: "a", primary: 0.4, reference: 0.6, delta: -0.2 },
    { ...row, key: "b", primary: 0.8, reference: 0.5, delta: 0.3 },
    { ...row, key: "c", primary: null, reference: null, delta: null },
  ];
  for (const field of ["primary", "reference", "delta"]) {
    const asc = sortIndustryRows(sortable, field, "asc");
    const desc = sortIndustryRows(sortable, field, "desc");
    assert.equal(asc[2].key, "c");
    assert.equal(desc[2].key, "c");
    assert.ok(asc[0][field] <= asc[1][field]);
    assert.ok(desc[0][field] >= desc[1][field]);
  }
  assert.deepEqual(
    sortable.map((r) => r.key),
    ["a", "b", "c"],
  );
  console.log(
    "PASS: all four score bands with exact boundaries and invalid scores; industry equal-weight means, deltas, scope counts, missing data and grade filters.",
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
