import type Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';

export function seedLibraryItems(db: Database.Database): void {
  const count = (db.prepare('SELECT COUNT(*) AS c FROM library_items').get() as { c: number }).c;
  if (count > 0) return;

  const insert = db.prepare(
    `INSERT INTO library_items (id, category, name, description, tags, parent_id, payload_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );

  const scripts = [
    {
      name: '新品发布开场',
      description: 'OpenStoryline 风格：短句开场 + 卖点递进',
      tags: ['电商', '新品'],
      content: '大家好，今天给大家带来一款值得期待的新品。\n它不仅在品质上全面升级，更在体验上做到了行业领先。\n接下来，让我们一起看看它的三大核心亮点。',
    },
    {
      name: '母婴导购话术',
      description: '参考导购场景：信任背书 + 场景化讲解',
      tags: ['母婴', '导购'],
      content: '当妈后怎么选奶粉？\n飞鹤卓睿，懂妈妈更懂宝贝。\n临床实证很靠谱，营养吸收更安心。',
    },
    {
      name: '旅行 Vlog 旁白',
      description: 'OpenStoryline script_templates：节奏轻快',
      tags: ['旅行', 'Vlog'],
      content: '清晨的阳光洒在街道上，我们踏上了新的旅程。\n每一帧风景都值得被记录，每一次相遇都充满惊喜。',
    },
  ];

  for (const script of scripts) {
    insert.run(
      uuidv4(),
      'script',
      script.name,
      script.description,
      JSON.stringify(script.tags),
      '',
      JSON.stringify({ content: script.content, format: 'plain' }),
    );
  }

  const kbId = uuidv4();
  insert.run(kbId, 'knowledge', '导购产品知识库', '品牌卖点、FAQ、合规话术集中维护', JSON.stringify(['导购', 'FAQ']), '', JSON.stringify({ source: 'seed' }));

  const docs = [
    { name: '奶粉选购 FAQ', content: 'Q: 如何选奶粉？\nA: 看配方、看奶源、看临床实证。' },
    { name: '直播合规提示', content: '避免绝对化用语；功效描述需有依据；价格促销需标注有效期。' },
  ];
  for (const doc of docs) {
    insert.run(
      uuidv4(),
      'knowledge_doc',
      doc.name,
      '',
      JSON.stringify(['FAQ']),
      kbId,
      JSON.stringify({ content: doc.content }),
    );
  }

  const voices = [
    { name: '默认女声', description: 'zh-CN-XiaoxiaoNeural 风格', payload: { kind: 'tts', provider: 'yuntts', voice_id: 'zh-CN-XiaoxiaoNeural', language: 'zh-CN' } },
    { name: '沉稳男声', description: '适合企业培训讲解', payload: { kind: 'tts', provider: 'yuntts', voice_id: 'zh-CN-YunxiNeural', language: 'zh-CN' } },
  ];
  for (const voice of voices) {
    insert.run(uuidv4(), 'voice', voice.name, voice.description, JSON.stringify(['TTS']), '', JSON.stringify(voice.payload));
  }

  const bgms = [
    { name: '轻松商务 BGM', description: '轻快企业宣传背景音乐', tags: ['BGM', '商务'], payload: { kind: 'bgm', duration: '60s', mood: '轻松' } },
    { name: '温馨钢琴 BGM', description: '钢琴旋律，适合生活/家居导购', tags: ['BGM', '温馨'], payload: { kind: 'bgm', duration: '90s', mood: '温馨' } },
  ];
  for (const bgm of bgms) {
    insert.run(uuidv4(), 'voice', bgm.name, bgm.description, JSON.stringify(bgm.tags), '', JSON.stringify(bgm.payload));
  }
}