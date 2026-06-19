/** Adapt HF transition blocks to guide segment-boundary clip model. */

export interface HfTransitionRenderContext {
  segmentId: string;
  transitionType: string;
  clipStart: number;
  clipDuration: number;
  canvasWidth: number;
  canvasHeight: number;
  accentColor: string;
  direction?: 'left' | 'right' | 'up' | 'down';
}

export interface HfTransitionClipOutput {
  html: string;
  css: string;
  script: string;
  timelineId: string;
  requiresGsap: boolean;
}

export const HF_TRANSITION_TYPES = new Set([
  'hf-dissolve',
  'hf-push',
  'hf-push-left',
  'hf-push-right',
  'hf-push-up',
  'hf-push-down',
  'hf-zoom',
]);

export function isHyperframesTransitionType(type: string): boolean {
  return HF_TRANSITION_TYPES.has(String(type || '').trim());
}

export function dslUsesHyperframesTransitions(dsl: {
  globalConfig?: { transition_enabled?: boolean };
  segments?: Array<{ transition?: { type?: string } }>;
}): boolean {
  if (dsl.globalConfig?.transition_enabled === false) return false;
  const segments = dsl.segments || [];
  return segments.some((seg, index) => (
    index < segments.length - 1 && isHyperframesTransitionType(String(seg.transition?.type || ''))
  ));
}

function gsapTimelineScript(timelineId: string, body: string): string {
  return `
    (function(){
      if (typeof gsap === 'undefined') return;
      window.__timelines = window.__timelines || {};
      var timelineId = '${timelineId}';
      var root = document.getElementById('hf-trans-' + timelineId);
      if (!root) return;
      var tl = gsap.timeline({ paused: true });
      ${body}
      tl.seek(0);
      window.__timelines[timelineId] = tl;
    })();
  `;
}

export function renderDissolveTransition(ctx: HfTransitionRenderContext): HfTransitionClipOutput {
  const timelineId = `trans-dissolve-${ctx.segmentId}`;
  const html = `
    <div class="clip hf-transition hf-trans-dissolve" data-hf-component="transitions-dissolve"
         id="hf-trans-${timelineId}" data-timeline-id="${timelineId}"
         data-start="${ctx.clipStart}" data-duration="${ctx.clipDuration}" data-track-index="5"
         style="position:absolute;inset:0;pointer-events:none;z-index:5;overflow:hidden;">
      <div class="dissolve-veil" id="dissolve-veil-${timelineId}" style="position:absolute;inset:0;background:${ctx.accentColor};opacity:0;"></div>
    </div>`;

  const css = `
    .hf-trans-dissolve .dissolve-veil { mix-blend-mode: normal; }
  `;

  const script = gsapTimelineScript(timelineId, `
      var veil = document.getElementById('dissolve-veil-' + timelineId);
      if (!veil) return;
      var half = ${ctx.clipDuration} / 2;
      tl.to(veil, { opacity: 0.85, duration: half, ease: 'power2.in' }, 0);
      tl.to(veil, { opacity: 0, duration: half, ease: 'power2.out' }, half);
  `);

  return { html, css, script, timelineId, requiresGsap: true };
}

export function renderPushTransition(ctx: HfTransitionRenderContext): HfTransitionClipOutput {
  const timelineId = `trans-push-${ctx.segmentId}`;
  const direction = ctx.direction || (ctx.transitionType === 'hf-push-left' ? 'left' : 'right');
  const fromXPercent = direction === 'left' ? -100 : direction === 'right' ? 100 : 0;
  const toXPercent = direction === 'left' ? 100 : direction === 'right' ? -100 : 0;
  const fromYPercent = direction === 'up' ? -100 : direction === 'down' ? 100 : 0;
  const toYPercent = direction === 'up' ? 100 : direction === 'down' ? -100 : 0;
  const useX = direction === 'left' || direction === 'right';
  const fromProp = useX ? fromXPercent : fromYPercent;
  const toProp = useX ? toXPercent : toYPercent;
  const axis = useX ? 'xPercent' : 'yPercent';

  const html = `
    <div class="clip hf-transition hf-trans-push" data-hf-component="transitions-push"
         id="hf-trans-${timelineId}" data-timeline-id="${timelineId}"
         data-start="${ctx.clipStart}" data-duration="${ctx.clipDuration}" data-track-index="5"
         style="position:absolute;inset:0;pointer-events:none;z-index:5;overflow:hidden;">
      <div class="push-panel" id="push-panel-${timelineId}"
           style="position:absolute;inset:0;background:${ctx.accentColor};"></div>
    </div>`;

  const css = `
    .hf-trans-push .push-panel { will-change: transform; }
  `;

  const script = gsapTimelineScript(timelineId, `
      var panel = document.getElementById('push-panel-' + timelineId);
      if (!panel) return;
      var half = ${ctx.clipDuration} / 2;
      var axis = '${axis}';
      var fromVal = ${fromProp};
      var toVal = ${toProp};
      var fromState = {}; fromState[axis] = fromVal;
      var midState = {}; midState[axis] = 0;
      var outState = {}; outState[axis] = toVal;
      tl.fromTo(panel, fromState, Object.assign({ duration: half, ease: 'power3.inOut' }, midState), 0);
      tl.to(panel, Object.assign({ duration: half, ease: 'power3.inOut' }, outState), half);
  `);

  return { html, css, script, timelineId, requiresGsap: true };
}

export function renderZoomTransition(ctx: HfTransitionRenderContext): HfTransitionClipOutput {
  const timelineId = `trans-zoom-${ctx.segmentId}`;
  const html = `
    <div class="clip hf-transition hf-trans-zoom" data-hf-component="transitions-zoom"
         id="hf-trans-${timelineId}" data-timeline-id="${timelineId}"
         data-start="${ctx.clipStart}" data-duration="${ctx.clipDuration}" data-track-index="5"
         style="position:absolute;inset:0;pointer-events:none;z-index:5;overflow:hidden;">
      <div class="zoom-veil" id="zoom-veil-${timelineId}"
           style="position:absolute;inset:0;background:radial-gradient(circle at 50% 50%, ${ctx.accentColor} 0%, rgba(0,0,0,0.55) 100%);opacity:0;transform:scale(0.75);"></div>
    </div>`;

  const css = `
    .hf-trans-zoom .zoom-veil { will-change: transform, opacity; transform-origin: 50% 50%; }
  `;

  const script = gsapTimelineScript(timelineId, `
      var veil = document.getElementById('zoom-veil-' + timelineId);
      if (!veil) return;
      var half = ${ctx.clipDuration} / 2;
      tl.fromTo(veil, { opacity: 0, scale: 0.72 }, { opacity: 0.92, scale: 1, duration: half, ease: 'power2.inOut' }, 0);
      tl.to(veil, { opacity: 0, scale: 1.18, duration: half, ease: 'power2.out' }, half);
  `);

  return { html, css, script, timelineId, requiresGsap: true };
}

function resolvePushDirection(transitionType: string): HfTransitionRenderContext['direction'] {
  const type = String(transitionType || '').trim();
  if (type === 'hf-push-left') return 'left';
  if (type === 'hf-push-right') return 'right';
  if (type === 'hf-push-up') return 'up';
  if (type === 'hf-push-down') return 'down';
  return 'right';
}

export function renderHfTransitionClip(ctx: HfTransitionRenderContext): HfTransitionClipOutput | null {
  const type = String(ctx.transitionType || '').trim();
  if (type === 'hf-dissolve') return renderDissolveTransition(ctx);
  if (type === 'hf-zoom') return renderZoomTransition(ctx);
  if (
    type === 'hf-push'
    || type === 'hf-push-left'
    || type === 'hf-push-right'
    || type === 'hf-push-up'
    || type === 'hf-push-down'
  ) {
    return renderPushTransition({
      ...ctx,
      direction: ctx.direction || resolvePushDirection(type),
    });
  }
  return null;
}

export function buildHfTransitionSeekBootstrap(): string {
  return `
    (function(){
      function seekHfTransitions(time) {
        var timelines = window.__timelines || {};
        document.querySelectorAll('.hf-transition[data-timeline-id]').forEach(function(el) {
          var id = el.getAttribute('data-timeline-id');
          var tl = id ? timelines[id] : null;
          if (!tl || typeof tl.seek !== 'function') return;
          var start = Number(el.getAttribute('data-start') || 0);
          tl.seek(Math.max(0, time - start));
        });
      }
      window.addEventListener('hf-seek', function(ev) {
        var t = ev && ev.detail ? Number(ev.detail.time) : 0;
        if (Number.isFinite(t)) seekHfTransitions(t);
      });
    })();
  `;
}