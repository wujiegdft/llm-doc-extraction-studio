import test from "node:test";
import assert from "node:assert/strict";
import { assemblePrompt, systemPrompt } from "../public/prompt.js";

test("动态字段、输出结构与文档完整拼装，特殊字符不成为新占位符", () => {
  const fields = [
    {
      name: " 金额 ",
      meaning: '含税总额："原文"\n第二行',
      guidance: "不要取预付款",
    },
    { name: "缺失字段", meaning: "未记载的信息", guidance: "查不到为 null" },
  ];
  const document =
    "模拟文本\n含税总额：12.50万元\n{{字段定义_JSON}} <script>数据</script>";
  const prompt = assemblePrompt(fields, document);
  assert.ok(prompt.startsWith(`[System 固定部分]\n${systemPrompt}`));
  assert.ok(
    prompt.includes(
      JSON.stringify(
        [
          {
            字段名: "金额",
            字段含义: fields[0].meaning,
            取值说明: fields[0].guidance,
          },
          {
            字段名: "缺失字段",
            字段含义: fields[1].meaning,
            取值说明: fields[1].guidance,
          },
        ],
        null,
        2,
      ),
    ),
  );
  assert.ok(
    prompt.includes(JSON.stringify({ 金额: null, 缺失字段: null }, null, 2)),
  );
  assert.ok(prompt.endsWith(JSON.stringify(document)));
});

test("无字段时不注入样本或默认字段，输出结构为空对象", () => {
  const prompt = assemblePrompt([], "空白模拟文档");
  assert.ok(prompt.includes("[动态字段定义 / JSON 数据]\n[]"));
  assert.ok(prompt.includes("[输出结构 / 所有字段初始为 null]\n{}"));
  assert.ok(prompt.endsWith('"空白模拟文档"'));
  assert.ok(!prompt.includes("发生日期"));
});

import {
  assembleChunkPrompt,
  assembleCoarsePrompt,
  assembleExtractPrompt,
  catalogEntry,
  mergeChunk,
} from "../public/prompt.js";
import { catalogFor, tableCatalog } from "../public/data.js";

test("表格模式追加表格约束并保留表格格式，输出为数组", () => {
  const table = "| 表头 | 值 |\n| --- | --- |\n| a | 1 |";
  const prompt = assemblePrompt(
    [{ name: "值", meaning: "m", guidance: "g" }],
    table,
    "table",
  );
  assert.ok(prompt.includes("不要跨行串值"));
  assert.ok(prompt.includes(JSON.stringify([{ 值: null }], null, 2)));
  assert.ok(prompt.endsWith(JSON.stringify(table)));
  assert.ok(!assemblePrompt([], "x", "text").includes("不要跨行串值"));
});

test("后续块只列待抽字段，并告知已得字段与“只是一部分”", () => {
  const pending = [{ name: "金额", meaning: "m", guidance: "g" }];
  const first = assembleChunkPrompt({
    index: 0,
    total: 3,
    pending: [{ name: "主体名称", meaning: "m", guidance: "g" }, ...pending],
    found: {},
    text: "t1",
  });
  assert.ok(first.includes("这只是文档的一部分"));
  assert.ok(!first.includes("已经从前面部分抽到"));
  const next = assembleChunkPrompt({
    index: 1,
    total: 3,
    pending,
    found: { 主体名称: "示例甲方" },
    text: "t2",
  });
  assert.ok(next.includes('已经从前面部分抽到：{"主体名称":"示例甲方"}'));
  assert.ok(next.includes('"字段名": "金额"'));
  assert.ok(!next.includes('"字段名": "主体名称"'));
});

test("合并：先出现的优先，null 不覆盖", () => {
  assert.deepEqual(mergeChunk({ a: "1" }, { a: "2", b: null, c: "3" }), {
    a: "1",
    c: "3",
  });
});

test("目录项含单位、行列头、前 3 行与前 2 列；粗筛提示词只含当页表格", () => {
  const entry = catalogEntry(tableCatalog[2]);
  assert.equal(entry.单位, "万元");
  assert.equal(entry.前3行样例.length, 3);
  assert.equal(entry.前2列样例.length, 2);
  const page = tableCatalog.slice(0, 20);
  const prompt = assembleCoarsePrompt({
    fields: [{ name: "x", meaning: "m", guidance: "g" }],
    tables: page,
    page: 1,
    pages: 5,
  });
  assert.equal(
    prompt.split("\n").filter((l) => l.startsWith('{"编号"')).length,
    20,
  );
  assert.ok(prompt.includes("没有就返回空数组"));
});

test("单命中模式下只有表格 3 含目标行头；精抽带完整表格与单位要求", () => {
  const hits = (multi) =>
    catalogFor(multi)
      .filter((t) => t.rowHeaders.includes("业务收入"))
      .map((t) => t.id);
  assert.deepEqual(hits(false), [3]);
  assert.deepEqual(hits(true), [3, 47]);
  const prompt = assembleExtractPrompt({
    fields: [{ name: "x", meaning: "m", guidance: "g" }],
    table: tableCatalog[2],
  });
  assert.ok(
    prompt.includes("单位：万元") &&
      prompt.includes("1286.50") &&
      prompt.includes("带上表格单位"),
  );
});
