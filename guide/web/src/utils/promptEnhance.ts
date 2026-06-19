const CAMERA_MOVEMENTS = [
  { label: '缓慢推进', value: 'Slow push in, camera gradually moves toward the subject' },
  { label: '拉远', value: 'Pull back, camera slowly reveals the wider scene' },
  { label: '左/右横移', value: 'Smooth pan left/right, following the subject' },
  { label: '俯拍', value: "Bird's eye overhead shot, top-down perspective" },
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
  电商带货: 'Product showcase style: clean background, hero product placement, close-up on details and textures.',
  门店活动: 'Event promotion style: energetic atmosphere, storefront exterior then interior reveal.',
  品牌宣传: 'Brand storytelling style: cinematic quality, dramatic reveals, lifestyle imagery.',
  新品发布: 'Product launch style: mystery build-up, dramatic reveal, feature highlights.',
  爆款推荐: 'Review/recommendation style: authentic feel, hands-on demonstration.',
  知识科普: 'Educational style: clear visuals, information hierarchy, animated elements.',
};

export function enhanceSceneDescription(
  simpleDescription: string,
  templateType: string = '',
  cameraShot: string = '',
): string {
  if (!simpleDescription.trim()) return '';

  let enhanced = simpleDescription;
  const pattern = ECOMMERCE_PATTERNS[templateType];
  if (pattern) enhanced = `${pattern}\n\nScene: ${simpleDescription}`;

  if (cameraShot) {
    const shotMap: Record<string, string> = {
      'close-up': 'Close-up shot, filling the frame with detail',
      medium: 'Medium shot, waist-up framing',
      wide: 'Wide shot, full environment visible',
    };
    const shotDesc = shotMap[cameraShot];
    if (shotDesc) enhanced += `\nCamera: ${shotDesc}`;
  }

  enhanced += '\nStyle: Professional commercial quality, 4K detail, cinematic color grading';
  return enhanced;
}

export function getCameraMovements() {
  return CAMERA_MOVEMENTS;
}

export function getSceneMoods() {
  return SCENE_MOODS;
}