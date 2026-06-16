const CAMERA_MOVEMENTS = [
  { label: '缓慢推进', value: 'Slow push in, camera gradually moves toward the subject' },
  { label: '拉远', value: 'Pull back, camera slowly reveals the wider scene' },
  { label: '左/右横移', value: 'Smooth pan left/right, following the subject' },
  { label: '俯拍', value: 'Bird\'s eye overhead shot, top-down perspective' },
  { label: '仰拍', value: 'Low angle shot, looking up at the subject' },
  { label: '环绕', value: 'Orbit shot, camera circles around the subject' },
  { label: '跟拍', value: 'Tracking shot, camera follows the subject movement' },
  { label: '特写', value: 'Extreme close-up on details' },
  { label: '远景', value: 'Wide establishing shot of the full environment' },
  { label: '手持感', value: 'Handheld camera feel, subtle natural movement' },
];

const SCENE_MOODS = [
  { label: '温暖', value: 'Warm golden hour lighting, soft shadows, cozy atmosphere' },
  { label: '科技感', value: 'Cool blue tones, clean lines, futuristic tech aesthetic' },
  { label: '高端', value: 'Luxurious setting, dramatic lighting, premium materials' },
  { label: '活力', value: 'Vibrant colors, dynamic energy, youthful atmosphere' },
  { label: '简约', value: 'Clean minimalist background, white space, elegant simplicity' },
  { label: '自然', value: 'Natural daylight, organic textures, outdoor freshness' },
];

const ECOMMERCE_PATTERNS: Record<string, string> = {
  '电商带货': 'Product showcase style: clean background, hero product placement, close-up on details and textures. Camera slowly orbits the product, highlighting key features with gentle zoom-ins. Professional studio lighting with soft reflections.',
  '门店活动': 'Event promotion style: energetic atmosphere, storefront exterior then interior reveal, people enjoying the space. Warm inviting lighting, festive decorations, call-to-action overlay.',
  '品牌宣传': 'Brand storytelling style: cinematic quality, dramatic reveals, lifestyle imagery. Slow deliberate camera movements, high production value, emotional resonance through lighting and pacing.',
  '新品发布': 'Product launch style: mystery build-up, dramatic reveal, feature highlights. Dark background with spotlight, product emerges from shadow, details illuminated sequentially.',
  '爆款推荐': 'Review/recommendation style: authentic feel, hands-on demonstration, real-world usage. Medium shot of person using product, cut to close-ups of benefits, genuine reactions.',
  '知识科普': 'Educational style: clear visuals, information hierarchy, animated elements. Clean background, text overlays for key points, smooth transitions between concepts.',
};

export function enhanceSceneDescription(
  simpleDescription: string,
  templateType: string = '',
  cameraShot: string = '',
): string {
  if (!simpleDescription.trim()) return '';

  let enhanced = simpleDescription;

  const pattern = ECOMMERCE_PATTERNS[templateType];
  if (pattern) {
    enhanced = `${pattern}\n\nScene: ${simpleDescription}`;
  }

  if (cameraShot) {
    const shotMap: Record<string, string> = {
      'close-up': 'Close-up shot, filling the frame with detail',
      'medium': 'Medium shot, waist-up framing',
      'wide': 'Wide shot, full environment visible',
    };
    const shotDesc = shotMap[cameraShot];
    if (shotDesc) {
      enhanced += `\nCamera: ${shotDesc}`;
    }
  }

  enhanced += `\nStyle: Professional commercial quality, 4K detail, cinematic color grading`;

  return enhanced;
}

export function getCameraMovements() { return CAMERA_MOVEMENTS; }
export function getSceneMoods() { return SCENE_MOODS; }
export function getEcommercePatterns() { return ECOMMERCE_PATTERNS; }

export function buildPromptFromTemplate(config: {
  type: string;
  description: string;
  cameraShot: string;
  mood: string;
  duration: number;
}): string {
  const parts: string[] = [];

  const pattern = ECOMMERCE_PATTERNS[config.type];
  if (pattern) parts.push(pattern);

  if (config.description) parts.push(`Scene: ${config.description}`);

  const shotMap: Record<string, string> = {
    'close-up': 'Extreme close-up, filling frame with subject detail',
    'medium': 'Medium shot, balanced composition',
    'wide': 'Wide establishing shot, full environment',
  };
  if (config.cameraShot && shotMap[config.cameraShot]) {
    parts.push(`Camera: ${shotMap[config.cameraShot]}`);
  }

  const mood = SCENE_MOODS.find(m => m.label === config.mood);
  if (mood) parts.push(`Lighting: ${mood.value}`);

  parts.push(`Duration: ${config.duration}s, smooth pacing`);

  return parts.join('\n');
}
