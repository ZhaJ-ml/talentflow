export default async function handler(req, res) {
  // Allow requests from any origin (CORS)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { rawText } = req.body;
  if (!rawText) return res.status(400).json({ error: 'Missing rawText' });

  const systemPrompt = `你是一个人才数据清洗助手。把用户提供的原始表格转换成标准CSV格式。

【输出要求】
只输出CSV内容，不要有任何解释、不要有markdown代码块、不要有其他文字。
第一行固定表头：姓名,本科学校,硕士学校,博士学校,导师,实习,前任正职,正职,方向,备注

【解析规则】
学历列（自由文本）：
- "本博@浙大" → 本科学校=浙江大学，博士学校=浙江大学
- "本硕@北理工，博二在读@北理工&北通院，导师武玉伟&贾云得" → 本科=北理工，硕士=北理工，博士=北理工（联培），导师两人
- "北邮本科" → 本科=北京邮电大学
- "北邮研究生在读" → 硕士=北京邮电大学
- "本科@北理工，博三在读@港中大，导师于旭和程鸿" → 本科=北理工，博士=香港中文大学，导师=于旭@香港中文大学/程鸿@香港中文大学
- "在读"表示当前就读，视为正常填写

经历列（自由文本）：
- "曾在X做""曾在X实习""X实习生""研究实习生" → 实习(intern)
- "加入X""现在X""目前X""刚加入" → 正职(job)
- 有明确时序时：过去经历 → 前任正职，现在 → 正职
- 在读学生的外部机构经历通常是实习
- Google Scholar citation、奖项、论文一作、fellowship → 备注字段，用/分隔

导师格式：姓名@学校，多人用/分隔
多值用/分隔，字段含逗号时用英文双引号包裹
"—""-""无" 视为空值，个人主页列忽略

【机构名称统一】
学校：北大→北京大学，清华→清华大学，交大/上交→上海交通大学，浙大→浙江大学，北邮→北京邮电大学，北理工→北京理工大学，北通院→北京通用人工智能研究院，港中大→香港中文大学，中科院自动化所→中国科学院自动化研究所
公司：字节seed/字节Seed→字节跳动 Seed，千问/Qwen→通义千问（阿里），月之/Moonshot→月之暗面，蚂蚁Ling→蚂蚁集团，Google Brain/谷歌大脑→Google Brain，微软/MSRA→微软研究院，幻方/DeepSeek→幻方科技，Facebook AI/Meta AI→Meta AI`;

  try {
    // ── Kimi API（OpenAI 兼容格式）──
    const response = await fetch('https://api.moonshot.cn/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.KIMI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'moonshot-v1-32k',
        temperature: 0.1,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: `请处理以下原始表格数据，只输出CSV，不要有其他内容：\n\n${rawText}` }
        ]
      })
    });

    if (!response.ok) {
      const err = await response.json();
      return res.status(500).json({ error: err.error?.message || 'Kimi API error' });
    }

    const data = await response.json();
    let csv = data.choices?.[0]?.message?.content || '';
    // strip markdown fences if model wraps it anyway
    csv = csv.replace(/^```(?:csv)?\s*/i, '').replace(/\s*```\s*$/, '').trim();

    return res.status(200).json({ csv });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
