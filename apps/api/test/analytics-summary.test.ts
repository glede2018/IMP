import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeVideoMetrics, sumKnown } from "../src/analytics-summary.js";

test("净增粉丝仅汇总有期初基线的账号，全部缺失仍为空", () => {
  assert.equal(sumKnown([-7, null, 0]), -7);
  assert.equal(sumKnown([null, null]), null);
  assert.equal(sumKnown([]), null);
  assert.equal(sumKnown([0, null]), 0);
});

const empty = {
  views: null,
  likes: null,
  comments: null,
  shares: null,
  collects: null,
};
test("部分视频缺少基线时保留已知增量和真实零值，不用累计值补齐", () => {
  const stats = summarizeVideoMetrics([
    { metrics: { views: 312, likes: 1, comments: 0, shares: 0, collects: 2 } },
    { metrics: empty },
  ]);
  assert.deepEqual(stats.metrics, {
    views: 312,
    likes: 1,
    comments: 0,
    shares: 0,
    collects: 2,
  });
  assert.deepEqual(stats.metricCoverage, {
    total: 2,
    views: 1,
    likes: 1,
    comments: 1,
    shares: 1,
    collects: 1,
  });
  assert.equal(stats.rates.likes, 1 / 312);
  assert.equal(stats.rates.collects, 2 / 312);
});
test("比例使用相同视频的播放和互动，不将缺失指标当作零", () => {
  const stats = summarizeVideoMetrics([
    { metrics: { ...empty, views: 100, likes: 10, collects: 5 } },
    { metrics: { ...empty, likes: 90 } },
    { metrics: { ...empty, views: 900, comments: 9 } },
  ]);
  assert.equal(stats.metrics.likes, 100);
  assert.equal(stats.rates.likes, 0.1);
  assert.equal(stats.rates.comments, 0.01);
  assert.equal(stats.rates.collects, 0.05);
  assert.equal(stats.rateCoverage.likes, 1);
  assert.equal(stats.rates.shares, null);
});
test("全部缺失保持空值，零播放不计算比例，负修正保留", () => {
  assert.deepEqual(summarizeVideoMetrics([]).metrics, empty);
  assert.deepEqual(summarizeVideoMetrics([{ metrics: empty }]).metrics, empty);
  const zero = summarizeVideoMetrics([
    { metrics: { views: 0, likes: 0, comments: 0, shares: 0, collects: 0 } },
  ]);
  assert.equal(zero.metrics.likes, 0);
  assert.equal(zero.rates.likes, null);
  const corrected = summarizeVideoMetrics([
    { metrics: { ...empty, views: -10, likes: -2 } },
  ]);
  assert.equal(corrected.metrics.views, -10);
  assert.equal(corrected.metrics.likes, -2);
  assert.equal(corrected.rates.likes, null);
});
