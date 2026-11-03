// 所有内容均为模拟数据；样本值不参与提示词拼装。
export const fields = [
  {
    name: "发生日期",
    meaning: "本次业务事项实际发生的日期",
    guidance: "查找业务发生日期，不取文档生成日期。",
    enabled: true,
  },
  {
    name: "金额",
    meaning: "本次业务事项的含税总金额",
    guidance: "查找含税总金额，保留原文单位，区分预付款。",
    enabled: true,
  },
  {
    name: "主体名称",
    meaning: "本次事项的发起主体名称",
    guidance: "查找发起主体，保留完整名称，不取接收方。",
    enabled: true,
  },
];
export const documentText = `业务事项确认单（模拟）
编号：DEMO-2025-042

发起主体：示例甲方
接收主体：示例乙方
业务发生日期：2025年3月8日
事项：设备维护服务

含税总金额：12.50万元
其中预付款：2.00万元
结算状态：待结算

备注：本单用于演示文档抽取，不代表真实交易。
文档生成日期：2025年3月10日`;
export const sampleValues = {
  发生日期: "2025年3月8日",
  金额: "12.50万元",
  主体名称: "示例甲方",
};
export const nodes = {
  pdf: {
    title: "PDF 文件",
    kind: "输入 / 模拟业务文档",
    input: "待解析的业务 PDF",
    output: "传递给前置程序的文件",
    description: "文档是事实来源。这里使用脱敏模拟文本，不上传或解析真实 PDF。",
  },
  text: {
    title: "前置程序转文本",
    kind: "普通工程 / 非 LLM",
    input: "PDF 文件",
    output: "可供后续处理的文档文本",
    description:
      "由前置程序完成文本转换；这是工程能力，不是大模型抽取。本演示直接提供转换后的模拟文本。",
  },
  assembly: {
    title: "提示词拼装器",
    kind: "普通工程 / 核心讲解点",
    input: "字段配置 + 文档文本",
    output: "固定规则 + 动态字段 + 文档内容",
    description:
      "把业务同事对字段的自然语言定义放入统一模板。不要求业务方填写样例，也不调用模型。",
  },
  llm: {
    title: "LLM 抽取",
    kind: "唯一的大模型环节",
    input: "系统拼装的完整提示词",
    output: "结构化 JSON 中间数据",
    description:
      "按字段定义从文档中抽取原始值。本站不连接模型，只展示固定样本，不能据此评估抽取效果。",
  },
  rules: {
    title: "按字段规则转换",
    kind: "普通工程 / 非 LLM",
    input: "JSON 中间数据",
    output: "符合存储约定的字段值",
    description:
      "格式统一、单位换算、枚举映射均是确定性规则。保留 null；此处不展开复杂实现。",
  },
  database: {
    title: "入库",
    kind: "普通工程 / 非 LLM",
    input: "转换并校验后的结构化数据",
    output: "可供业务使用的数据记录",
    description:
      "真实系统将处理后的结果写入数据库。本站仅展示转换结果，不连接数据库、不执行入库。",
  },
};
