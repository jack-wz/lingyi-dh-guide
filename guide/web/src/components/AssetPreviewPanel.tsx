import { useMemo } from 'react';
import { IconFilm, IconImage, IconMic, IconMusic, IconType, IconUser, IconVideo } from './Icons';
import BrandPackPanel from './BrandPackPanel';
import { libraryPayloadToBrandPack } from '@shared/brandPack';
import { getSubtitlePreviewStyle } from '../utils/subtitleStylePreview';
import type { AssetHubTab, LibraryItem } from '../types/library';

interface Props {
  tab: AssetHubTab;
  item: LibraryItem | null;
}

function isVideoUrl(url: string) {
  return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url) || url.includes('video');
}

function BrandPreview({ item }: { item: LibraryItem }) {
  const pack = libraryPayloadToBrandPack(item);
  const p = item.payload || {};
  const brandColor = pack.brandColor || String(p.brand_color || '#1d4ed8');
  const bgColor = pack.backgroundColor || String(p.background_color || '#f6f8fb');
  const textColor = pack.textColor || String(p.text_color || '#ffffff');
  const subtitleStyle = String(p.subtitle_style || 'default');
  const logoUrl = pack.useLogo ? pack.logoUrl : '';
  const logoLabel = pack.logoLabel || String(p.logo_label || '品牌');

  const subtitlePreview = getSubtitlePreviewStyle(subtitleStyle);

  return (
    <div className="rounded-xl overflow-hidden border border-border" style={{ background: bgColor }}>
      <div className="aspect-[9/16] max-h-[360px] mx-auto flex flex-col relative">
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4">
          {logoUrl ? (
            <img src={logoUrl} alt="" className="max-h-20 max-w-[120px] object-contain drop-shadow" />
          ) : (
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center text-xs font-medium"
              style={{ background: brandColor, color: textColor }}
            >
              {logoLabel}
            </div>
          )}
          {pack.subBrands.length > 0 ? (
            <span className="text-[10px] text-muted-foreground bg-background/80 px-2 py-0.5 rounded">
              {pack.subBrands.filter((s) => s.enabled).length} 个子品牌
            </span>
          ) : null}
        </div>
        <div className="mt-auto p-4">
          <div
            className="inline-block text-sm"
            style={{
              color: subtitlePreview.color,
              background: subtitlePreview.background,
              fontWeight: subtitlePreview.fontWeight,
              borderRadius: subtitlePreview.borderRadius,
              textShadow: subtitlePreview.outline ? `0 1px 3px ${subtitlePreview.outline}` : undefined,
              padding: subtitlePreview.background === 'transparent' ? '2px 4px' : '6px 12px',
            }}
          >
            示例字幕预览
          </div>
        </div>
        <div className="absolute top-3 right-3 flex gap-1">
          <span className="w-6 h-6 rounded border border-white/30" style={{ background: brandColor }} title="品牌色" />
          <span className="w-6 h-6 rounded border border-border" style={{ background: bgColor }} title="背景色" />
        </div>
      </div>
    </div>
  );
}

function AudioPreview({ url, label }: { url: string; label: string }) {
  if (!url) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        暂无音频文件，上传后可试听
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-border bg-secondary/40 p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <IconMusic size={16} />
        {label}
      </div>
      <audio controls className="w-full" src={url} preload="metadata">
        您的浏览器不支持音频播放
      </audio>
    </div>
  );
}

export default function AssetPreviewPanel({ tab, item }: Props) {
  const voiceKind = useMemo(() => {
    if (!item) return 'tts';
    return String(item.payload?.kind || (item.file_url ? 'bgm' : 'tts'));
  }, [item]);

  if (!item) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-6 border border-dashed border-border rounded-xl bg-card/50">
        <IconImage size={32} className="text-muted-foreground/40 mb-3" />
        <p className="text-sm text-muted-foreground">选择左侧资产查看预览</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col border border-border rounded-xl bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold truncate">{item.name}</h3>
        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.description || '—'}</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {tab === 'digital_human' && (
          <>
            <div className="aspect-[3/4] max-h-[280px] rounded-lg overflow-hidden bg-secondary border border-border">
              {item.file_url ? (
                <img src={item.file_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <IconUser size={48} className="text-muted-foreground/30" />
                </div>
              )}
            </div>
            {item.payload?.half_body_photo_url ? (
              <div className="grid grid-cols-2 gap-2">
                {(['face_photo_url', 'half_body_photo_url', 'full_body_photo_url'] as const).map((key) => {
                  const url = String(item.payload?.[key] || '');
                  if (!url) return null;
                  return (
                    <img key={key} src={url} alt="" className="aspect-square rounded-md object-cover border border-border" />
                  );
                })}
              </div>
            ) : null}
            {item.payload?.voice_sample_url ? (
              <AudioPreview url={String(item.payload.voice_sample_url)} label="声音样本" />
            ) : null}
          </>
        )}

        {tab === 'template' && (
          <div className="aspect-video rounded-lg overflow-hidden bg-secondary border border-border flex items-center justify-center">
            {item.file_url ? (
              <img src={item.file_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="text-center p-6">
                <IconFilm size={40} className="text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">暂无封面</p>
              </div>
            )}
          </div>
        )}

        {tab === 'brand' && (
          <>
            <BrandPreview item={item} />
            <BrandPackPanel item={item} />
            {(() => {
              const pack = libraryPayloadToBrandPack(item);
              if (pack.fontCount || pack.frameCount) return null;
              return (
                <p className="text-[10px] text-muted-foreground border border-dashed border-border rounded-md p-2">
                  品牌包未完整导入。请前往资产库点击「从本地模板重置」，或编辑品牌包补全 design.md / frame.md。
                </p>
              );
            })()}
          </>
        )}

        {tab === 'voice' && (
          <>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {voiceKind === 'bgm' ? <IconMusic size={14} /> : <IconMic size={14} />}
              {voiceKind === 'bgm' ? 'BGM 背景音乐' : 'TTS 音色'}
            </div>
            {voiceKind === 'bgm' ? (
              <AudioPreview url={item.file_url} label={item.name} />
            ) : (
              <>
                <div className="rounded-lg border border-border p-3 text-xs space-y-1 bg-secondary/30">
                  <div><span className="text-muted-foreground">Provider：</span>{String(item.payload?.provider || '—')}</div>
                  <div><span className="text-muted-foreground">Voice ID：</span>{String(item.payload?.voice_id || '—')}</div>
                  <div><span className="text-muted-foreground">语言：</span>{String(item.payload?.language || 'zh-CN')}</div>
                </div>
                <AudioPreview url={item.file_url || String(item.payload?.sample_url || '')} label="音色试听" />
              </>
            )}
          </>
        )}

        {tab === 'script' && (
          <div className="rounded-lg border border-border bg-secondary/30 p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
              <IconType size={14} />
              脚本正文
            </div>
            <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed text-foreground">
              {String(item.payload?.content || item.description || '（空）')}
            </pre>
          </div>
        )}

        {tab === 'knowledge' && (
          <div className="rounded-lg border border-border bg-secondary/30 p-4 text-sm text-muted-foreground">
            {String(item.payload?.content || item.description || '知识库说明')}
          </div>
        )}

        {tab === 'media' && item.file_url && (
          isVideoUrl(item.file_url) ? (
            <video
              src={item.file_url}
              controls
              className="w-full rounded-lg border border-border bg-black max-h-[320px]"
              preload="metadata"
            />
          ) : (
            <img src={item.file_url} alt="" className="w-full rounded-lg border border-border object-contain max-h-[320px] bg-secondary" />
          )
        )}

        {tab === 'media' && !item.file_url && (
          <div className="aspect-video rounded-lg border border-dashed border-border flex items-center justify-center">
            <IconVideo size={32} className="text-muted-foreground/30" />
          </div>
        )}

        {(item.tags?.length > 0 || Boolean(item.payload?.source)) && (
          <div className="flex flex-wrap gap-1">
            {item.payload?.source != null && String(item.payload.source) !== '' && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-blue/10 text-brand-blue">{String(item.payload.source)}</span>
            )}
            {item.tags?.map((tag) => (
              <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">{tag}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}