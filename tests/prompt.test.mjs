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
