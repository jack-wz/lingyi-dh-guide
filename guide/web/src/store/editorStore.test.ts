import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { useEditorStore } from './editorStore';
import type { DSL } from '@shared/types/editor';

const makeDsl = (objects: DSL['segments'][0]['objects'] = []): DSL => ({
  version: '1',
  segments: [
    {
      id: 'seg-1',
      type: 'product',
      narration_text: '',
      duration_sec: 5,
      scene_image_url: '',
      objects,
      overlays: [],
      digital_human: { enabled: false, position: { x: 50, y: 80 }, scale: 100 },
      subtitle: { enabled: false, style_id: '', position: 'bottom', font_size: 24 },
      layout: { template: 'center' },
    },
  ],
  globalConfig: {
    canvas_width: 1080,
    canvas_height: 1920,
    fps: 30,
    bgm_url: '',
    bgm_volume: 1,
  },
});

describe('editorStore updateDsl', () => {
  it('applies sequential updates without losing earlier writes', () => {
    useEditorStore.getState().setDsl(makeDsl([
      { id: 'obj-1', type: 'shape', label: 'A', position: { x: 10, y: 20 }, scale: 100, rotation: 0, visible: true },
    ]));

    // Simulate object parameter change (X position)
    useEditorStore.getState().updateDsl((draft) => {
      const segments = [...draft.segments];
      const seg = { ...segments[0] };
      const objects = [...(seg.objects || [])];
      objects[0] = { ...objects[0], position: { ...objects[0].position, x: 42 } };
      seg.objects = objects;
      segments[0] = seg;
      return { ...draft, segments };
    });

    // Simulate overlay add via () => next pattern
    const afterFirst = useEditorStore.getState().dsl!;
    const withOverlay: DSL = {
      ...afterFirst,
      segments: afterFirst.segments.map((s, i) =>
        i === 0
          ? { ...s, overlays: [{ id: 'ov-1', asset_url: 'x.png', position: { x: 50, y: 50 }, scale: 100, rotation: 0, seg_start_time: 0, duration: 3, animation: 'none', render_width_pct: 20, render_height_pct: 12 }] }
          : s
      ),
    };
    useEditorStore.getState().updateDsl(() => withOverlay);

    // Simulate delete object
    useEditorStore.getState().updateDsl((draft) => {
      const segments = [...draft.segments];
      const seg = { ...segments[0] };
      seg.objects = [];
      segments[0] = seg;
      return { ...draft, segments };
    });

    const final = useEditorStore.getState().dsl!;
    assert.equal(final.segments[0].objects.length, 0, 'object should be deleted');
    assert.equal(final.segments[0].overlays.length, 1, 'overlay should remain');
    assert.equal(final.segments[0].overlays[0].position.x, 50, 'overlay position unchanged');
  });

  it('does not overwrite concurrent updates with stale closure state', () => {
    useEditorStore.getState().setDsl(makeDsl([
      { id: 'obj-1', type: 'shape', label: 'A', position: { x: 10, y: 20 }, scale: 100, rotation: 0, visible: true },
      { id: 'obj-2', type: 'shape', label: 'B', position: { x: 30, y: 40 }, scale: 100, rotation: 0, visible: true },
    ]));

    useEditorStore.getState().updateDsl((draft) => {
      const segments = [...draft.segments];
      const seg = { ...segments[0] };
      const objects = [...(seg.objects || [])];
      objects[0] = { ...objects[0], position: { ...objects[0].position, x: 99 } };
      seg.objects = objects;
      segments[0] = seg;
      return { ...draft, segments };
    });

    useEditorStore.getState().updateDsl((draft) => {
      const segments = [...draft.segments];
      const seg = { ...segments[0] };
      const objects = [...(seg.objects || [])];
      objects[1] = { ...objects[1], scale: 77 };
      seg.objects = objects;
      segments[0] = seg;
      return { ...draft, segments };
    });

    const final = useEditorStore.getState().dsl!;
    assert.equal(final.segments[0].objects[0].position.x, 99, 'first object x updated');
    assert.equal(final.segments[0].objects[1].scale, 77, 'second object scale updated');
  });

  it('uses current state inside functional setter, not a stale closure', () => {
    useEditorStore.getState().setDsl(makeDsl([
      { id: 'obj-1', type: 'shape', label: 'A', position: { x: 10, y: 20 }, scale: 100, rotation: 0, visible: true },
    ]));

    const firstUpdate = useEditorStore.getState().updateDsl;

    // Apply first update
    firstUpdate((draft) => {
      const segments = [...draft.segments];
      const seg = { ...segments[0] };
      const objects = [...(seg.objects || [])];
      objects[0] = { ...objects[0], position: { ...objects[0].position, x: 55 } };
      seg.objects = objects;
      segments[0] = seg;
      return { ...draft, segments };
    });

    // A second updater queued against the same function reference should still see the latest state
    firstUpdate((draft) => {
      const segments = [...draft.segments];
      const seg = { ...segments[0] };
      const objects = [...(seg.objects || [])];
      objects[0] = { ...objects[0], scale: 123 };
      seg.objects = objects;
      segments[0] = seg;
      return { ...draft, segments };
    });

    const final = useEditorStore.getState().dsl!;
    assert.equal(final.segments[0].objects[0].position.x, 55, 'position from first update preserved');
    assert.equal(final.segments[0].objects[0].scale, 123, 'scale from second update preserved');
  });

  it('records history for undo/redo after edits', () => {
    useEditorStore.getState().setDsl(makeDsl([
      { id: 'obj-1', type: 'shape', label: 'A', position: { x: 10, y: 20 }, scale: 100, rotation: 0, visible: true },
    ]));

    useEditorStore.getState().updateDsl((draft) => {
      const segments = [...draft.segments];
      const seg = { ...segments[0] };
      const objects = [...(seg.objects || [])];
      objects[0] = { ...objects[0], position: { ...objects[0].position, x: 88 } };
      seg.objects = objects;
      segments[0] = seg;
      return { ...draft, segments };
    });

    assert.equal(useEditorStore.getState().dsl!.segments[0].objects[0].position.x, 88);
    assert.equal(useEditorStore.getState().historyPast.length, 1, 'one history entry recorded');

    useEditorStore.getState().undo();
    assert.equal(useEditorStore.getState().dsl!.segments[0].objects[0].position.x, 10, 'undo restores original');

    useEditorStore.getState().redo();
    assert.equal(useEditorStore.getState().dsl!.segments[0].objects[0].position.x, 88, 'redo restores edit');
  });
});