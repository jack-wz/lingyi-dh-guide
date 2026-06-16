import { useEffect, useState, useMemo } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Stage, Layer, Rect, Text, Image as KonvaImage, Circle, Group } from 'react-konva';
import { useEditorStore } from '../store/editorStore';
import type { EditorObject, Segment } from '../store/editorStore';

function useCanvasSize() {
  const dsl = useEditorStore(s => s.dsl);
  return useMemo(() => {
    if (!dsl) return { width: 1080, height: 1920, displayW: 300, displayH: 533 };
    const { canvas_width: w, canvas_height: h } = dsl.globalConfig;
    const maxH = 520;
    const scale = maxH / h;
    return { width: w, height: h, displayW: Math.round(w * scale), displayH: Math.round(h * scale) };
  }, [dsl]);
}

function SceneBackground({ segment, backgroundColor }: { segment: Segment; backgroundColor: string }) {
  const { width, height } = useCanvasSize();
  if (!segment.scene_image_url) {
    return (
      <Group>
        <Rect x={0} y={0} width={width} height={height} fill={backgroundColor} />
        <Text text="上传场景图" x={width / 2 - 60} y={height / 2 - 10} fontSize={24} fill="rgba(0,0,0,0.25)" />
      </Group>
    );
  }
  return <SceneImage url={segment.scene_image_url} width={width} height={height} />;
}

function SceneImage({ url, width, height }: { url: string; width: number; height: number }) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => setImage(img);
    img.src = url;
  }, [url]);
  if (!image) return <Rect x={0} y={0} width={width} height={height} fill="#1a1a2e" />;
  return <KonvaImage image={image} x={0} y={0} width={width} height={height} />;
}

export default function VideoCanvas() {
  const dsl = useEditorStore(s => s.dsl);
  const currentSegIndex = useEditorStore(s => s.currentSegIndex);
  const selectedElement = useEditorStore(s => s.selectedElement);
  const setSelectedElement = useEditorStore(s => s.setSelectedElement);
  const updateDsl = useEditorStore(s => s.updateDsl);
  const { displayW, displayH } = useCanvasSize();

  const segment = dsl?.segments[currentSegIndex];
  if (!segment || !dsl) return <div className="flex-1 flex items-center justify-center text-muted-foreground">无片段</div>;

  const backgroundColor = dsl.globalConfig.background_color || '#f6f6f6';
  const hasCanvasSelection = selectedElement.type !== 'none' && selectedElement.segIndex === currentSegIndex;

  const handleStageClick = (e: { target: { getStage: () => unknown } }) => {
    if (e.target === e.target.getStage()) {
      setSelectedElement({ type: 'none' });
    }
  };

  const duplicateSelection = () => {
    if (selectedElement.type === 'object') {
      const object = segment.objects?.[selectedElement.objectIndex];
      if (!object) return;
      updateDsl(d => {
        const segs = [...d.segments];
        const seg = segs[currentSegIndex];
        const objects = [...(seg.objects || [])];
        const copy: EditorObject = {
          ...object,
          id: `obj-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          label: `${object.label || object.type} 副本`,
          position: { x: Math.min(100, object.position.x + 4), y: Math.min(100, object.position.y + 4) },
        };
        objects.splice(selectedElement.objectIndex + 1, 0, copy);
        segs[currentSegIndex] = { ...seg, objects };
        return { ...d, segments: segs };
      });
      setSelectedElement({ type: 'object', segIndex: currentSegIndex, objectIndex: selectedElement.objectIndex + 1 });
    } else if (selectedElement.type === 'overlay') {
      const overlay = segment.overlays[selectedElement.overlayIndex];
      if (!overlay) return;
      updateDsl(d => {
        const segs = [...d.segments];
        const seg = segs[currentSegIndex];
        const overlays = [...seg.overlays];
        overlays.splice(selectedElement.overlayIndex + 1, 0, {
          ...overlay,
          id: `overlay-${Date.now()}`,
          position: { x: Math.min(100, overlay.position.x + 4), y: Math.min(100, overlay.position.y + 4) },
        });
        segs[currentSegIndex] = { ...seg, overlays };
        return { ...d, segments: segs };
      });
      setSelectedElement({ type: 'overlay', segIndex: currentSegIndex, overlayIndex: selectedElement.overlayIndex + 1 });
    }
  };

  const removeSelection = () => {
    updateDsl(d => {
      const segs = [...d.segments];
      const seg = segs[currentSegIndex];
      if (selectedElement.type === 'object') {
        const objects = (seg.objects || []).filter((_, index) => index !== selectedElement.objectIndex);
        segs[currentSegIndex] = { ...seg, objects };
      } else if (selectedElement.type === 'overlay') {
        const overlays = seg.overlays.filter((_, index) => index !== selectedElement.overlayIndex);
        segs[currentSegIndex] = { ...seg, overlays };
      } else if (selectedElement.type === 'digital_human') {
        segs[currentSegIndex] = { ...seg, digital_human: { ...seg.digital_human, enabled: false } };
      } else if (selectedElement.type === 'subtitle') {
        segs[currentSegIndex] = { ...seg, subtitle: { ...seg.subtitle, enabled: false } };
      }
      return { ...d, segments: segs };
    });
    setSelectedElement({ type: 'none' });
  };

  const selectionLabel =
    selectedElement.type === 'object'
      ? segment.objects?.[selectedElement.objectIndex]?.label || '对象'
      : selectedElement.type === 'overlay'
        ? `贴片 ${selectedElement.overlayIndex + 1}`
        : selectedElement.type === 'digital_human'
          ? '数字人'
          : selectedElement.type === 'subtitle'
            ? '字幕'
            : '';
  const selectedObject = selectedElement.type === 'object' && selectedElement.segIndex === currentSegIndex
    ? segment.objects?.[selectedElement.objectIndex]
    : undefined;

  const updateSelectedObjectTransform = (partial: Partial<EditorObject>) => {
    if (selectedElement.type !== 'object') return;
    updateDsl(d => {
      const segs = [...d.segments];
      const objects = [...(segs[currentSegIndex].objects || [])];
      const object = objects[selectedElement.objectIndex];
      if (!object) return d;
      objects[selectedElement.objectIndex] = { ...object, ...partial };
      segs[currentSegIndex] = { ...segs[currentSegIndex], objects };
      return { ...d, segments: segs };
    });
  };

  return (
    <div className="flex-1 flex items-center justify-center bg-background p-4 overflow-hidden">
      <div className="relative" data-testid="video-canvas" style={{ width: displayW, height: displayH }}>
        {/* 画布外框 */}
        <div className="absolute inset-0 rounded-xl shadow-2xl ring-1 ring-white/10 overflow-hidden">
          <Stage
            width={displayW}
            height={displayH}
            onClick={handleStageClick}
            onTap={handleStageClick}
          >
            <Layer>
              {/* 背景 */}
              <SceneBackground segment={segment} backgroundColor={backgroundColor} />

              {/* 数字人 */}
              {segment.digital_human.enabled && (
                <Group
                  x={(segment.digital_human.position.x / 100) * displayW}
                  y={(segment.digital_human.position.y / 100) * displayH}
                  draggable
                  scaleX={segment.digital_human.scale / 100}
                  scaleY={segment.digital_human.scale / 100}
                  onDragEnd={(e) => {
                    const x = (e.target.x() / displayW) * 100;
                    const y = (e.target.y() / displayH) * 100;
                    updateDsl(d => {
                      const segs = [...d.segments];
                      segs[currentSegIndex] = {
                        ...segs[currentSegIndex],
                        digital_human: { ...segs[currentSegIndex].digital_human, position: { x: Math.round(x), y: Math.round(y) } },
                      };
                      return { ...d, segments: segs };
                    });
                  }}
                  onClick={() => setSelectedElement({ type: 'digital_human', segIndex: currentSegIndex })}
                >
                  {/* 数字人占位 */}
                  <Circle radius={28} fill="rgba(147,51,234,0.3)" stroke={selectedElement.type === 'digital_human' && selectedElement.segIndex === currentSegIndex ? '#A855F7' : 'transparent'} strokeWidth={2} dash={[4, 4]} />
                  <Circle radius={14} fill="rgba(147,51,234,0.5)" />
                  <Circle radius={4} fill="white" />
                  <Text text="数字人" y={34} fontSize={10} fill="rgba(255,255,255,0.6)" x={-16} />
                </Group>
              )}

              {/* 叠加素材 */}
              {segment.overlays.map((ov, oi) => (
                <OverlayItem
                  key={ov.id}
                  overlay={ov}
                  displayW={displayW}
                  displayH={displayH}
                  isSelected={selectedElement.type === 'overlay' && selectedElement.segIndex === currentSegIndex && selectedElement.overlayIndex === oi}
                  onSelect={() => setSelectedElement({ type: 'overlay', segIndex: currentSegIndex, overlayIndex: oi })}
                  onDragEnd={(x, y) => {
                    updateDsl(d => {
                      const segs = [...d.segments];
                      const overlays = [...segs[currentSegIndex].overlays];
                      overlays[oi] = { ...overlays[oi], position: { x: Math.round(x), y: Math.round(y) } };
                      segs[currentSegIndex] = { ...segs[currentSegIndex], overlays };
                      return { ...d, segments: segs };
                    });
                  }}
                />
              ))}

              {(segment.objects || []).map((object, oi) => (
                <GenericObjectItem
                  key={object.id}
                  object={object}
                  displayW={displayW}
                  displayH={displayH}
                  isSelected={selectedElement.type === 'object' && selectedElement.segIndex === currentSegIndex && selectedElement.objectIndex === oi}
                  onSelect={() => setSelectedElement({ type: 'object', segIndex: currentSegIndex, objectIndex: oi })}
                  onDragEnd={(x, y) => {
                    updateDsl(d => {
                      const segs = [...d.segments];
                      const objects = [...(segs[currentSegIndex].objects || [])];
                      objects[oi] = { ...objects[oi], position: { x: Math.round(x), y: Math.round(y) } };
                      segs[currentSegIndex] = { ...segs[currentSegIndex], objects };
                      return { ...d, segments: segs };
                    });
                  }}
                />
              ))}

              {/* 字幕 */}
              {segment.subtitle.enabled && segment.narration_text && (
                <Group
                  y={
                    segment.subtitle.position === 'top' ? 30 :
                    segment.subtitle.position === 'center' ? displayH / 2 - 20 :
                    displayH - 70
                  }
                  onClick={() => setSelectedElement({ type: 'subtitle', segIndex: currentSegIndex })}
                >
                  <Rect x={20} y={0} width={displayW - 40} height={36} cornerRadius={6} fill="rgba(0,0,0,0.5)" />
                  <Text
                    text={segment.narration_text.replace(/\{[^}]+\}/g, '___')}
                    x={30} y={8} width={displayW - 60} fontSize={14} fill="white"
                    align="center" fontFamily="sans-serif"
                  />
                </Group>
              )}

              {/* 选中框指示 */}
              {selectedElement.type !== 'none' && (
                <Rect x={0} y={0} width={displayW} height={displayH} fill="transparent" listening={false} />
              )}
            </Layer>
          </Stage>
        </div>

        {/* 片段标签 */}
        <div className="absolute top-2 left-2 flex gap-1.5">
          <span className="px-2 py-0.5 bg-black/60 backdrop-blur-sm rounded text-white text-[10px]">
            {currentSegIndex + 1} / {dsl.segments.length}
          </span>
          <span className="px-2 py-0.5 bg-black/60 backdrop-blur-sm rounded text-white text-[10px]">
            {segment.duration_sec}s
          </span>
        </div>
        {hasCanvasSelection && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 rounded-lg border border-border bg-card/95 shadow-xl backdrop-blur px-2 py-1 flex items-center gap-1">
            <span className="px-2 text-[11px] text-muted-foreground max-w-[120px] truncate">{selectionLabel}</span>
            {(selectedElement.type === 'object' || selectedElement.type === 'overlay') && (
              <button
                type="button"
                onClick={duplicateSelection}
                className="h-7 px-2 rounded-md text-[11px] bg-secondary hover:bg-accent"
              >
                复制
              </button>
            )}
            <button
              type="button"
              onClick={removeSelection}
              className="h-7 px-2 rounded-md text-[11px] bg-destructive/10 text-destructive hover:bg-destructive/20"
            >
              {selectedElement.type === 'digital_human' || selectedElement.type === 'subtitle' ? '隐藏' : '删除'}
            </button>
          </div>
        )}
        {selectedObject && selectedObject.visible !== false && !selectedObject.locked && (
          <ObjectTransformHandles
            object={selectedObject}
            displayW={displayW}
            displayH={displayH}
            onTransform={updateSelectedObjectTransform}
          />
        )}
      </div>
    </div>
  );
}

function OverlayItem({ overlay, displayW, displayH, isSelected, onSelect, onDragEnd }: {
  overlay: { asset_url: string; position: { x: number; y: number }; scale: number };
  displayW: number; displayH: number; isSelected: boolean;
  onSelect: () => void; onDragEnd: (x: number, y: number) => void;
}) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!overlay.asset_url) return;
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => setImage(img);
    img.src = overlay.asset_url;
  }, [overlay.asset_url]);

  const x = (overlay.position.x / 100) * displayW;
  const y = (overlay.position.y / 100) * displayH;

  return (
    <Group
      x={x} y={y} draggable
      scaleX={overlay.scale / 100} scaleY={overlay.scale / 100}
      onDragEnd={(e) => onDragEnd((e.target.x() / displayW) * 100, (e.target.y() / displayH) * 100)}
      onClick={onSelect}
    >
      {image ? (
        <KonvaImage image={image} x={-40} y={-30} width={80} height={60} />
      ) : (
        <Rect x={-30} y={-20} width={60} height={40} fill="rgba(255,255,255,0.2)" cornerRadius={4} stroke={isSelected ? '#3B82F6' : 'rgba(255,255,255,0.3)'} strokeWidth={isSelected ? 2 : 1} />
      )}
      {isSelected && <Rect x={-42} y={-32} width={84} height={64} stroke="#3B82F6" strokeWidth={2} dash={[4, 4]} cornerRadius={4} />}
    </Group>
  );
}

function GenericObjectItem({ object, displayW, displayH, isSelected, onSelect, onDragEnd }: {
  object: EditorObject;
  displayW: number;
  displayH: number;
  isSelected: boolean;
  onSelect: () => void;
  onDragEnd: (x: number, y: number) => void;
}) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const objectImageUrl = object.asset_url && object.type !== 'text' && object.type !== 'subtitle' ? object.asset_url : '';

  useEffect(() => {
    if (!objectImageUrl) return;
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => setImage(img);
    img.src = objectImageUrl;
  }, [objectImageUrl]);

  if (object.visible === false) return null;

  const x = (object.position.x / 100) * displayW;
  const y = (object.position.y / 100) * displayH;
  const scale = object.scale / 100;
  const rotation = object.rotation || 0;
  const isText = object.type === 'text' || object.type === 'subtitle';
  const isInteractive = Boolean(object.interaction);
  const isRecording = object.metadata?.source === 'record';
  const fill = object.style?.fill || (isInteractive ? '#ffffff' : 'rgba(15,23,42,0.12)');
  const textColor = object.style?.textColor || '#111827';
  const box = getObjectBox(object);

  return (
    <Group
      x={x}
      y={y}
      draggable={!object.locked}
      scaleX={scale}
      scaleY={scale}
      rotation={rotation}
      onClick={onSelect}
      onTap={onSelect}
      onDragEnd={(e) => onDragEnd((e.target.x() / displayW) * 100, (e.target.y() / displayH) * 100)}
    >
      {isText ? (
        <Group>
          <Rect x={-80} y={-24} width={160} height={48} cornerRadius={8} fill={object.style?.fill || 'rgba(255,255,255,0.88)'} shadowColor="black" shadowOpacity={0.12} shadowBlur={8} />
          <Text
            text={object.text || object.label || '文本'}
            x={-70}
            y={-10}
            width={140}
            fontSize={16}
            fill={object.style?.textColor || '#111827'}
            align="center"
            fontFamily="sans-serif"
            fontStyle={object.metadata?.note === 'brand-kit-title' ? 'bold' : 'normal'}
          />
        </Group>
      ) : isInteractive ? (
        <Group>
          <Rect x={-72} y={-42} width={144} height={84} cornerRadius={10} fill={fill} stroke="rgba(79,70,229,0.35)" shadowColor="black" shadowOpacity={0.12} shadowBlur={10} />
          <Text
            text={object.text || object.label || '互动'}
            x={-58}
            y={-30}
            width={116}
            fontSize={12}
            fill={textColor}
            align="center"
            fontStyle="bold"
          />
          {(object.interaction?.options || []).slice(0, 3).map((option, index) => (
            <Group key={`${object.id}-${option}-${index}`}>
              <Rect x={-48} y={-4 + index * 18} width={96} height={12} cornerRadius={6} fill={object.interaction?.kind === 'cta_button' ? 'rgba(255,255,255,0.35)' : 'rgba(79,70,229,0.16)'} />
              <Text text={option} x={-42} y={-2 + index * 18} width={84} fontSize={7} fill={textColor} align="center" />
            </Group>
          ))}
          {object.interaction?.kind === 'cta_button' && (
            <Rect x={-36} y={10} width={72} height={20} cornerRadius={10} fill="rgba(255,255,255,0.22)" stroke="rgba(255,255,255,0.4)" />
          )}
        </Group>
      ) : isRecording ? (
        <Group>
          <Rect x={-70} y={-42} width={140} height={84} cornerRadius={10} fill="#111827" stroke="rgba(255,255,255,0.3)" />
          <Rect x={-58} y={-30} width={116} height={48} cornerRadius={6} fill="rgba(255,255,255,0.08)" />
          <Text text="录制" x={-50} y={-22} width={36} fontSize={10} fill="#ef4444" fontStyle="bold" />
          <Text text={object.asset_url ? '屏幕录制' : '上传视频'} x={-50} y={-2} width={100} fontSize={11} fill="#ffffff" align="center" />
          <Text text={`${object.metadata?.duration_sec || 8}s`} x={24} y={23} width={28} fontSize={8} fill="rgba(255,255,255,0.65)" align="right" />
        </Group>
      ) : image && objectImageUrl ? (
        <KonvaImage image={image} x={-45} y={-35} width={90} height={70} />
      ) : (
        <Group>
          <Rect x={-42} y={-30} width={84} height={60} cornerRadius={8} fill={object.type === 'logo' ? (object.style?.fill || 'rgba(79,70,229,0.18)') : fill} stroke="rgba(15,23,42,0.18)" />
          <Text text={object.label || (object.type === 'logo' ? 'Logo' : '素材')} x={-32} y={-6} width={64} fontSize={12} fill={object.type === 'logo' ? (object.style?.textColor || '#111827') : '#111827'} align="center" />
        </Group>
      )}
      {isSelected && (
        <Group>
          <Rect
            x={box.x}
            y={box.y}
            width={box.width}
            height={box.height}
            stroke="#4F46E5"
            strokeWidth={2}
            dash={[4, 4]}
            cornerRadius={8}
            listening={false}
          />
        </Group>
      )}
    </Group>
  );
}

function ObjectTransformHandles({ object, displayW, displayH, onTransform }: {
  object: EditorObject;
  displayW: number;
  displayH: number;
  onTransform: (partial: Partial<EditorObject>) => void;
}) {
  const box = getObjectBox(object);
  const scale = object.scale / 100;
  const x = (object.position.x / 100) * displayW;
  const y = (object.position.y / 100) * displayH;
  const resizeX = x + (box.x + box.width) * scale;
  const resizeY = y + (box.y + box.height) * scale;
  const rotateX = x;
  const rotateY = y + (box.y - 24) * scale;

  const normalizeRotation = (value: number) => {
    const normalized = ((value + 180) % 360 + 360) % 360 - 180;
    return Math.round(normalized);
  };

  const startResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const originX = x;
    const originY = y;
    const base = Math.max(box.width, box.height) / 2;
    const canvasBox = event.currentTarget.closest('[data-testid="video-canvas"]')!.getBoundingClientRect();
    const move = (moveEvent: PointerEvent) => {
      const pointerX = moveEvent.clientX - canvasBox.left - originX;
      const pointerY = moveEvent.clientY - canvasBox.top - originY;
      const distance = Math.hypot(pointerX, pointerY);
      const nextScale = Math.max(10, Math.min(260, (distance / base) * 100));
      onTransform({ scale: Math.round(nextScale) });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const startRotate = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const canvasBox = event.currentTarget.closest('[data-testid="video-canvas"]')!.getBoundingClientRect();
    const move = (moveEvent: PointerEvent) => {
      const pointerX = moveEvent.clientX - canvasBox.left - x;
      const pointerY = moveEvent.clientY - canvasBox.top - y;
      const angle = Math.atan2(pointerY, pointerX) * (180 / Math.PI) + 90;
      onTransform({ rotation: normalizeRotation(angle) });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <>
      <div
        className="pointer-events-none absolute bg-primary"
        style={{
          left: rotateX,
          top: rotateY + 6,
          width: 2,
          height: Math.max(0, y + box.y * scale - rotateY - 6),
          transform: 'translateX(-1px)',
        }}
      />
      <button
        type="button"
        data-testid="object-rotate-handle"
        aria-label="旋转对象"
        className="absolute z-20 h-3.5 w-3.5 rounded-full border-2 border-primary bg-card shadow cursor-grab"
        style={{ left: rotateX, top: rotateY, transform: 'translate(-50%, -50%)' }}
        onPointerDown={startRotate}
      />
      <button
        type="button"
        data-testid="object-resize-handle"
        aria-label="缩放对象"
        className="absolute z-20 h-4 w-4 rounded-full border-2 border-primary bg-card shadow cursor-nwse-resize"
        style={{ left: resizeX, top: resizeY, transform: 'translate(-50%, -50%)' }}
        onPointerDown={startResize}
      />
    </>
  );
}

function getObjectBox(object: EditorObject) {
  const isText = object.type === 'text' || object.type === 'subtitle';
  const isLargeCard = Boolean(object.interaction) || object.metadata?.source === 'record';
  if (isText) return { x: -84, y: -28, width: 168, height: 56 };
  if (isLargeCard) return { x: -76, y: -46, width: 152, height: 92 };
  return { x: -48, y: -36, width: 96, height: 72 };
}
