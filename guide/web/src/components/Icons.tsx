interface IconProps {
  size?: number;
  className?: string;
}

const S = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

export function IconPlus({ size = 18, className }: IconProps) {
  return <svg {...S} width={size} height={size} className={className}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>;
}
export function IconX({ size = 18, className }: IconProps) {
  return <svg {...S} width={size} height={size} className={className}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>;
}
export function IconChevronLeft({ size = 18, className }: IconProps) {
  return <svg {...S} width={size} height={size} className={className}><polyline points="15 18 9 12 15 6" /></svg>;
}
export function IconChevronRight({ size = 18, className }: IconProps) {
  return <svg {...S} width={size} height={size} className={className}><polyline points="9 18 15 12 9 6" /></svg>;
}
export function IconPlay({ size = 18, className }: IconProps) {
  return <svg {...S} width={size} height={size} className={className}><polygon points="5 3 19 12 5 21 5 3" /></svg>;
}
export function IconPause({ size = 18, className }: IconProps) {
  return <svg {...S} width={size} height={size} className={className}><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>;
}
export function IconSkipBack({ size = 18, className }: IconProps) {
  return <svg {...S} width={size} height={size} className={className}><polygon points="19 20 9 12 19 4 19 20" /><line x1="5" y1="19" x2="5" y2="5" /></svg>;
}
export function IconSkipForward({ size = 18, className }: IconProps) {
  return <svg {...S} width={size} height={size} className={className}><polygon points="5 4 15 12 5 20 5 4" /><line x1="19" y1="5" x2="19" y2="19" /></svg>;
}
export function IconSave({ size = 18, className }: IconProps) {
  return <svg {...S} width={size} height={size} className={className}><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg>;
}
export function IconUpload({ size = 18, className }: IconProps) {
  return <svg {...S} width={size} height={size} className={className}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>;
}
export function IconDownload({ size = 18, className }: IconProps) {
  return <svg {...S} width={size} height={size} className={className}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>;
}
export function IconTrash({ size = 18, className }: IconProps) {
  return <svg {...S} width={size} height={size} className={className}><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>;
}
export function IconCopy({ size = 18, className }: IconProps) {
  return <svg {...S} width={size} height={size} className={className}><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>;
}
export function IconEdit({ size = 18, className }: IconProps) {
  return <svg {...S} width={size} height={size} className={className}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>;
}
export function IconSettings({ size = 18, className }: IconProps) {
  return <svg {...S} width={size} height={size} className={className}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>;
}
export function IconUser({ size = 18, className }: IconProps) {
  return <svg {...S} width={size} height={size} className={className}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>;
}
export function IconUsers({ size = 18, className }: IconProps) {
  return <svg {...S} width={size} height={size} className={className}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
}
export function IconFilm({ size = 18, className }: IconProps) {
  return <svg {...S} width={size} height={size} className={className}><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" /><line x1="7" y1="2" x2="7" y2="22" /><line x1="17" y1="2" x2="17" y2="22" /><line x1="2" y1="12" x2="22" y2="12" /><line x1="2" y1="7" x2="7" y2="7" /><line x1="2" y1="17" x2="7" y2="17" /><line x1="17" y1="7" x2="22" y2="7" /><line x1="17" y1="17" x2="22" y2="17" /></svg>;
}
export function IconMic({ size = 18, className }: IconProps) {
  return <svg {...S} width={size} height={size} className={className}><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>;
}
export function IconImage({ size = 18, className }: IconProps) {
  return <svg {...S} width={size} height={size} className={className}><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>;
}
export function IconVideo({ size = 18, className }: IconProps) {
  return <svg {...S} width={size} height={size} className={className}><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></svg>;
}
export function IconMusic({ size = 18, className }: IconProps) {
  return <svg {...S} width={size} height={size} className={className}><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>;
}
export function IconType({ size = 18, className }: IconProps) {
  return <svg {...S} width={size} height={size} className={className}><polyline points="4 7 4 4 20 4 20 7" /><line x1="9" y1="20" x2="15" y2="20" /><line x1="12" y1="4" x2="12" y2="20" /></svg>;
}
export function IconLayers({ size = 18, className }: IconProps) {
  return <svg {...S} width={size} height={size} className={className}><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></svg>;
}
export function IconLayout({ size = 18, className }: IconProps) {
  return <svg {...S} width={size} height={size} className={className}><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="9" y1="21" x2="9" y2="9" /></svg>;
}
export function IconGrid({ size = 18, className }: IconProps) {
  return <svg {...S} width={size} height={size} className={className}><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>;
}
export function IconSearch({ size = 18, className }: IconProps) {
  return <svg {...S} width={size} height={size} className={className}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>;
}
export function IconCheck({ size = 18, className }: IconProps) {
  return <svg {...S} width={size} height={size} className={className}><polyline points="20 6 9 17 4 12" /></svg>;
}
export function IconAlertCircle({ size = 18, className }: IconProps) {
  return <svg {...S} width={size} height={size} className={className}><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>;
}
export function IconSun({ size = 18, className }: IconProps) {
  return <svg {...S} width={size} height={size} className={className}><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>;
}
export function IconMoon({ size = 18, className }: IconProps) {
  return <svg {...S} width={size} height={size} className={className}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>;
}
export function IconZap({ size = 18, className }: IconProps) {
  return <svg {...S} width={size} height={size} className={className}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>;
}
export function IconTemplate({ size = 18, className }: IconProps) {
  return <svg {...S} width={size} height={size} className={className}><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="9" y1="21" x2="9" y2="9" /></svg>;
}
export function IconSparkles({ size = 18, className }: IconProps) {
  return <svg {...S} width={size} height={size} className={className}><path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3z" /></svg>;
}
export function IconFileText({ size = 18, className }: IconProps) {
  return <svg {...S} width={size} height={size} className={className}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>;
}
export function IconList({ size = 18, className }: IconProps) {
  return <svg {...S} width={size} height={size} className={className}><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>;
}
export function IconSettings2({ size = 18, className }: IconProps) {
  return <svg {...S} width={size} height={size} className={className}><path d="M20 7h-9" /><path d="M14 17H5" /><circle cx="17" cy="17" r="3" /><circle cx="7" cy="7" r="3" /></svg>;
}
export function IconTarget({ size = 18, className }: IconProps) {
  return <svg {...S} width={size} height={size} className={className}><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></svg>;
}
export function IconEye({ size = 18, className }: IconProps) {
  return <svg {...S} width={size} height={size} className={className}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>;
}
export function IconEyeOff({ size = 18, className }: IconProps) {
  return <svg {...S} width={size} height={size} className={className}><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>;
}
export function IconMaximize({ size = 18, className }: IconProps) {
  return <svg {...S} width={size} height={size} className={className}><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" /></svg>;
}
export function IconClock({ size = 18, className }: IconProps) {
  return <svg {...S} width={size} height={size} className={className}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>;
}
export function IconPalette({ size = 18, className }: IconProps) {
  return <svg {...S} width={size} height={size} className={className}><circle cx="13.5" cy="6.5" r="0.5" fill="currentColor" /><circle cx="17.5" cy="10.5" r="0.5" fill="currentColor" /><circle cx="8.5" cy="7.5" r="0.5" fill="currentColor" /><circle cx="6.5" cy="12.5" r="0.5" fill="currentColor" /><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" /></svg>;
}
export function IconWand({ size = 18, className }: IconProps) {
  return <svg {...S} width={size} height={size} className={className}><path d="M15 4V2" /><path d="M15 16v-2" /><path d="M8 9h2" /><path d="M20 9h2" /><path d="M17.8 11.8L19 13" /><path d="M15 9h0" /><path d="M17.8 6.2L19 5" /><path d="M3 21l9-9" /><path d="M12.2 6.2L11 5" /></svg>;
}
export function IconShoppingBag({ size = 18, className }: IconProps) {
  return <svg {...S} width={size} height={size} className={className}><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 0 1-8 0" /></svg>;
}
export function IconStore({ size = 18, className }: IconProps) {
  return <svg {...S} width={size} height={size} className={className}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>;
}
export function IconHeart({ size = 18, className }: IconProps) {
  return <svg {...S} width={size} height={size} className={className}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>;
}
export function IconStar({ size = 18, className }: IconProps) {
  return <svg {...S} width={size} height={size} className={className}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>;
}
export function IconCpu({ size = 18, className }: IconProps) {
  return <svg {...S} width={size} height={size} className={className}><rect x="4" y="4" width="16" height="16" rx="2" ry="2" /><rect x="9" y="9" width="6" height="6" /><line x1="9" y1="1" x2="9" y2="4" /><line x1="15" y1="1" x2="15" y2="4" /><line x1="9" y1="20" x2="9" y2="23" /><line x1="15" y1="20" x2="15" y2="23" /><line x1="20" y1="9" x2="23" y2="9" /><line x1="20" y1="14" x2="23" y2="14" /><line x1="1" y1="9" x2="4" y2="9" /><line x1="1" y1="14" x2="4" y2="14" /></svg>;
}
export function IconUtensils({ size = 18, className }: IconProps) {
  return <svg {...S} width={size} height={size} className={className}><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" /><path d="M7 2v20" /><path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7" /></svg>;
}
export function IconVolume({ size = 18, className }: IconProps) {
  return <svg {...S} width={size} height={size} className={className}><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" /></svg>;
}
export function IconMousePointer({ size = 18, className }: IconProps) {
  return <svg {...S} width={size} height={size} className={className}><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" /><path d="M13 13l6 6" /></svg>;
}
export function IconArrowRight({ size = 18, className }: IconProps) {
  return <svg {...S} width={size} height={size} className={className}><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>;
}
export function IconRefresh({ size = 18, className }: IconProps) {
  return <svg {...S} width={size} height={size} className={className}><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>;
}
