import { Router, Request, Response } from 'express';
import {
  buildSceneVideoPrompt,
  parseNlEdit,
  polishScript,
  recommendShots,
  suggestFrameFromDesign,
} from '../../../shared/aiHelpers.js';
import { isLlmConfigured, llmChat } from '../llmClient.js';

const router = Router();

router.post('/polish-script', async (req: Request, res: Response) => {
  const text = String(req.body?.text || '').trim();
  if (!text) return res.status(400).json({ error: 'text is required' });
  const tone = String(req.body?.tone || '导购');
  const brandName = String(req.body?.brand_name || req.body?.brandName || '').trim();

  if (isLlmConfigured()) {
    try {
      const system = [
        '你是电商导购短视频口播编辑，只输出润色后的口播正文，不要解释。',
        `语气：${tone}，简洁口语化，保留 {变量} 占位符，80-180 字为宜。`,
        brandName ? `品牌：${brandName}` : '',
      ].filter(Boolean).join('\n');
      const llmText = (await llmChat(system, text, 0.4)).replace(/^["']|["']$/g, '').trim();
      if (llmText) {
        return res.json({ text: llmText, changed: llmText !== text, source: 'llm' });
      }
    } catch {
      /* fallback to rules */
    }
  }

  const polished = polishScript(text, tone);
  res.json({ text: polished, changed: polished !== text, source: 'rules' });
});

router.post('/scene-prompt', (req: Request, res: Response) => {
  const sceneDescription = String(req.body?.scene_description || req.body?.sceneDescription || '').trim();
  if (!sceneDescription) return res.status(400).json({ error: 'scene_description is required' });
  const prompt = buildSceneVideoPrompt(sceneDescription, {
    templateType: String(req.body?.template_type || req.body?.templateType || '电商带货'),
    cameraShot: String(req.body?.camera_shot || req.body?.cameraShot || '中景稳定镜头'),
    brandTone: String(req.body?.brand_tone || req.body?.brandTone || '专业可信'),
  });
  res.json({ prompt });
});

router.post('/recommend-shots', (req: Request, res: Response) => {
  const sceneDescription = String(req.body?.scene_description || req.body?.sceneDescription || '').trim();
  const shots = Array.isArray(req.body?.shots) ? req.body.shots : [];
  const limit = Math.min(10, Math.max(1, Number(req.body?.limit) || 3));
  const recommendations = recommendShots(sceneDescription, shots, limit);
  res.json({ recommendations });
});

router.post('/nl-edit', (req: Request, res: Response) => {
  const command = String(req.body?.command || '').trim();
  const segIndex = Number(req.body?.seg_index ?? req.body?.segIndex ?? 0);
  if (!command) return res.status(400).json({ error: 'command is required' });
  const patches = parseNlEdit(command, segIndex);
  if (!patches) {
    return res.status(422).json({
      error: '暂无法理解该指令，可尝试：「把时长改成 8 秒」「开启字幕」「转场改成淡入淡出」',
      patches: [],
    });
  }
  res.json({ patches, summary: patches.map((p) => `${p.path} → ${JSON.stringify(p.value)}`).join('; ') });
});

router.post('/suggest-frame', (req: Request, res: Response) => {
  const designMd = String(req.body?.design_md || req.body?.designMd || '').trim();
  if (!designMd) return res.status(400).json({ error: 'design_md is required' });
  const frameMd = suggestFrameFromDesign(designMd);
  res.json({ frame_md: frameMd });
});

export default router;