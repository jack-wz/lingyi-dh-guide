import { useState, useEffect } from 'react';
import { useEditorStore } from '../store/editorStore';
import type { AssetTab } from '../store/editorStore';
import { IconUser, IconImage, IconType, IconMusic, IconSparkles, IconSearch } from './Icons';
import { SCENE_IMAGES, SCENE_CATEGORIES } from '../data/sceneImages';
import { SUBTITLE_STYLES } from '../data/subtitleStyles';
import { SOUND_EFFECTS, SOUND_CATEGORIES } from '../data/soundEffects';
import { ANIMATION_PRESETS, ANIM_CATEGORIES } from '../data/animations';
import { getAssetMapFromDsl } from '@shared/assetResolver';

interface Props {
  tab: AssetTab;
  selectedDhId?: string;
  onSelectDh?: (id: string) => void;
  onEdited?: () => void;
  showSearch?: boolean;
}

export default function AssetLibrary({ tab, selectedDhId = '', onSelectDh, onEdited, showSearch = true }: Props) {
  const dsl = useEditorStore(s => s.dsl);
  const currentSegIndex = useEditorStore(s => s.currentSegIndex);
  const updateDsl = useEditorStore(s => s.updateDsl);
  const [digitalHumans, setDigitalHumans] = useState<Array<{ id: string; name: string; status: string; face_photo_url?: string }>>([]);
  const [libraryAssets, setLibraryAssets] = useState<Array<{ id: string; name: string; type: string; file_url: string }>>([]);
  const [sceneCategory, setSceneCategory] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/digital-humans').then(r => r.json()).then(setDigitalHumans).catch(() => {});
  }, []);

  useEffect(() => {
    if (tab !== 'sticker') return;
    fetch('/api/assets?type=sticker,image,video,logo&limit=120')
      .then(r => r.json())
      .then((data) => setLibraryAssets(data.items || []))
      .catch(() => setLibraryAssets([]));
  }, [tab]);

  const seg = dsl?.segments[currentSegIndex];
  const getSegmentStartTime = useEditorStore(s => s.getSegmentStartTime);
  const currentTime = useEditorStore(s => s.currentTime);
  const setSelectedElement = useEditorStore(s => s.setSelectedElement);
  const readyDhs = digitalHumans.filter(h => h.status === 'ready');

  const applySceneBackground = (scene: { description: string; url?: string }) => {
    if (!dsl) return;
    updateDsl(d => {
      const segs = [...d.segments];
      segs[currentSegIndex] = {
        ...segs[currentSegIndex],
        scene_description: scene.description,
        scene_image_url: scene.url || '',
        thumbnail_url: scene.url || segs[currentSegIndex].thumbnail_url || '',
      };
      return { ...d, segments: segs };
    });
    onEdited?.();
  };

  const stickerEntries = dsl ? Object.entries(getAssetMapFromDsl(dsl)).filter(([, url]) => Boolean(url)) : [];
  const catalogStickers = [
    ...stickerEntries.map(([key, url]) => ({ key, url, source: 'template' as const })),
    ...libraryAssets
      .filter((asset) => !stickerEntries.some(([, url]) => url === asset.file_url))
      .map((asset) => ({ key: asset.name || asset.id, url: asset.file_url, source: 'library' as const })),
  ].filter((item) => {
    if (!search) return true;
    return item.key.toLowerCase().includes(search.toLowerCase());
  });

  const addStickerOverlay = (assetKey: string, assetUrl: string) => {
    if (!dsl || !seg || !assetUrl) return;
    const localT = Math.max(0, currentTime - getSegmentStartTime(currentSegIndex));
    const duration = Math.min(3, Math.max(1, seg.duration_sec - localT));
    updateDsl(d => {
      const segs = [...d.segments];
      const overlays = [...segs[currentSegIndex].overlays, {
        id: `overlay-${Date.now()}`,
        asset_key: assetKey,
        asset_url: assetUrl,
        position: { x: 50, y: 40 },
        scale: 100,
        seg_start_time: localT,
        duration,
        animation: 'fadeIn' as const,
        render_width_pct: 20,
        render_height_pct: 12,
      }];
      segs[currentSegIndex] = { ...segs[currentSegIndex], overlays };
      return { ...d, segments: segs };
    });
    setSelectedElement({ type: 'overlay', segIndex: currentSegIndex, overlayIndex: seg.overlays.length });
    onEdited?.();
  };

  const addSceneAsOverlay = (sceneUrl: string) => {
    if (!dsl || !seg || !sceneUrl) return;
    const localT = Math.max(0, currentTime - getSegmentStartTime(currentSegIndex));
    const duration = Math.min(3, Math.max(1, seg.duration_sec - localT));
    updateDsl(d => {
      const segs = [...d.segments];
      const overlays = [...segs[currentSegIndex].overlays, {
        id: `overlay-${Date.now()}`,
        asset_url: sceneUrl,
        position: { x: 50, y: 40 },
        scale: 100,
        seg_start_time: localT,
        duration,
        animation: 'fadeIn' as const,
      }];
      segs[currentSegIndex] = { ...segs[currentSegIndex], overlays };
      return { ...d, segments: segs };
    });
    setSelectedElement({ type: 'overlay', segIndex: currentSegIndex, overlayIndex: seg.overlays.length });
    onEdited?.();
  };

  const applyToSeg = (field: string, value: any) => {
    if (!dsl) return;
    updateDsl(d => {
      const segs = [...d.segments];
      segs[currentSegIndex] = { ...segs[currentSegIndex], [field]: value };
      return { ...d, segments: segs };
    });
    onEdited?.();
  };

  const filteredScenes = SCENE_IMAGES.filter(s => {
    if (sceneCategory !== 'all' && s.category !== sceneCategory) return false;
    if (search && !s.name.includes(search) && !s.tags.some(t => t.includes(search))) return false;
    return true;
  });

  return (
    <div className="flex flex-col h-full min-h-0">
      {showSearch && (tab === 'scene' || tab === 'sound') && (
        <div className="px-2 py-1.5 border-b border-border shrink-0">
          <div className="flex items-center gap-1.5 bg-secondary rounded-md px-2 py-1">
            <IconSearch size={14} className="text-muted-foreground shrink-0" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="搜索..."
              className="flex-1 bg-transparent text-[12px] outline-none placeholder-muted-foreground" />
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-2 min-h-0">
        {tab === 'scene' && (
          <>
            <div className="flex flex-wrap gap-1 mb-2">
              <button onClick={() => setSceneCategory('all')}
                className={`text-[10px] px-2 py-0.5 rounded-full ${sceneCategory === 'all' ? 'bg-foreground text-background' : 'bg-secondary text-muted-foreground'}`}>全部</button>
              {SCENE_CATEGORIES.map(c => (
                <button key={c.id} onClick={() => setSceneCategory(c.id)}
                  className={`text-[10px] px-2 py-0.5 rounded-full ${sceneCategory === c.id ? 'bg-foreground text-background' : 'bg-secondary text-muted-foreground'}`}>{c.label}</button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {filteredScenes.map(scene => (
                <div key={scene.id}
                  className="group rounded-md overflow-hidden border border-border hover:border-foreground/30 transition-colors">
                  <button
                    type="button"
                    onClick={() => applySceneBackground(scene)}
                    className="w-full cursor-pointer text-left"
                  >
                    <div className="aspect-[9/16] bg-secondary flex items-center justify-center">
                      {scene.url ? (
                        <img src={scene.url} className="w-full h-full object-cover" alt="" />
                      ) : (
                        <IconImage size={24} className="text-muted-foreground/40" />
                      )}
                    </div>
                  </button>
                  <div className="p-1.5 flex items-center gap-1">
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-medium truncate">{scene.name}</p>
                      <p className="text-[9px] text-muted-foreground truncate">{scene.description}</p>
                    </div>
                    {scene.url && (
                      <button
                        type="button"
                        title="添加为当前时间贴片"
                        onClick={(e) => { e.stopPropagation(); addSceneAsOverlay(scene.url!); }}
                        className="shrink-0 text-[9px] px-1.5 py-0.5 rounded bg-secondary hover:bg-accent text-muted-foreground hover:text-foreground"
                      >
                        贴片
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === 'subtitle' && (
          <div className="space-y-2">
            {SUBTITLE_STYLES.map(style => {
              const isActive = seg?.subtitle.style_id === style.id;
              const p = style.preview;
              return (
                <div key={style.id}
                  onClick={() => {
                    if (!dsl) return;
                    updateDsl(d => {
                      const segs = [...d.segments];
                      segs[currentSegIndex] = { ...segs[currentSegIndex], subtitle: { ...segs[currentSegIndex].subtitle, style_id: style.id, enabled: true } };
                      return { ...d, segments: segs };
                    });
                    onEdited?.();
                  }}
                  className={`cursor-pointer rounded-lg overflow-hidden border transition-colors ${
                    isActive ? 'border-foreground ring-1 ring-foreground/20' : 'border-border hover:border-foreground/30'
                  }`}>
                  <div className="h-16 bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center px-3 relative">
                    <span style={{
                      color: p.color,
                      background: p.bg,
                      fontSize: p.fontSize,
                      fontWeight: p.fontWeight,
                      borderRadius: p.borderRadius,
                      textShadow: p.outline ? `0 1px 3px ${p.outline}` : 'none',
                      padding: p.bg && p.bg !== 'transparent' ? '4px 12px' : '0',
                      whiteSpace: 'nowrap',
                    }}>{p.text}</span>
                  </div>
                  <div className="p-2">
                    <p className="text-[11px] font-medium">{style.name}</p>
                    <p className="text-[9px] text-muted-foreground">{style.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === 'sound' && (
          <>
            {SOUND_CATEGORIES.map(cat => {
              const items = SOUND_EFFECTS.filter(s => s.category === cat.id);
              if (!items.length) return null;
              return (
                <div key={cat.id} className="mb-3">
                  <p className="text-[10px] font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">{cat.label}</p>
                  <div className="space-y-1">
                    {items.map(sfx => (
                      <div key={sfx.id} onClick={() => applyToSeg('segment_bgm_url', sfx.url || '')}
                        className={`flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors ${
                          seg?.segment_bgm_url === sfx.url ? 'bg-foreground/10 ring-1 ring-foreground/20' : 'hover:bg-accent'
                        }`}>
                        <div className="w-8 h-8 rounded bg-secondary flex items-center justify-center shrink-0">
                          <IconMusic size={14} className="text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-medium truncate">{sfx.name}</p>
                          <p className="text-[9px] text-muted-foreground">{sfx.duration} · {sfx.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </>
        )}

        {tab === 'anim' && (
          <>
            {ANIM_CATEGORIES.map(cat => {
              const items = ANIMATION_PRESETS.filter(a => a.category === cat.id);
              return (
                <div key={cat.id} className="mb-3">
                  <p className="text-[10px] font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">{cat.label}</p>
                  <div className="space-y-1">
                    {items.map(anim => {
                      const isActive = cat.id === 'transition'
                        ? seg?.transition.type === anim.id
                        : cat.id === 'text'
                        ? seg?.subtitle.animation === anim.id
                        : false;
                      return (
                        <div key={anim.id}
                          onClick={() => {
                            if (cat.id === 'transition') {
                              applyToSeg('transition', { type: anim.id, duration: parseFloat(anim.duration) });
                            } else if (cat.id === 'text') {
                              updateDsl(d => {
                                const segs = [...d.segments];
                                segs[currentSegIndex] = { ...segs[currentSegIndex], subtitle: { ...segs[currentSegIndex].subtitle, animation: anim.id as any } };
                                return { ...d, segments: segs };
                              });
                              onEdited?.();
                            }
                          }}
                          className={`flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors ${
                            isActive ? 'bg-foreground/10 ring-1 ring-foreground/20' : 'hover:bg-accent'
                          }`}>
                          <div className="w-8 h-8 rounded bg-secondary flex items-center justify-center shrink-0 overflow-hidden">
                            <AnimPreview anim={anim} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-medium truncate">{anim.name}</p>
                            <p className="text-[9px] text-muted-foreground">{anim.duration} · {anim.description}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </>
        )}

        {tab === 'sticker' && (
          <>
            {showSearch && (
              <div className="px-2 py-1.5 border-b border-border shrink-0 mb-2 -mx-2">
                <div className="flex items-center gap-1.5 bg-secondary rounded-md px-2 py-1">
                  <IconSearch size={14} className="text-muted-foreground shrink-0" />
                  <input value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="搜索贴纸..."
                    className="flex-1 bg-transparent text-[12px] outline-none placeholder-muted-foreground" />
                </div>
              </div>
            )}
            {catalogStickers.length === 0 ? (
              <div className="text-center py-8 px-3">
                <IconImage size={32} className="text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-[10px] text-muted-foreground">暂无贴纸素材</p>
                <p className="text-[9px] text-muted-foreground/60 mt-1">上传文件会自动进入素材库；剪映模板 asset_map 也会显示在此</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-1.5">
                {catalogStickers.map((item) => (
                  <div key={`${item.source}-${item.key}-${item.url}`} className="rounded-md border border-border overflow-hidden hover:border-foreground/30 transition-colors">
                    <div className="aspect-square bg-secondary flex items-center justify-center p-1">
                      <img src={item.url} alt={item.key} className="max-w-full max-h-full object-contain" />
                    </div>
                    <div className="p-1.5 flex items-center justify-between gap-1">
                      <span className="text-[9px] text-muted-foreground truncate" title={item.key}>
                        {item.key}
                        <span className="ml-1 opacity-60">{item.source === 'template' ? '模板' : '库'}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => addStickerOverlay(item.key, item.url)}
                        className="shrink-0 text-[9px] px-1.5 py-0.5 rounded bg-secondary hover:bg-accent"
                      >
                        贴片
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'dh' && (
          <>
            {readyDhs.length === 0 ? (
              <div className="text-center py-8">
                <IconUser size={32} className="text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-[10px] text-muted-foreground">暂无就绪数字人</p>
                <p className="text-[9px] text-muted-foreground/60 mt-1">请先在数字人管理页面创建</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {readyDhs.map(dh => (
                  <div key={dh.id} onClick={() => {
                      onSelectDh?.(dh.id);
                      if (!dsl) return;
                      updateDsl(d => ({
                        ...d,
                        meta: { ...d.meta, digital_human_id: dh.id },
                        segments: d.segments.map(seg => ({
                          ...seg,
                          avatar_id: dh.id,
                          digital_human: {
                            ...seg.digital_human,
                            enabled: seg.type === 'narration' ? true : seg.digital_human.enabled,
                          },
                        })),
                      }));
                      onEdited?.();
                    }}
                    className={`cursor-pointer rounded-lg overflow-hidden border transition-colors ${
                      selectedDhId === dh.id ? 'border-brand-purple ring-1 ring-brand-purple' : 'border-border hover:border-foreground/30'
                    }`}>
                    <div className="aspect-[3/4] bg-secondary flex items-center justify-center">
                      {dh.face_photo_url ? (
                        <img src={dh.face_photo_url} className="w-full h-full object-cover" alt="" />
                      ) : (
                        <IconUser size={28} className="text-muted-foreground/40" />
                      )}
                    </div>
                    <div className="p-1.5">
                      <p className="text-[10px] font-medium truncate">{dh.name}</p>
                      <p className="text-[9px] text-brand-green">就绪</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function AnimPreview({ anim }: { anim: { previewCSS: string; id: string } }) {
  return (
    <div className="w-4 h-4 bg-foreground rounded-sm" style={{
      animation: `anim-${anim.id} 1.5s ease-in-out infinite`,
    }} />
  );
}
