import type { ReactNode } from 'react';

export default function PanelSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-border pb-4">
      <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}